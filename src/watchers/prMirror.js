const Promise = require( 'bluebird' );
const BaseWatcher = require( '../BaseWatcher' );
const config = require( 'rc' )( '3cidev' );


/**
 * @typedef {Object} PullRequest
 * @property {number} id
 * @property {string} state
 * @property {string} title
 * @property {string} created
 * @property {string} updated
 * @property {string} sha
 * @property {string} ref
 */


class PrMirrorWatcher extends BaseWatcher {

	constructor() {

		super( 'pullrequestsMirror', `/repos/${config.upstreamGithubPath}/pulls` );

		this.workers = [ { name: 'processCommits', fn: this.processCommits } ];

	}

	keyFn( data ) {

		return `${data.id} ${data.updated}`;

	}

	filterFn( pr ) {

		return {
			"id": pr.number,
			"state": ( pr.merged_at ) ? 'merged' : pr.state,
			"title": pr.title,
			"author": pr.user.login,
			"created": pr.created_at,
			"updated": pr.updated_at
		};

	}

	/**
	 * @param {PullRequest} pr
	 */
	processCommits( pr ) {

		let updates = 0;

		// lock the git directory, otherwise we might run into problems with the branch poller
		return BaseWatcher.lockRepository()
			.then( () => {

				// update all references
				return this.exec( `git fetch --all` );

			} )
			.then( fetch => {

				this.logger.debug( { fetch } );

				// create the new pr-branch, if it didn't exist yet, and check it out
				return this.exec( `git checkout --track ${config.remoteRemote}/pr/${pr.id}` );

			} )
			.catch( err => {

				this.logger.error( 'checkout failed: %o', err );

				return err;

			} )
			.then( checkout => {

				this.logger.debug( { checkout } );

				// check if the remote repo already has that pr-branch
				return this.exec( `git ls-remote --heads ${config.localRemote} 'refs/heads/pr/${pr.id}'` );

			} )
			.then( existingBranch => {

				this.logger.debug( { existingBranch } );

				if ( existingBranch.stdout.trim().length === 0 ) {

					this.logger.debug( 'does not exist yet on remote or error' );

					// *** attempt to find merge-base
					return this.exec( `git show-branch --merge-base pr/${pr.id} dev` )
						.then( mergeBase => mergeBase.stdout.trim() )
						.then( mergeBase => {

							this.logger.debug( 'merge base?', mergeBase );

							return this.exec( `git rev-list --reverse ${mergeBase}..${config.remoteRemote}/pr/${pr.id}` )
								.then( revlist => {

									this.logger.debug( { revlist } );

									// push each intermediate commit individually to trigger CI
									let individualRevs = revlist.stdout.trim().split( /\n/g );

									// individualRevs.unshift( mergeBase );

									if ( individualRevs.length > 50 )
										individualRevs = individualRevs.slice( - 50 );

									return individualRevs;

								} );

						} );

				} else {

					// list differences between gold-pr-branch and ours
					// --ancestry-path
					return this.exec( `git rev-list --reverse ${config.localRemote}/pr/${pr.id}..${config.remoteRemote}/pr/${pr.id}` )
						.then( revlist => {

							this.logger.debug( { revlist } );

							// push each intermediate commit individually to trigger CI
							let individualRevs = revlist.stdout.trim().split( /\n/g );
							if ( individualRevs.length > 50 )
								individualRevs = individualRevs.slice( - 50 );

							return individualRevs;

						} );

				}

			} )
			.then( individualRevs => {

				return Promise.mapSeries( individualRevs.filter( rev => rev.length === 40 ), ( line, idx, arrLen ) => {

					const counter = `${idx + 1}/${arrLen}`;

					if ( /^[a-f0-9]{40}$/i.test( line ) !== true ) {

						this.logger.debug( `${counter}: Not a valid SHA '${line}'` );
						return;

					}

					// no dupes
					if ( this.cache.getKey( `commit ${line}` ) ) {

						this.logger.debug( `${counter}: Already processed '${line}'` );
						return;

					}

					return this.exec( `GIT_SSH_COMMAND="ssh -i ${config.watchers.identityFile}" git push --force --verbose ${config.localRemote} ${line}:refs/heads/pr/${pr.id}` )
						.then( push => {

							this.logger.debug( { push } );

							updates ++;
							this.logger.debug( `${counter}: +++ ${updates}` );

							this.cache.setKey( `commit ${line}`, true );
							this.cache.save( true );

							return true;

						} );

				} );

			} )
			.then( result => {

				this.logger.debug( { result } );

				return this.exec( `git checkout dev` )
					.then( () => this.logger.debug( '--- updates', updates ) )
					.then( () => BaseWatcher.unlockRepository() )
					.then( () => updates );

			} )
			.catch( err => {

				this.logger.error( 'Something went wrong in prMirror:', err );

				return this.exec( `git checkout dev` )
					.then( () => this.logger.debug( '--- updates', updates ) )
					.then( () => BaseWatcher.unlockRepository() )
					.then( () => updates );

			} );

	}

}




/**
 * @param {PullRequest} pr
 * @param {number} apiPage Which page of results to return
 */
/*async function workerReviews( pr, apiPage = 1 ) {

	const logger = signale.scope( `pollingPR ${pr.id} reviews ${apiPage}` );

	if ( apiPage > 100 ) {

		logger.error( 'apiPage > 100', apiPage );

		return 0;

	}

	const etagKey = `etag reviews ${pr.id} ${apiPage}`;

	let etag = ( prsCache.getKey( etagKey ) || { etag: 0 } ).etag;
	logger.debug( 'etag', etag );

	const options = {
		url: `/repos/${config.REPOSITORY}/pulls/${pr.id}/reviews`,
		qs: {
			page: apiPage
		},
		headers: {
			"If-None-Match": etag || 0
		}
	};

	let response;

	try {

		response = await githubApiRequest( options );

	} catch ( err ) {

		logger.error( `Request error: ${err}` );

		return 0;

	}

	//check if it is the same response as before and quit if it is
	if ( etag === response.headers.etag )
		return 0;
	else
		etag = response.headers.etag;

	logger.debug( 'changes detected' );

	prsCache.setKey( etagKey, { etag } );
	prsCache.save( true );

	const body = JSON.parse( response.body );
	let reviews = [];

	if ( body ) {

		reviews = body.map( review => {

			return { pr, review };

		} );

		if ( reviews.length === 100 )
			reviews.push( ...( await workerReviews( pr, apiPage + 1 ) ) );

		logger.debug( `Got ${reviews.length} reviews` );

	} else {

		logger.error( 'No body' );

	}

	if ( apiPage === 1 ) {

		fs.writeFileSync( `reviews_${pr.id}_${pr.updated}.json`, JSON.stringify( reviews ), 'utf8' );

		return Promise.resolve( reviews.length );

	} else {

		return Promise.resolve( reviews );

	}

} */

// mirror PRs from mrdoob/three.js to our repo while also
// splitting them up into one-commit-per-push
// BaseWatcher.pollAsync( new PrMirrorWatcher().polling(), 5000 );


module.exports = PrMirrorWatcher;
