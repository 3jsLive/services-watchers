const Promise = require( 'bluebird' );
const signale = require( "signale" );


signale.config( { displayTimestamp: true } );
const statusLogger = signale.scope( 'Runner' );


const boredomDuration = 90;
let boredomTimer = setInterval( boredomFunc, boredomDuration * 1000 );

function boredomFunc() {

	statusLogger.pending( `Nothing happened in ${boredomDuration} seconds` );

}


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


// pullrequests watcher is the small-scale watcher behind 3jslive
// keeping the PR database up to date and that's about it
const PullrequestsWatcher = require( './watchers/pullrequests' );
const pullrequestsAPIStuffWatcher = new PullrequestsWatcher();
pollAsync( pullrequestsAPIStuffWatcher.polling( statusCallback( pullrequestsAPIStuffWatcher.name ) ), 5000 );

// keeps our mirror of github meta stuff (issues, milestones, ...)
// current, mostly for statistics in 3ci
const EventsWatcher = require( './watchers/events' );
const eventsLoggerWatcher = new EventsWatcher();
pollAsync( eventsLoggerWatcher.polling( statusCallback( eventsLoggerWatcher.name ) ), 5000 );

// only processes milestone/demilestone events because /watchers/events doesn't get that
const MilestoningWatcher = require( './watchers/issues-events' );
const milestoningLoggerWatcher = new MilestoningWatcher();
pollAsync( milestoningLoggerWatcher.polling( statusCallback( milestoningLoggerWatcher.name ) ), 5000 );

// keep our fork's branches in sync with upstreams and split up any
// multi-commit push into individual pushes so CI gets triggered on all of them
const BranchWatcher = require( './watchers/branch' );
const branchMirrorWatcher = new BranchWatcher();
pollAsync( branchMirrorWatcher.polling( statusCallback( branchMirrorWatcher.name ) ), 5000 );

// mirror PRs from mrdoob/three.js to our repo while also
// splitting them up into one-commit-per-push
const PrMirrorWatcher = require( './watchers/prMirror' );
const pullrequestsMirrorWatcher = new PrMirrorWatcher();
pollAsync( pullrequestsMirrorWatcher.polling( statusCallback( pullrequestsMirrorWatcher.name ) ), 5000 );
