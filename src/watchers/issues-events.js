const Database = require( 'better-sqlite3' );
const BaseWatcher = require( '../BaseWatcher' );
const path = require( 'path' );
const config = require( 'rc' )( '3jsdev' );


class MilestoningWatcher extends BaseWatcher {

	constructor() {

		super( 'milestoningLogger', `/repos/${config.upstreamGithubPath}/issues/events` );

		this.workers = [ { name: 'processEvent', fn: this.processEvent } ];

		this.db = new Database( path.join( config.root, config.watchers.dataPath, config.watchers.databases.stats ), { fileMustExist: true } );
		this.sql = {
			issue: {
				log: this.db.prepare( `INSERT OR REPLACE
					INTO issuesLog ( eventId, number, action, parameter, timestamp )
					VALUES ( $eventId, $number, $action, $parameter, $timestamp )` )
			}
		};

		this.handlers = {
			milestoned: this.handlerMilestoned,
			demilestoned: this.handlerMilestoned
		};

	}


	keyFn( data ) {

		return `${data.id} ${data.event}`;

	}


	filterFn( ev ) {

		return {
			id: ev.id,
			event: ev.event,
			created_at: ev.created_at,
			milestone: ev.milestone,
			issue: ev.issue
		};

	}


	processEvent( event ) {

		let result = 0;

		if ( typeof this.handlers[ event.event ] !== 'undefined' ) {

			result = this.handlers[ event.event ].call( this, event );

		} else {

			this.logger.debug( 'No handler for', event.event );

		}

		return result;

	}


	handlerMilestoned( data ) {

		this.logger.debug( `Issue #${data.issue.number} was ${data.event} -> ${data.milestone.title}` );

		const input = {
			eventId: data.id,
			number: data.issue.number,
			action: data.event,
			parameter: data.milestone.title,
			timestamp: data.created_at
		};

		this.sql.issue.log.run( input );

		return 1;

	}

}


// only processes milestone/demilestone events because /watchers/events doesn't get that
// BaseWatcher.pollAsync( new MilestoningWatcher().polling(), 5000 );

module.exports = MilestoningWatcher;
