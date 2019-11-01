const Database = require( 'better-sqlite3' );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'DATABASE': '/home/max/dev/3jsservices-single/watchers/eventslog.db'
};


const db = new Database( config.DATABASE, { fileMustExist: true } );
const sql = {
	issue: {
		log: db.prepare( `INSERT OR REPLACE
			INTO issuesLog ( eventId, number, action, parameter, timestamp )
			VALUES ( $eventId, $number, $action, $parameter, $timestamp )` )
	}
};


function keyFn( data ) {

	return `${data.id} ${data.event}`;

}


function filterFn( ev ) {

	return {
		id: ev.id,
		event: ev.event,
		created_at: ev.created_at,
		milestone: ev.milestone,
		issue: ev.issue
	};

}


const handlers = {
	milestoned: handlerMilestoned,
	demilestoned: handlerMilestoned
};


function processEvent( event, cache ) {

	let result = 0;

	if ( typeof handlers[ event.event ] !== 'undefined' ) {

		result = handlers[ event.event ]( event, cache );

	} else {

		console.log( 'No handler for', event.event );

	}

	return result;

}


function handlerMilestoned( data ) {

	console.log( `Issue #${data.issue.number} was ${data.event} -> ${data.milestone.title}` );

	const input = {
		eventId: data.id,
		number: data.issue.number,
		action: data.event,
		parameter: data.milestone.title,
		timestamp: data.created_at
	};

	sql.issue.log.run( input );

	return 1;

}


module.exports = {
	keyFn,
	filterFn,
	url: `/repos/${config.REPOSITORY}/issues/events`,
	name: 'milestoningLogger',
	workers: [
		{ name: 'processEvent', fn: processEvent }
	]
};
