// const fs = require( 'fs' );

const assert = require( 'assert' );


const BaseWatcher = require( `../src/BaseWatcher` );
const watcherClass = require( '../src/watchers/prMirror' );

// const testApiReply = `${__dirname}/data/github-api/branches.json`;
// const testExecReturns = `${__dirname}/data/execReturns/branches.json`;
// const gold = JSON.parse( fs.readFileSync( `${__dirname}/data/golds/branch.json`, 'utf8' ) );


const pr = {
	"id": 12345
};

const execReturns_PrUpdate_DoesNotExistOnRemote_Success = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'checkout': [
		{ code: 128, stdout: '', stderr: `fatal: Branch 'pr/${pr.id}' already exists.` },
		{ code: 0, stdout: '', stderr: `` }
	],
	'ls-remote': { code: 0, stdout: '', stderr: '' },
	'show-branch': { code: 0, stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: '5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' }
};

const execReturns_PrUpdate_DoesExistOnRemote_Success = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'checkout': [
		{ code: 128, stdout: '', stderr: `fatal: Branch 'pr/${pr.id}' already exists.` },
		{ code: 0, stdout: '', stderr: `` }
	],
	'ls-remote': { code: 0, stdout: '68d6831fab24f94cd5fd3cef028c18ef6099b55b\trefs/heads/pr/12345\n', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' }
};

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



describe( `pullrequestsMirrorWatcher`, function () {

	const watcher = new watcherClass();

	const rewireExec = ( responses ) => {

		let responsesCopy = JSON.parse( JSON.stringify( responses ) );

		// take the git subcommand and reply with the stored ExecReturns
		watcher.exec = ( command ) => {

			const split = command.split( / /g );
			const subCommandIndex = split.findIndex( s => s === 'git' ) + 1;
			const subCommand = split[ subCommandIndex ];

			const reply = ( Array.isArray( responsesCopy[ subCommand ] ) === true ) ? responsesCopy[ subCommand ].shift() : responsesCopy[ subCommand ];

			// console.log( `Intercepted '%s' => '%s' and replying with '%o'`, command, subCommand, reply );

			if ( reply.code !== 0 )
				return Promise.reject( reply );
			else
				return Promise.resolve( reply );

		};

	};


	before( 'rig cache: always miss', function () {

		watcher.cache = {
			getKey: () => false,
			save: () => true,
			setKey: () => true
		};

	} );

	describe( 'locking always successful', function () {

		before( 'rig locking: always works', function () {

			BaseWatcher.lockRepository = () => Promise.resolve( true );
			BaseWatcher.unlockRepository = () => Promise.resolve( true );

		} );

		it( 'successful worker run: PR update, not yet on remote', function ( done ) {

			rewireExec( execReturns_PrUpdate_DoesNotExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 2 ) )
				.then( () => done() );

		} );

		it( 'successful worker run: PR update, already on remote', function ( done ) {

			rewireExec( execReturns_PrUpdate_DoesExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 3 ) )
				.then( () => done() );

		} );

		it( 'successful worker run: PR new, not yet on remote', function ( done ) {

			rewireExec( execReturns_PrNew_DoesNotExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 2 ) )
				.then( () => done() );

		} );

	} );

	describe( 'locking always fails', function () {

		before( 'rig locking: always fails', function () {

			BaseWatcher.lockRepository = () => {

				return Promise.reject( { code: 128, stdout: '', stderr: `locking failed` } );

			};

			BaseWatcher.unlockRepository = () => {

				return Promise.resolve( false );

			};

		} );

		it( 'successful worker run: PR update, not yet on remote', function ( done ) {

			rewireExec( execReturns_PrUpdate_DoesNotExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 2 ) )
				.then( () => done() );

		} );

		it( 'successful worker run: PR update, already on remote', function ( done ) {

			rewireExec( execReturns_PrUpdate_DoesExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 3 ) )
				.then( () => done() );

		} );

		it( 'successful worker run: PR new, not yet on remote', function ( done ) {

			rewireExec( execReturns_PrNew_DoesNotExistOnRemote_Success );

			watcher.processCommits( pr )
				.then( result => assert.equal( result, 2 ) )
				.then( () => done() );

		} );

	} );

} );
