const Database = require( 'better-sqlite3' );
const BaseWatcher = require( '../BaseWatcher' );

const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'DATABASE': '/home/max/dev/3jsservices-single/watchers/eventslog.db'
};


class MilestoningWatcher extends BaseWatcher {

	constructor() {

		super( 'milestoningLogger', `/repos/${config.REPOSITORY}/issues/events` );

		this.workers = [ { name: 'processEvent', fn: this.processEvent } ];

		this.db = new Database( config.DATABASE, { fileMustExist: true } );
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

			result = this.handlers[ event.event ]( event );

		} else {

			console.log( 'No handler for', event.event );

		}

		return result;

	}


	handlerMilestoned( data ) {

		console.log( `Issue #${data.issue.number} was ${data.event} -> ${data.milestone.title}` );

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
