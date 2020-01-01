const Promise = require( 'bluebird' );
const BaseWatcher = require( '../BaseWatcher' );
const config = require( 'rc' )( '3cidev' );


class BranchWatcher extends BaseWatcher {

	constructor() {

		super( 'branchMirror', `/repos/${config.upstreamGithubPath}/branches` );

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

		return BaseWatcher.lockRepository()
			.then( () => {

				return this.exec( `git fetch --all` );

			} )
			.then( fetch => {

				this.logger.debug( fetch.code, fetch.stdout, fetch.stdout );

				return this.exec( `git pull ${config.remoteRemote} dev` );

			} )
			.then( pull => {

				this.logger.debug( pull.code, pull.stdout, pull.stderr );

				// --ancestry-path
				return this.exec( `git rev-list --reverse ${config.localRemote}/dev..${config.remoteRemote}/dev` );

			} )
			.then( revlist => {

				this.logger.debug( revlist.code, revlist.stdout, revlist.stderr );

				return Promise.mapSeries( revlist.stdout.trim().split( /\n/g ), ( line, idx, arrLen ) => {

					const counter = `${idx + 1}/${arrLen}`;

					if ( /^[a-f0-9]{40}$/i.test( line ) !== true ) {

						this.logger.debug( `${counter}: Not a valid SHA '${line}'` );
						return;

					}

					return this.exec( `GIT_SSH_COMMAND="ssh -i ${config.watchers.identityFile}" git push --force --verbose ${config.localRemote} ${line}:dev` )
						.then( push => {

							this.logger.debug( `${counter}`, push.code, push.stdout, push.stderr );

							return push;

						} )
						.catch( err => this.logger.error( err ) );

				} );

			} )
			.then( results => {

				this.logger.debug( 'Push results:', results );

				return BaseWatcher.unlockRepository()
					.then( () => results.filter( r => r.code === 0 ).length );

			} )
			.catch( err => {

				this.logger.error( 'Branch worker failure:', err );

				return BaseWatcher.unlockRepository();

			} );

	}

}

// keep our fork's branches in sync with upstreams and split up
// any multi-commit push into individual pushes so CI gets triggered
// on all of them
// BaseWatcher.pollAsync( new BranchWatcher().polling(), 5000 );

module.exports = BranchWatcher;
