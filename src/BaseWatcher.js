const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );
const signale = require( "signale" );
const flatCache = require( 'flat-cache' );

signale.config( { displayTimestamp: true } );

const statusLogger = signale.scope( 'BaseWatcher' );


const boredomDuration = 90;
let boredomTimer = setInterval( boredomFunc, boredomDuration * 1000 );

function boredomFunc() {

	statusLogger.pending( `Nothing happened in ${boredomDuration} seconds` );

}

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


function statusCallback( scope ) {

	const logger = signale.scope( scope );

	return function ( status ) {

		clearInterval( boredomTimer );

		if ( typeof status === 'string' ) {

			logger.debug( status );

		} else if ( status instanceof Error ) {

			logger.info( 'Resuming...' );

		} else if ( typeof status === 'number' ) {

			logger.success( 'Updates:', status );

		} else {

			logger.fatal( status );

		}

		boredomTimer = setInterval( boredomFunc, boredomDuration * 1000 );

	};

}


function pollAsync( func, delay = 0, timeout = 30000 ) {

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

}


class BaseWatcher {

	constructor( { name, url, options, cache, filterFn, keyFn, workers } ) {

		if ( ! name )
			throw new Error( 'Watcher needs a name' );

		if ( ! url )
			throw new Error( `Watcher '${name}' needs an URL to poll` );

		if ( ! filterFn )
			throw new Error( `Watcher '${name}' needs a filter function` );

		if ( ! keyFn )
			throw new Error( `Watcher '${name}' needs a key function` );

		if ( ! workers || workers.length === 0 )
			throw new Error( `Watcher '${name}' needs workers` );

		this.name = name;
		this.url = url;
		this.filterFn = filterFn;
		this.keyFn = keyFn;
		this.workers = workers;

		if ( ! cache )
			this.cache = flatCache.load( `${name}Watcher`, config.CACHE_DIR );
		else
			this.cache = cache;

		if ( ! options )
			this.options = { state: "all", sort: "updated", direction: "desc" };
		else
			this.options = options;

	}

	polling( callback ) {

		const logger = signale.scope( `${this.name}Polling` );

		var etag = ( this.cache.getKey( 'etag' ) || { etag: 0 } ).etag;
		logger.debug( 'etag', etag );

		if ( ! callback )
			callback = statusCallback;

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
						return Promise.mapSeries( this.workers, worker => worker.fn( data, this.cache ) )
							.then( results => results.reduce( ( all, counter, idx ) => all += `${this.workers[ idx ].name}: ${counter}\t`, `${key} > ` ) );

					}

					return ``;

				} )
					.then( results => results.join( '\n' ).trim() )
					.then( updates => {

						logger.debug( `Updates:\n${updates}` );

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

}

// pullrequests watcher is the small-scale watcher behind 3jslive
// keeping the PR database up to date and that's about it
const pullrequests = require( './watchers/pullrequests' );
const pullrequestsWatcher = new BaseWatcher( pullrequests );
pollAsync( pullrequestsWatcher.polling( statusCallback( pullrequests.name ) ), 5000 );

// keeps our mirror of github meta stuff (issues, milestones, ...)
// current, mostly for statistics in 3ci
const events = require( './watchers/events' );
const eventsWatcher = new BaseWatcher( events );
pollAsync( eventsWatcher.polling( statusCallback( events.name ) ), 5000 );

// only processes milestone/demilestone events because /watchers/events doesn't get that
const milestoner = require( './watchers/issues-events' );
const milestonerWatcher = new BaseWatcher( milestoner );
pollAsync( milestonerWatcher.polling( statusCallback( milestoner.name ) ), 5000 );

// keep our fork's branches in sync with upstreams and split up
// any multi-commit push into individual pushes so CI gets triggered
// on all of them
const branch = require( './watchers/branch' );
const branchWatcher = new BaseWatcher( branch );
pollAsync( branchWatcher.polling( statusCallback( branch.name ) ), 5000 );
