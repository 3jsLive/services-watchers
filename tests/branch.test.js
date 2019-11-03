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

	this.statuses = [];
	this.fakeCallback = ( message ) => this.statuses.push( message );

	before( 'rig execAsync', function () {

		// take the git subcommand and reply with the stored ExecReturns
		BaseWatcher.exec = ( command ) => {

			const split = command.split( / /g );
			const subCommandIndex = split.findIndex( s => s === 'git' ) + 1;
			const subCommand = split[ subCommandIndex ];

			const reply = execReturnsSuccess[ subCommand ];

			// console.log( `Intercepted '%s' => '%s' and replying with '%o'`, command, subCommand, reply );

			return Promise.resolve( reply );

		};

	} );

	it( 'successful worker run: 3 branch updates', function ( done ) {

		// analyze
		const watcher = new watcherClass();
		watcher.processUpdate()
			.then( result => assert.equal( result, 3 /* execReturnsSuccess.revlist.stdout.trim().split( '/\n/g' ).length */ ) )
			.then( () => done() );

	} );

} );
