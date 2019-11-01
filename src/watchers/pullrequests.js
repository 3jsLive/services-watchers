const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );

const Database = require( 'better-sqlite3' );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'DATABASE': '/home/max/dev/3js.dev/data/watchers/trackedPRs.db',
	'BUILDS_PATH': ''
};


const db = new Database( config.DATABASE, { fileMustExist: true } );
const sqlInsertCommit = db.prepare( `INSERT OR REPLACE INTO commits ('sha', 'ref', 'author', 'message', 'authored_at') VALUES ( ?, ?, ?, ?, ? )` );
const sqlInsertPullrequest = db.prepare( `INSERT OR REPLACE INTO pullrequests ('number', 'state', 'title', 'author', 'created_at', 'updated_at')
VALUES ( ?, ?, ?, ?, ?, ? )` );


const githubApiRequest = request.defaults( {
	baseUrl: 'https://api.github.com',
	qs: {
		'per_page': 100
	},
	headers: {
		'User-Agent': config.USER_AGENT,
		'Authorization': `token ${config.GITHUB_TOKEN}`
	},
	timeout: 15000
} );


function keyFn( data ) {

	return `${data.number} ${data.updated}`;

}

function filterFn( pr ) {

	return {
		"number": pr.number,
		"state": ( pr.merged_at ) ? 'merged' : pr.state,
		"title": pr.title,
		"author": pr.user.login,
		"created": pr.created_at,
		"updated": pr.updated_at
	};

}


async function savePRState( data, cache ) {

	console.log( `State for #${data.number}: "${data.state}"` );

	// update commits (even if nothing changed like open->closed)
	const commits = await _getAllCommits( data, cache, 1 );
	_updateCommits( data, commits );

	// update metadata
	_updateMeta( data );

	return commits.length;

}


function _updateCommits( data, commits ) {

	commits.forEach( c => {

		// 'sha', 'ref', 'author', 'message', 'authored_at'
		sqlInsertCommit.run( c.sha, `pr/${data.number}`, ( c.author.login ) ? c.author.login : c.author, c.message, c.authored_at );

	} );

}


function _updateMeta( data ) {

	// 'number', 'state', 'title', 'author', 'created_at', 'updated_at'
	sqlInsertPullrequest.run( data.number, data.state, data.title, data.author, data.created, data.updated );

}


/**
 * @param {number} apiPage Which page of results to return
 */
async function _getAllCommits( data, cache, apiPage = 1 ) {

	if ( apiPage > 100 ) {

		console.error( 'apiPage > 100', apiPage );

		return [];

	}

	const cacheKey = `etag commits ${data.number} page ${apiPage}`;
	let etag = ( cache.getKey( cacheKey ) ) ? cache.getKey( cacheKey ).etag : 0;

	const options = {
		url: `/repos/${config.REPOSITORY}/pulls/${data.number}/commits`,
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

		console.error( `Request error: ${err}` );

		return [];

	}

	// console.log( 'headers of', apiPage, response.headers, response.body );

	//check if it is the same response as before and quit if it is
	if ( etag === response.headers.etag ) {

		console.log( 'no new commits, same etag' );
		return [];

	} else
		etag = response.headers.etag;

	console.log( 'changes detected, new etag' );

	cache.setKey( cacheKey, { etag } );
	cache.save( true );

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

			console.log( 'More than 100 commits on page', apiPage );
			commits.push( ...( await _getAllCommits( data, cache, apiPage + 1 ) ) );

		}

		console.log( `Got ${commits.length} commits` );

	} else {

		console.error( 'No body' );

	}

	// fs.writeFileSync( `events_raw_${etag}-${apiPage}.json`, JSON.stringify( events ), 'utf8' );
	console.log( 'done, returning', commits.length, 'commits' );
	return commits;

}


module.exports = {
	keyFn,
	filterFn,
	url: `/repos/${config.REPOSITORY}/pulls`,
	name: 'pullrequestsAPIStuff',
	workers: [
		/* { name: 'timeline', fn: processTimeline } */
		{ name: 'savePRState', fn: savePRState }
	]
};
