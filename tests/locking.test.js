const assert = require( 'assert' );
const Promise = require( 'bluebird' );

const BaseWatcher = require( `../src/BaseWatcher` );
const prMirrorClass = require( '../src/watchers/prMirror' );
const branchMirrorClass = require( '../src/watchers/branch' );


const pr = {
	"id": 12345
};

// branch
const execReturns_Success = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'pull': { code: 0, stdout: '', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' }
};

// pr
const execReturns_PrNew_DoesNotExistOnRemote_Success = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'checkout': { code: 0, stdout: '', stderr: '' },
	'ls-remote': { code: 0, stdout: '', stderr: '' },
	'show-branch': { code: 0, stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: '5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' }
};


describe( `locking`, function () {

	const branchWatcher = new branchMirrorClass();
	const prWatcher = new prMirrorClass();


	before( 'rig cache: always miss', function () {

		prWatcher.cache = {
			getKey: () => false,
			save: () => true,
			setKey: () => true
		};

	} );

	describe( 'locking succeeds', function () {

		before( 'rig locking', function () {

			BaseWatcher.originalLockFn = BaseWatcher.lockRepository;
			BaseWatcher.lockRepository = () => BaseWatcher.originalLockFn( `${__dirname}/locking.test.js`, 10000 ); // hacky

		} );


		before( 'rig execs', function () {

			function splitter( command ) {

				const split = command.split( / /g );
				const subCommandIndex = split.findIndex( s => s === 'git' ) + 1;
				return split[ subCommandIndex ];

			}

			branchWatcher.exec = ( command ) => {

				const reply = execReturns_Success[ splitter( command ) ];

				return Promise.resolve( reply ).delay( 5000 ); // every command takes at least 5 seconds

			};

			prWatcher.exec = ( command ) => {

				const reply = execReturns_PrNew_DoesNotExistOnRemote_Success[ splitter( command ) ];

				return Promise.resolve( reply ).delay( 1000 ); // every command takes at least 1 second

			};

		} );


		// it( 'Branch first w/ 5s delays, then PR w/ 1s delays', function ( done ) {

		// 	this.timeout( 60000 );

		// 	const branchStart = new Date().getTime();
		// 	let branchEnd;
		// 	let PRstart;
		// 	let PRend;

		// 	branchWatcher.processUpdate()
		// 		.then( result => {

		// 			branchEnd = new Date().getTime();

		// 			assert.ok( branchStart < branchEnd );
		// 			assert.strictEqual( result, 3 );

		// 			return result;

		// 		} )
		// 		.then( () => {

		// 			PRstart = new Date().getTime();

		// 			return prWatcher.processCommits( pr );

		// 		} )
		// 		.then( result => {

		// 			PRend = new Date().getTime();

		// 			assert.strictEqual( result, 2 );

		// 			assert.ok( branchEnd <= PRstart );
		// 			assert.ok( PRstart < PRend );

		// 			return result;

		// 		} )
		// 		.then( () => done() );

		// } );

		it( 'Both via Promise.all', function ( done ) {

			this.timeout( 60000 );

			Promise.all( [
				branchWatcher.processUpdate(),
				prWatcher.processCommits( pr )
			] )
				.then( () => done() );

		} );

		/* function pollAsync( func, delay = 0, timeout = 30000 ) {

			const fullfilled = () => {

				return Promise
					.delay( delay )
					.then( () => pollAsync( func, delay ) )
					.timeout( timeout )
					.catch( Promise.TimeoutError, () => console.log( 'pollAsync timed out' ) )
					.catch( err => console.error( 'Something went wrong during polling:', err ) );

			};

			func()
				.then( fullfilled )
				.catch( fullfilled );

		} */

		/* it( 'async', function ( done ) {

			this.timeout( 20000 );

			// keep our fork's branches in sync with upstreams and split up any
			// multi-commit push into individual pushes so CI gets triggered on all of them
			pollAsync( branchWatcher.polling( () => {} ), 5000 );

			// mirror PRs from mrdoob/three.js to our repo while also
			// splitting them up into one-commit-per-push
			pollAsync( prWatcher.polling( () => {} ), 5000 );

			setTimeout( () => done(), 18000 );

		} ); */

	} );

} );
