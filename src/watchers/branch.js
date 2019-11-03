const Promise = require( 'bluebird' );
const lockfile = require( 'proper-lockfile' );
const BaseWatcher = require( '../BaseWatcher' );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'LOCAL_REMOTE': '3jslive', // moraxy
	'REMOTE_REMOTE': 'mrdoob',
	'IDENTITY_FILE': '/home/max/.ssh/id_rsa.5',
	'LOCAL_REPO': '/home/max/dev/3js.dev/data/3jsRepository/.git'
};


class BranchWatcher extends BaseWatcher {

	constructor() {

		super( 'branchMirror', `/repos/${config.REPOSITORY}/branches` );

		this.workers = [ { name: 'processUpdate', fn: this.processUpdate } ];

	}

	keyFn( data ) {

		return data.sha;

	}

	filterFn( branch ) {

		return {
			name: branch.name,
			sha: branch.commit.sha
		};

	}

	processUpdate( /* branch */ ) {

		let release;

		return lockfile.lock( config.LOCAL_REPO, { stale: 600000, update: 30000, retries: 3 } )
			.then( r => {

				release = r;

				return BaseWatcher.exec( `git fetch --all` );

			} )
			.then( fetch => {

				console.log( fetch.code, fetch.stdout, fetch.stdout );

				return BaseWatcher.exec( `git pull ${config.REMOTE_REMOTE} dev` );

			} )
			.then( pull => {

				console.log( pull.code, pull.stdout, pull.stderr );

				// --ancestry-path
				return BaseWatcher.exec( `git rev-list --reverse ${config.LOCAL_REMOTE}/dev..${config.REMOTE_REMOTE}/dev` );

			} )
			.then( revlist => {

				console.log( revlist.code, revlist.stdout, revlist.stderr );

				return Promise.mapSeries( revlist.stdout.trim().split( /\n/g ), ( line, idx, arrLen ) => {

					const counter = `${idx}/${arrLen}`;

					if ( /^[a-f0-9]{40}$/i.test( line ) !== true ) {

						console.log( `${counter}: Not a valid SHA '${line}'` );
						return;

					}

					return BaseWatcher.exec( `GIT_SSH_COMMAND="ssh -i ${config.IDENTITY_FILE}" git push --force --verbose ${config.LOCAL_REMOTE} ${line}:dev` )
						.then( push => {

							console.log( `${counter}`, push.code, push.stdout, push.stderr );

							return push;

						} )
						.catch( err => console.error( err ) );

				} );

			} )
			.then( results => {

				console.log( 'Push results:', results );

				return release()
					.then( () => results.filter( r => r.code === 0 ).length );

			} )
			.catch( err => {

				console.error( 'Branch worker failure:', err );

				return release();

			} );

	}

}

// keep our fork's branches in sync with upstreams and split up
// any multi-commit push into individual pushes so CI gets triggered
// on all of them
// BaseWatcher.pollAsync( new BranchWatcher().polling(), 5000 );

module.exports = BranchWatcher;
