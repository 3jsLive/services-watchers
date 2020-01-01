const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );
const signale = require( 'signale' );
const flatCache = require( 'flat-cache' );
const execAsync = require( 'execasync' );
const path = require( 'path' );
const config = require( 'rc' )( '3cidev' );
const lockfile = require( 'proper-lockfile' );


signale.config( { displayTimestamp: true } );


const githubApiRequest = request.defaults( {
	baseUrl: 'https://api.github.com',
	qs: {
		'per_page': 100
	},
	headers: {
		'User-Agent': config.watchers.userAgent,
		'Authorization': `token ${process.env.GITHUB_TOKEN}`
	},
	timeout: 15000
} );

const shellOptions = {
	cwd: path.join( config.root, config.threejsRepository ),
	env: process.env,
	timeout: 60000,
	encoding: 'utf8'
};


class BaseWatcher {

	static release;

	constructor( name, url ) {

		if ( ! name )
			throw new Error( 'Watcher needs a name' );

		if ( ! url )
			throw new Error( `Watcher '${name}' needs an URL to poll` );

		// if ( ! workers || workers.length === 0 )
		// 	throw new Error( `Watcher '${name}' needs workers` );

		this.name = name;
		this.url = url;
		// this.workers = workers;
		/**
		 * @type {{name: string, fn: Function}[]}
		 */
		this.workers = [];

		this.cache = flatCache.load( `${this.name}Watcher`, path.join( config.root, config.watchers.cacheDir ) );
		this.options = { state: "all", sort: "updated", direction: "desc" };

		this.logger = signale.scope( this.name );

	}

	keyFn( ) {

		throw new Error( 'keyFn not implemented' );

	}

	filterFn() {

		throw new Error( 'filterFn not implemented' );

	}

	polling( callback ) {

		this.logger = signale.scope( this.name, 'Polling' );

		var etag = ( this.cache.getKey( 'etag' ) || { etag: 0 } ).etag;
		this.logger.debug( 'etag', etag );

		if ( ! callback )
			callback = this.logger.debug;

		return async () => {

			const requestOptions = {
				url: this.url,
				qs: this.options,
				headers: {
					"If-None-Match": etag || 0
				}
			};


			let response;

			try {

				response = await githubApiRequest( requestOptions );

			} catch ( err ) {

				this.logger.error( `Request error: ${err}` );

				callback( err );

				return;

			}

			//check if it is the same response as before and quit if it is
			if ( etag === response.headers.etag )
				return 0;
			else
				etag = response.headers.etag;

			callback( 'changes detected' );

			this.cache.setKey( 'etag', { etag } );
			this.cache.save( true );

			const body = JSON.parse( response.body );

			if ( body ) {

				// reverse to get chronological order
				body.reverse();

				await Promise.mapSeries( body, ( entry, index ) => {

					if ( ! entry )
						return `${index} invalid`;

					const data = this.filterFn( entry );
					const key = this.keyFn( data );

					if ( ! this.cache.getKey( key ) ) {

						callback( 'update available: ' + key );

						this.cache.setKey( key, { data, raw: entry } );
						this.cache.save( true );

						// call all workers in series and format their return values
						// comments: 0	foo: 3	etc...
						return Promise.mapSeries( this.workers, worker => worker.fn.call( this, data, this.cache ) )
							.then( results => results.reduce( ( all, counter, idx ) => all += `${this.workers[ idx ].name}: ${counter}\t`, `${key} > ` ) );

					}

					return ``;

				} )
					.then( results => results.join( '\n' ).trim() )
					.then( updates => {

						if ( updates.length > 0 )
							this.logger.debug( `Updates:\n${updates}` );
						else
							this.logger.debug( `No relevant updates detected` );

						return updates;

					} )
					.catch( err => this.logger.error( 'Body check failed:', err ) );

			} else {

				callback( 'body error' );

			}

		};

	}


	exec( command, additionalOptions ) {

		const options = { ...shellOptions, additionalOptions };

		return execAsync( command, options );

	}


	static lockRepository( repoPath = path.join( config.root, config.threejsRepository, '.git' ), stale = 600000, retries = 4 ) {

		return lockfile.lock( repoPath, { stale: stale, retries: { retries: retries, minTimeout: stale / 2, maxTimeout: stale } } )
			.then( release => {

				BaseWatcher.release = release;

				return Promise.resolve( true );

			} )
			.catch( err => {

				console.error( 'Locking failed:', err );

				return Promise.resolve( false );

			} );

	}


	static unlockRepository() {

		// blind hope.
		return BaseWatcher.release()
			.then( () => {

				return Promise.resolve( true );

			} )
			.catch( err => {

				console.error( 'Unlocking failed:', err );

				return Promise.resolve( false );

			} );

	}

}

module.exports = BaseWatcher;
