const Database = require( 'better-sqlite3' );
const BaseWatcher = require( '../BaseWatcher' );


const config = {
	'REPOSITORY': 'mrdoob/three.js',
	'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
	'USER_AGENT': '@3botjs',
	'DATABASE': '/home/max/dev/3js.dev/data/watchers/eventslog.db'
};


class EventsWatcher extends BaseWatcher {

	constructor() {

		super( 'eventsLogger', `/repos/${config.REPOSITORY}/events` );

		this.workers = [ { name: 'processEvent', fn: this.processEvent } ];

		this.db = new Database( config.DATABASE, { fileMustExist: true } );
		this.sql = {
			event: {
				insert: this.db.prepare( `INSERT OR IGNORE INTO events ( id, type, created_at, actor, changes ) VALUES ( $id, $type, $created_at, $actor, $changes )` )
			},
			actor: {
				insert: this.db.prepare( `INSERT OR IGNORE INTO actors ( id, login, avatar_url ) VALUES ( $id, $login, $avatar_url )` )
			},
			issue: {
				insert: this.db.prepare( `INSERT OR REPLACE
			INTO issues ( number, actor, state, title, body, created_at, updated_at, closed_at )
			VALUES ( $number, $actor, $state, $title, $body, $created_at, $updated_at, $closed_at )` ),
				log: this.db.prepare( `INSERT OR REPLACE
			INTO issuesLog ( eventId, number, action, parameter, timestamp )
			VALUES ( $eventId, $number, $action, $parameter, $timestamp )` )
			},
			milestone: {
				insert: this.db.prepare( `INSERT OR REPLACE
			INTO milestones ( number, title, state, created_at, updated_at, closed_at )
			VALUES ( $number, $title, $state, $created_at, $updated_at, $closed_at )` ),
				log: this.db.prepare( `INSERT OR REPLACE
			INTO milestonesLog ( eventId, number, action, parameter, timestamp )
			VALUES ( $eventId, $number, $action, $parameter, $timestamp )` )
			},
			comment: {
				insert: this.db.prepare( `INSERT OR REPLACE
			INTO comments ( id, actor, issue, body, created_at, updated_at )
			VALUES ( $id, $actor, $issue, $body, $created_at, $updated_at )` ),
				log: this.db.prepare( `INSERT OR REPLACE
			INTO commentsLog ( eventId, id, action, parameter, timestamp )
			VALUES( $eventId, $id, $action, $parameter, $timestamp )` )
			},
			pullrequest: {
				insert: this.db.prepare( `INSERT OR REPLACE
			INTO pullrequests ( number, state, title, body, created_at, updated_at, closed_at, merged_at, merge_commit_sha,
				head_repo, head_sha, base_sha, merged, mergeable, rebaseable, commits, additions, deletions, changed_files )
			VALUES ( $number, $state, $title, $body, $created_at, $updated_at, $closed_at, $merged_at, $merge_commit_sha,
				$head_repo, $head_sha, $base_sha, $merged, $mergeable, $rebaseable, $commits, $additions, $deletions, $changed_files )` ),
				log: this.db.prepare( `INSERT OR REPLACE
			INTO pullrequestsLog ( eventId, number, action, parameter, timestamp )
			VALUES( $eventId, $number, $action, $parameter, $timestamp )` )
			},
			push: {
				insert: this.db.prepare( `INSERT OR REPLACE INTO pushs ( id, ref, head, before, size ) VALUES ( $id, $ref, $head, $before, $size )` ),
				log: this.db.prepare( `INSERT OR REPLACE INTO pushsLog ( eventId, id, timestamp ) VALUES ( $eventId, $id, $timestamp )` )
			},
			commit: {
				insert: this.db.prepare( `INSERT OR REPLACE INTO commits ( sha, push, author, message ) VALUES ( $sha, $push, $author, $message )` )
			}
		};

		this.handlers = {
			IssuesEvent: this.handlerIssuesEvent,
			IssueCommentEvent: this.handlerIssueCommentEvent,
			MilestoneEvent: this.handlerMilestoneEvent,
			PullRequestEvent: this.handlerPullRequestEvent,
			// PullRequestReviewEvent: handlerPullRequestReviewEvent,
			// PullRequestReviewCommentEvent: handlerPullRequestReviewCommentEvent,
			PushEvent: this.handlerPushEvent,
			// ReleaseEvent: handlerReleaseEvent
		};

	}


	pullUserData( obj ) {

		return { id: obj.id, login: obj.login, avatar_url: obj.avatar_url };

	}


	keyFn( data ) {

		return `${data.id} ${data.type}`;

	}


	filterFn( ev ) {

		return {
			id: ev.id,
			type: ev.type,
			created_at: ev.created_at,
			actor: ev.actor,
			payload: ev.payload,
			changes: ev.payload.changes || {}
		};

	}


