const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );
const BaseWatcher = require( '../BaseWatcher' );
const Database = require( 'better-sqlite3' );
const path = require( 'path' );
const config = require( 'rc' )( '3jsdev' );


const githubApiRequest = request.defaults( {
	baseUrl: 'https://api.github.com',
	qs: {
		'per_page': 100
	},
	headers: {
		'User-Agent': config.watchers.userAgent,
		'Authorization': `token ${process.env.GITHUB_TOKEN}`
	},
	timeout: 15000
} );

class PullrequestsWatcher extends BaseWatcher {

	constructor() {

		super( 'pullrequestsAPIStuff', `/repos/${config.upstreamGithubPath}/pulls` );

		this.workers = [ { name: 'savePRState', fn: this.savePRState } ];

		this.db = new Database( path.join( config.root, config.watchers.dataPath, config.watchers.databases.live ), { fileMustExist: true } );
		this.sqlInsertCommit = this.db.prepare( `INSERT OR REPLACE INTO commits ('sha', 'ref', 'author', 'message', 'authored_at') VALUES ( ?, ?, ?, ?, ? )` );
		this.sqlInsertPullrequest = this.db.prepare( `INSERT OR REPLACE INTO pullrequests ('number', 'state', 'title', 'author', 'created_at', 'updated_at')
		VALUES ( ?, ?, ?, ?, ?, ? )` );

	}

	keyFn( data ) {

		return `${data.number} ${data.updated}`;

	}

	filterFn( pr ) {

		return {
			"number": pr.number,
			"state": ( pr.merged_at ) ? 'merged' : pr.state,
			"title": pr.title,
			"author": pr.user.login,
			"created": pr.created_at,
			"updated": pr.updated_at
		};

	}

	async savePRState( data ) {

		this.logger.debug( `State for #${data.number}: "${data.state}"` );

		// update commits (even if nothing changed like open->closed)
		const commits = await this._getAllCommits( data, 1 );
		this._updateCommits( data, commits );

		// update metadata
		this._updateMeta( data );

		return commits.length;

	}


	_updateCommits( data, commits ) {

		commits.forEach( c => {

			// 'sha', 'ref', 'author', 'message', 'authored_at'
			this.sqlInsertCommit.run( c.sha, `pr/${data.number}`, ( c.author.login ) ? c.author.login : c.author, c.message, c.authored_at );

		} );

	}


	_updateMeta( data ) {

		// 'number', 'state', 'title', 'author', 'created_at', 'updated_at'
		this.sqlInsertPullrequest.run( data.number, data.state, data.title, data.author, data.created, data.updated );

	}


	/**
	 * @param {number} apiPage Which page of results to return
	 */
	async _getAllCommits( data, apiPage = 1 ) {

		if ( apiPage > 100 ) {

			this.logger.error( 'apiPage > 100', apiPage );

			return [];

		}

		const cacheKey = `etag commits ${data.number} page ${apiPage}`;
		let etag = ( this.cache.getKey( cacheKey ) ) ? this.cache.getKey( cacheKey ).etag : 0;

		const options = {
			url: `/repos/${config.upstreamGithubPath}/pulls/${data.number}/commits`,
			qs: {
				page: apiPage
			},
			headers: {
				"If-None-Match": etag
			}
		};


		let response;

		try {

			response = await githubApiRequest( options );

		} catch ( err ) {

			this.logger.error( `Request error: ${err}` );

			return [];

		}

		// console.log( 'headers of', apiPage, response.headers, response.body );

		//check if it is the same response as before and quit if it is
		if ( etag === response.headers.etag ) {

			this.logger.debug( 'no new commits, same etag' );
			return [];

		} else
			etag = response.headers.etag;

		this.logger.debug( 'changes detected, new etag' );

		this.cache.setKey( cacheKey, { etag } );
		this.cache.save( true );

		const body = JSON.parse( response.body );
		let commits = [];

		if ( body ) {

			commits = body.map( commit => {

				return {
					sha: commit.sha,
					author: ( commit.author && commit.author.id ) ? {
						id: commit.author.id,
						login: commit.author.login,
						gravatar_id: commit.author.gravatar_id,
						avatar_url: commit.author.avatar_url,
						url: commit.author.url,
					} : commit.commit.author.name,
					message: commit.commit.message,
					authored_at: ( commit.commit.author && commit.commit.author.date ) ? commit.commit.author.date : ''
				};

			} );

			if ( commits.length === 100 ) {

				this.logger.debug( 'More than 100 commits on page', apiPage );
				commits.push( ...( await this._getAllCommits( data, apiPage + 1 ) ) );

			}

			this.logger.debug( `Got ${commits.length} commits` );

		} else {

			this.logger.error( 'No body' );

		}

		// fs.writeFileSync( `events_raw_${etag}-${apiPage}.json`, JSON.stringify( events ), 'utf8' );
		this.logger.debug( 'done, returning', commits.length, 'commits' );
		return commits;

	}

}

// pullrequests watcher is the small-scale watcher behind 3jslive
// keeping the PR database up to date and that's about it
// BaseWatcher.pollAsync( new PullrequestsWatcher().polling(), 5000 );

module.exports = PullrequestsWatcher;
