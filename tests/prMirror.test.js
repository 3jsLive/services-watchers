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
	'checkout': { code: 1, stdout: '', stderr: `fatal: Branch 'pr/${pr.id}' already exists.` },
	'ls-remote': { code: 0, stdout: '', stderr: '' },
	'show-branch': { code: 0, stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n', stderr: '' }, // test with no reply as well
	'rev-list': {
		code: 0,
		stdout: '5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' } // might fail
};

const execReturns_PrUpdate_DoesExistOnRemote_Success = {
	'fetch': { code: 0, stdout: '', stderr: '' },
	'checkout': { code: 1, stdout: '', stderr: `fatal: Branch 'pr/${pr.id}' already exists.` },
	'ls-remote': { code: 0, stdout: '68d6831fab24f94cd5fd3cef028c18ef6099b55b\trefs/heads/pr/12345\n', stderr: '' },
	'rev-list': {
		code: 0,
		stdout: 'd1813701bd93511f217aa3d77203e0ec8e1e0101\n5a519912e4f4392b5b720c34535edaf325b766c5\ne7155f214f5006dd34addee79db2c8e32e00616b\n',
		stderr: ''
	},
	'push': { code: 0, stdout: '', stderr: '' } // might fail
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


function rewireExec( responses ) {

	// take the git subcommand and reply with the stored ExecReturns
	BaseWatcher.exec = ( command ) => {

		const split = command.split( / /g );
		const subCommandIndex = split.findIndex( s => s === 'git' ) + 1;
		const subCommand = split[ subCommandIndex ];

		const reply = responses[ subCommand ];

		// console.log( `Intercepted '%s' => '%s' and replying with '%o'`, command, subCommand, reply );

		return Promise.resolve( reply );

	};

}


describe( `pullrequestsMirrorWatcher`, function () {

	const watcher = new watcherClass();

	before( 'rig cache', function () {

		watcher.cache = {
			getKey: () => false, // TODO: also true
			save: () => true,
			setKey: () => true
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