	processEvent( event ) {

		let result = 0;

		if ( typeof this.handlers[ event.type ] !== 'undefined' ) {

			this.sql.actor.insert.run( event.actor );

			const logData = {
				id: event.id,
				type: event.type,
				created_at: event.created_at,
				actor: event.actor.id,
				changes: JSON.stringify( event.changes )
			};
			this.sql.event.insert.run( logData );

			result = this.handlers[ event.type ]( event );

		} else
			console.log( 'No handler for', event.type );

		return result;

	}


	handlerIssuesEvent( data ) {

		const { action, issue } = data.payload;

		const validActions = [ 'opened', 'edited', 'deleted', 'closed', 'reopened', 'milestoned', 'demilestoned' ];

		if ( validActions.indexOf( action ) !== - 1 ) {

			console.log( `Issue #${issue.number} was ${action}` );


			// always add actors, in case we didn't know of them yet
			const actor = { id: issue.user.id, login: issue.user.login, avatar_url: issue.user.avatar_url };
			this.sql.actor.insert.run( actor );


			// add issue data
			const meta = {
				number: issue.number, actor: issue.user.id, state: issue.state, title: issue.title, body: issue.body,
				created_at: issue.created_at, updated_at: issue.updated_at, closed_at: issue.closed_at
			};
			this.sql.issue.insert.run( meta );


			// add milestone, if there is one
			if ( issue.milestone ) {

				const milestone = {
					number: issue.milestone.number, title: issue.milestone.title, state: issue.milestone.state,
					created_at: issue.milestone.created_at, updated_at: issue.milestone.updated_at, closed_at: issue.milestone.closed_at
				};
				this.sql.milestone.insert.run( milestone );

			}


			// log the actual action, current timestamp and parameter(s)
			let parameter = { actor: data.actor };
			if ( action === 'milestoned' )
				parameter.milestone = issue.milestone.number;
			this.sql.issue.log.run( { eventId: data.id, number: issue.number, action: action, parameter: JSON.stringify( parameter ), timestamp: data.created_at } );


			return 1;

		} else {

			console.log( `Ignoring action '${action}' on issue #${issue.number}` );
			return 0;

		}

	}


	handlerIssueCommentEvent( data ) {

		const { action, issue, comment } = data.payload;

		const validActions = [ 'created', 'edited', 'deleted' ];

		if ( validActions.indexOf( action ) !== - 1 ) {

			console.log( `Comment #${comment.id} on issue #${issue.number} was ${action}` );


			// always add actors, in case we didn't know of them yet
			const issueActor = { id: issue.user.id, login: issue.user.login, avatar_url: issue.user.avatar_url };
			const commentActor = { id: comment.user.id, login: comment.user.login, avatar_url: comment.user.avatar_url };
			this.sql.actor.insert.run( issueActor );
			this.sql.actor.insert.run( commentActor );


			// add issue data
			const issueMeta = {
				number: issue.number, actor: issue.user.id, state: issue.state, title: issue.title, body: issue.body,
				created_at: issue.created_at, updated_at: issue.updated_at, closed_at: issue.closed_at
			};
			this.sql.issue.insert.run( issueMeta );


			// add milestone, if there is one
			if ( issue.milestone ) {

				const milestone = {
					number: issue.milestone.number, title: issue.milestone.title, state: issue.milestone.state,
					created_at: issue.milestone.created_at, updated_at: issue.milestone.updated_at, closed_at: issue.milestone.closed_at
				};
				this.sql.milestone.insert.run( milestone );

			}


			// finally, add comment
			const commentMeta = {
				id: comment.id, actor: comment.user.id, issue: issue.number, body: comment.body, created_at: comment.created_at, updated_at: comment.updated_at
			};
			this.sql.comment.insert.run( commentMeta );


			// log the actual action, current timestamp and parameter(s)
			let parameter = { actor: data.actor };
			this.sql.comment.log.run( { eventId: data.id, id: comment.id, action: action, parameter: JSON.stringify( parameter ), timestamp: data.created_at } );


			return 1;

		} else {

			console.log( `Ignoring comment #${comment.id} action '${action}' on issue #${issue.number}` );
			return 0;

		}

	}


