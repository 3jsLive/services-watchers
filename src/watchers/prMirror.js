const Promise = require( 'bluebird' );
const lockfile = require( 'proper-lockfile' );
const BaseWatcher = require( '../BaseWatcher' );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'LOCAL_REMOTE': '3jslive', // moraxy
	'REMOTE_REMOTE': 'mrdoob',
	'CACHE_DIR': '/home/max/dev/3js.dev/cache/watchers',
	'IDENTITY_FILE': '/home/max/.ssh/id_rsa.5',
	'LOCAL_REPO': '/home/max/dev/3js.dev/data/3jsRepository/.git'
};

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

		super( 'pullrequestsMirror', `/repos/${config.REPOSITORY}/pulls` );

		this.workers = [ { name: 'processCommits', fn: this.processCommits } ]; // FIXME: can't have 'this' in super calls yet

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
		let release;

		// lock the git directory, otherwise we might run into problems with the branch poller
		return lockfile.lock( config.LOCAL_REPO, { stale: 600000, update: 30000, retries: 3 } )
			.then( r => {

				release = r;

				// update all references
				return BaseWatcher.exec( `git fetch --all` );

			} )
			.then( fetch => {

				console.log( { fetch } );

				// create the new pr-branch, if it didn't exist yet, and check it out
				return BaseWatcher.exec( `git checkout --track ${config.REMOTE_REMOTE}/pr/${pr.id}` );

			} )
			.catch( err => {

				console.error( 'checkout failed:', err );

				return 'checkout failed';

			} )
			.then( checkout => {

				console.log( { checkout } );

				// check if the remote repo already has that pr-branch
				return BaseWatcher.exec( `git ls-remote --heads ${config.LOCAL_REMOTE} 'refs/heads/pr/${pr.id}'` );

			} )
			.then( existingBranch => {

				console.log( { existingBranch } );

				if ( existingBranch.stdout.trim().length === 0 ) {

					console.log( 'does not exist yet on remote or error' );

					// *** attempt to find merge-base
					return BaseWatcher.exec( `git show-branch --merge-base pr/${pr.id} dev` )
						.then( mergeBase => mergeBase.stdout.trim() )
						.then( mergeBase => {

							console.log( 'merge base?', mergeBase );

							return BaseWatcher.exec( `git rev-list --reverse ${mergeBase}..${config.REMOTE_REMOTE}/pr/${pr.id}` )
								.then( revlist => {

									console.log( { revlist } );

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
					return BaseWatcher.exec( `git rev-list --reverse ${config.LOCAL_REMOTE}/pr/${pr.id}..${config.REMOTE_REMOTE}/pr/${pr.id}` )
						.then( revlist => {

							console.log( { revlist } );

							// push each intermediate commit individually to trigger CI
							let individualRevs = revlist.stdout.trim().split( /\n/g );
							if ( individualRevs.length > 50 )
								individualRevs = individualRevs.slice( - 50 );

							return individualRevs;

						} );

				}

			} )
			.then( individualRevs => {

				return Promise.mapSeries( individualRevs, ( line, idx, arrLen ) => {

					const counter = `${idx + 1}/${arrLen}`;

					if ( /^[a-f0-9]{40}$/i.test( line ) !== true ) {

						console.log( `${counter}: Not a valid SHA '${line}'` );
						return;

					}

					// no dupes
					if ( this.cache.getKey( `commit ${line}` ) ) {

						console.log( `${counter}: Already processed '${line}'` );
						return;

					}

					return BaseWatcher.exec( `GIT_SSH_COMMAND="ssh -i ${config.IDENTITY_FILE}" git push --force --verbose ${config.LOCAL_REMOTE} ${line}:refs/heads/pr/${pr.id}` )
						.then( push => {

							console.log( { push } );

							updates ++;
							console.log( `${counter}: +++ ${updates}` );

							this.cache.setKey( `commit ${line}`, true );
							this.cache.save( true );

							return true;

						} );

				} );

			} )
			.then( result => {

				console.log( { result } );

				return BaseWatcher.exec( `git checkout dev` )
					.then( () => console.log( '--- updates', updates ) )
					.then( () => release() )
					.then( () => updates );

			} )
			.catch( err => {

				console.error( 'Something went wrong in prMirror:', err );

				return BaseWatcher.exec( `git checkout dev` )
					.then( () => console.log( '--- updates', updates ) )
					.then( () => release() )
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
