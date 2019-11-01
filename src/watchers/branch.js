const Promise = require( 'bluebird' );
const path = require( 'path' );
const lockfile = require( 'proper-lockfile' );
const execAsync = require( 'execasync' );

/* const BaseWatcher = require( '../BaseWatcher' );

class BranchWatcher extends BaseWatcher {

	constructor( name, url, options, filterFn, keyFn, workers )
} */
const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'LOCAL_REMOTE': '3jslive', // moraxy
	'REMOTE_REMOTE': 'mrdoob',
	'IDENTITY_FILE': '/home/max/.ssh/id_rsa.5',
	'GIT_EMAIL': '54175649+3jsLive@users.noreply.github.com',
	'GIT_NAME': '3jsLive'
};


const shellOptions = {
	cwd: '/home/max/dev/3js.dev/data/3jsRepository/',
	env: process.env,
	timeout: 60000,
	encoding: 'utf8'
};


function keyFn( data ) {

	return data.sha;

}


function filterFn( branch ) {

	return {
		name: branch.name,
		sha: branch.commit.sha
	};

}


function processUpdate( /* branch */ ) {

	let release;

	// lockfile.lockSync( path.join( shellOptions.cwd, '.git' ), { stale: 600000 } );
	return lockfile.lock( path.join( shellOptions.cwd, '.git' ), { stale: 600000 } )
		.then( r => {

			release = r;

			return execAsync( `git fetch --all`, shellOptions );

		} )
		.then( fetch => {

			console.log( fetch.code, fetch.stdout, fetch.stdout );

			return execAsync( `git pull ${config.REMOTE_REMOTE} dev`, shellOptions );

		} )
		.then( pull => {

			console.log( pull.code, pull.stdout, pull.stderr );

			// --ancestry-path
			return execAsync( `git rev-list --reverse ${config.LOCAL_REMOTE}/dev..${config.REMOTE_REMOTE}/dev`, shellOptions );

		} )
		.then( revlist => {

			console.log( revlist.code, revlist.stdout, revlist.stderr );

			return Promise.mapSeries( revlist.stdout.trim().split( /\n/g ), ( line, idx, arrLen ) => {

				const counter = `${idx}/${arrLen}`;

				if ( /^[a-f0-9]{40}$/i.test( line ) !== true ) {

					console.log( `${counter}: Not a valid SHA '${line}'` );
					return;

				}

				return execAsync( `GIT_SSH_COMMAND="ssh -i ${config.IDENTITY_FILE}" git -c user.email='${config.GIT_EMAIL}' -c user.name='${config.GIT_NAME}' push --force --verbose ${config.LOCAL_REMOTE} ${line}:dev`, shellOptions )
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


module.exports = {
	keyFn,
	filterFn,
	url: `/repos/${config.REPOSITORY}/branches`,
	name: 'branchMirror',
	workers: [ { name: 'processUpdate', fn: processUpdate } ]
};
