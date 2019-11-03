const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );
const signale = require( 'signale' );
const flatCache = require( 'flat-cache' );
const execAsync = require( 'execasync' );


signale.config( { displayTimestamp: true } );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'CACHE_DIR': '/home/max/dev/3js.dev/cache/watchers'
};

const githubApiRequest = request.defaults( {
	baseUrl: 'https://api.github.com',
	qs: {
		'per_page': 100
	},
	headers: {
		'User-Agent': config.USER_AGENT,
		'Authorization': `token ${config.GITHUB_TOKEN}`
	},
	timeout: 15000
} );

const shellOptions = {
	cwd: '/home/max/dev/3js.dev/data/3jsRepository/',
	env: process.env,
	timeout: 60000,
	encoding: 'utf8'
};


class BaseWatcher {

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

		this.cache = flatCache.load( `${this.name}Watcher`, config.CACHE_DIR );
		this.options = { state: "all", sort: "updated", direction: "desc" };


	}

	keyFn( ) {

		throw new Error( 'keyFn not implemented' );

	}

	filterFn() {

		throw new Error( 'filterFn not implemented' );

	}

	polling( callback ) {

		const logger = signale.scope( `${this.name}Polling` );

		var etag = ( this.cache.getKey( 'etag' ) || { etag: 0 } ).etag;
		logger.debug( 'etag', etag );

		if ( ! callback )
			callback = logger.debug;

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

				logger.error( `Request error: ${err}` );

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
							logger.debug( `Updates:\n${updates}` );
						else
							logger.debug( `No relevant updates detected` );

						// if ( updatesComments > 0 )
						// 	callback( updatesComments );
						// else
						// 	callback( 'no relevant updates' );

						return updates;

					} )
					.catch( err => logger.error( 'Body check failed:', err ) );

			} else {

				callback( 'body error' );

			}

		};

	}


	static exec( command, additionalOptions ) {

		const options = { ...shellOptions, additionalOptions };

		return execAsync( command, options );

	}

}

module.exports = BaseWatcher;
