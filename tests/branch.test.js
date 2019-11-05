// const fs = require( 'fs' );

const assert = require( 'assert' );


const BaseWatcher = require( `../src/BaseWatcher` );
const watcherClass = require( '../src/watchers/branch' );

// const testApiReply = `${__dirname}/data/github-api/branches.json`;
// const testExecReturns = `${__dirname}/data/execReturns/branches.json`;
// const gold = JSON.parse( fs.readFileSync( `${__dirname}/data/golds/branch.json`, 'utf8' ) );


const execReturnsSuccess = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'pull': { code: 0, stdout: '', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' }
};


describe( `branchMirrorWatcher`, function () {

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

	before( 'rig locking: always works', function () {

		BaseWatcher.lockRepository = () => Promise.resolve( true );
		BaseWatcher.unlockRepository = () => Promise.resolve( true );

	} );

	it( 'successful worker run: 3 branch updates', function ( done ) {

		rewireExec( execReturnsSuccess );

		// analyze
		watcher.processUpdate()
			.then( result => assert.equal( result, 3 /* execReturnsSuccess.revlist.stdout.trim().split( '/\n/g' ).length */ ) )
			.then( () => done() );

	} );

} );
