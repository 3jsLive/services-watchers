const Promise = require( 'bluebird' );
const request = Promise.promisify( require( 'request' ) );
const signale = require( "signale" );
const flatCache = require( 'flat-cache' );
const execAsync = require( 'execasync' );


signale.config( { displayTimestamp: true } );

const statusLogger = signale.scope( 'BaseWatcher' );



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


let boredomDuration;
let boredomTimer;

class BaseWatcher {

	// there's got to be a better way for this
	static get boredomTimer() {

		return boredomTimer;

	}
	static set boredomTimer( value ) {

		boredomTimer = value;

	}

	static get boredomDuration() {

		return boredomDuration;

	}
	static set boredomDuration( value ) {

		boredomDuration = value;

	}


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
		this.workers = [];

		this.cache = flatCache.load( `${this.name}Watcher`, config.CACHE_DIR );
		this.options = { state: "all", sort: "updated", direction: "desc" };

		BaseWatcher.boredomDuration = 90;
		BaseWatcher.boredomTimer = setInterval( BaseWatcher.boredomFunc, BaseWatcher.boredomDuration * 1000 );

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
			callback = BaseWatcher.statusCallback;

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


	static boredomFunc() {

		statusLogger.pending( `Nothing happened in ${BaseWatcher.boredomDuration} seconds` );

	}


	static statusCallback( scope ) {

		const logger = signale.scope( scope );

		return function ( status ) {

			clearInterval( BaseWatcher.boredomTimer );

			if ( typeof status === 'string' ) {

				logger.debug( status );

			} else if ( status instanceof Error ) {

				logger.info( 'Resuming...' );

			} else if ( typeof status === 'number' ) {

				logger.success( 'Updates:', status );

			} else {

				logger.fatal( status );

			}

			BaseWatcher.boredomTimer = setInterval( BaseWatcher.boredomFunc, BaseWatcher.boredomDuration * 1000 );

		};

	}


	static exec( command, additionalOptions ) {

		const options = { ...shellOptions, additionalOptions };

		return execAsync( command, options );

	}


	static pollAsync( func, delay = 0, timeout = 30000 ) {

		const fullfilled = () => {

			return Promise
				.delay( delay )
				.then( () => BaseWatcher.pollAsync( func, delay ) )
				.timeout( timeout )
				.catch( Promise.TimeoutError, () => console.log( 'pollAsync timed out' ) )
				.catch( err => console.error( 'Something went wrong during polling:', err ) );

		};

		func()
			.then( fullfilled )
			.catch( fullfilled );

	}

}

module.exports = BaseWatcher;

// pullrequests watcher is the small-scale watcher behind 3jslive
// keeping the PR database up to date and that's about it
const PullrequestsWatcher = require( './watchers/pullrequests' );
const pullrequestsAPIStuffWatcher = new PullrequestsWatcher();
BaseWatcher.pollAsync( pullrequestsAPIStuffWatcher.polling(), 5000 );

// keeps our mirror of github meta stuff (issues, milestones, ...)
// current, mostly for statistics in 3ci
const EventsWatcher = require( './watchers/events' );
const eventsLoggerWatcher = new EventsWatcher();
BaseWatcher.pollAsync( eventsLoggerWatcher.polling(), 5000 );

// only processes milestone/demilestone events because /watchers/events doesn't get that
const MilestoningWatcher = require( './watchers/issues-events' );
const milestoningLoggerWatcher = new MilestoningWatcher();
BaseWatcher.pollAsync( milestoningLoggerWatcher.polling(), 5000 );

// keep our fork's branches in sync with upstreams and split up
// any multi-commit push into individual pushes so CI gets triggered
// on all of them
const BranchWatcher = require( './watchers/branch' );
const branchMirrorWatcher = new BranchWatcher();
BaseWatcher.pollAsync( branchMirrorWatcher.polling(), 5000 );

// mirror PRs from mrdoob/three.js to our repo while also
// splitting them up into one-commit-per-push
const PrMirrorWatcher = require( './watchers/prMirror' );
const pullrequestsMirrorWatcher = new PrMirrorWatcher();
BaseWatcher.pollAsync( pullrequestsMirrorWatcher.polling(), 5000 );