	handlerMilestoneEvent( data ) {

		const { action, milestone } = data.payload;

		const validActions = [ 'created', 'edited', 'deleted', 'opened', 'closed' ];

		if ( validActions.indexOf( action ) !== - 1 ) {

			console.log( `Milestone #${milestone.number}(${milestone.title}) was ${action}` );


			// always add actors, in case we didn't know of them yet
			const milestoneActor = { id: milestone.creator.id, login: milestone.creator.login, avatar_url: milestone.creator.avatar_url };
			this.sql.actor.insert.run( milestoneActor );


			// add milestone data
			const milestoneMeta = {
				number: milestone.number, title: milestone.title, state: milestone.state,
				created_at: milestone.created_at, updated_at: milestone.updated_at, closed_at: milestone.closed_at
			};
			this.sql.milestone.insert.run( milestoneMeta );


			// log the actual action, current timestamp and parameter(s)
			let parameter = { actor: data.actor };
			this.sql.milestone.log.run( { eventId: data.id, id: milestone.number, action: action, parameter: JSON.stringify( parameter ), timestamp: data.created_at } );


			return 1;

		} else {

			console.log( `Ignoring milestone #${milestone.number} action '${action}'` );
			return 0;

		}

	}


	handlerPullRequestEvent( data ) {

		const { action, pull_request: pullrequest } = data.payload;

		const validActions = [ 'opened', 'edited', 'closed', 'reopened' ];

		if ( validActions.indexOf( action ) !== - 1 ) {

			console.log( `PR #${pullrequest.number} was ${action}` );


			// always add actors, in case we didn't know of them yet
			this.sql.actor.insert.run( this.pullUserData( pullrequest.user ) );
			this.sql.actor.insert.run( this.pullUserData( pullrequest.head.user ) );
			this.sql.actor.insert.run( this.pullUserData( pullrequest.base.user ) );
			this.sql.actor.insert.run( this.pullUserData( pullrequest.head.repo.owner ) );
			this.sql.actor.insert.run( this.pullUserData( pullrequest.base.repo.owner ) );

			if ( pullrequest.merged_by )
				this.sql.actor.insert.run( this.pullUserData( pullrequest.merged_by ) );

			if ( pullrequest.milestone )
				this.sql.actor.insert.run( this.pullUserData( pullrequest.milestone.creator ) );


			// add pullrequest and connected issue data
			const pullrequestMeta = {
				number: pullrequest.number, state: pullrequest.state, title: pullrequest.title, body: pullrequest.body,
				created_at: pullrequest.created_at, updated_at: pullrequest.updated_at, closed_at: pullrequest.closed_at, merged_at: pullrequest.merged_at,
				merge_commit_sha: pullrequest.merge_commit_sha,
				head_repo: pullrequest.head.repo.full_name, head_sha: pullrequest.head.sha, base_sha: pullrequest.base.sha,
				merged: ( pullrequest.merged ? 1 : 0 ), mergeable: ( pullrequest.mergeable ? 1 : 0 ), rebaseable: ( pullrequest.rebaseable ? 1 : 0 ),
				commits: pullrequest.commits, additions: pullrequest.additions, deletions: pullrequest.deletions, changed_files: pullrequest.changed_files
			};
			const issueMeta = {
				number: pullrequest.number, actor: pullrequest.user.id, state: pullrequest.state, title: pullrequest.title, body: pullrequest.body,
				created_at: pullrequest.created_at, updated_at: pullrequest.updated_at, closed_at: pullrequest.closed_at
			};
			this.sql.pullrequest.insert.run( pullrequestMeta );
			this.sql.issue.insert.run( issueMeta );


			// add milestone, if there is one
			if ( pullrequest.milestone ) {

				const milestone = {
					number: pullrequest.milestone.number, title: pullrequest.milestone.title, state: pullrequest.milestone.state,
					created_at: pullrequest.milestone.created_at, updated_at: pullrequest.milestone.updated_at, closed_at: pullrequest.milestone.closed_at
				};
				this.sql.milestone.insert.run( milestone );

			}


			// log the actual action, current timestamp and parameter(s)
			this.sql.pullrequest.log.run( { eventId: data.id, number: pullrequest.number, action: action, parameter: '', timestamp: data.created_at } );


			return 1;

		} else {

			console.log( `Ignoring action '${action}' on PR #${pullrequest.number}` );
			return 0;

		}

	}


	handlerPushEvent( data ) {

		const push = data.payload;

		console.log( `Push ${push.push_id} with HEAD ${push.head}` );


		// convenience
		const { push_id: id, ref, head, before, size, commits } = push;

		const pushMeta = { id, ref, head, before, size };
		this.sql.push.insert.run( pushMeta );


		commits.forEach( c => {

			// only 20, for all -> https://api.github.com/repos/mrdoob/three.js/compare/base...head

			const commitMeta = { sha: c.sha, push: id, author: c.author.name, message: c.message };
			this.sql.commit.insert.run( commitMeta );

		} );


		// log the actual action, current timestamp and parameter(s)
		this.sql.push.log.run( { eventId: data.id, id: id, timestamp: data.created_at } );


		return size;

	}


}

// keeps our mirror of github meta stuff (issues, milestones, ...)
// current, mostly for statistics in 3ci
// BaseWatcher.pollAsync( new EventsWatcher().polling(), 5000 );


module.exports = EventsWatcher;
