BEGIN TRANSACTION;
DROP TABLE IF EXISTS "actors";
CREATE TABLE IF NOT EXISTS "actors" (
	"id"	INTEGER NOT NULL UNIQUE,
	"login"	TEXT NOT NULL UNIQUE,
	"avatar_url"	TEXT,
	PRIMARY KEY("id")
);
DROP TABLE IF EXISTS "milestones";
CREATE TABLE IF NOT EXISTS "milestones" (
	"number"	INTEGER NOT NULL UNIQUE,
	"title"	TEXT NOT NULL,
	"state"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	"closed_at"	TEXT,
	PRIMARY KEY("number")
);
DROP TABLE IF EXISTS "comments";
CREATE TABLE IF NOT EXISTS "comments" (
	"id"	INTEGER NOT NULL UNIQUE,
	"actor"	INTEGER NOT NULL,
	"issue"	INTEGER NOT NULL,
	"body"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT,
	FOREIGN KEY("actor") REFERENCES "actors"("id"),
	PRIMARY KEY("id")
);
DROP TABLE IF EXISTS "commentsLog";
CREATE TABLE IF NOT EXISTS "commentsLog" (
	"eventId"	INTEGER NOT NULL UNIQUE,
	"id"	INTEGER NOT NULL,
	"action"	TEXT NOT NULL,
	"parameter"	TEXT,
	"timestamp"	TEXT NOT NULL,
	PRIMARY KEY("eventId"),
	FOREIGN KEY("id") REFERENCES "comments"("id")
);
DROP TABLE IF EXISTS "issuesLog";
CREATE TABLE IF NOT EXISTS "issuesLog" (
	"eventId"	INTEGER NOT NULL UNIQUE,
	"number"	INTEGER NOT NULL,
	"action"	TEXT NOT NULL,
	"parameter"	TEXT,
	"timestamp"	TEXT,
	PRIMARY KEY("eventId")
);
DROP TABLE IF EXISTS "milestonesLog";
CREATE TABLE IF NOT EXISTS "milestonesLog" (
	"eventId"	INTEGER NOT NULL UNIQUE,
	"number"	INTEGER NOT NULL,
	"action"	TEXT NOT NULL,
	"parameter"	TEXT,
	"timestamp"	TEXT,
	PRIMARY KEY("eventId")
);
DROP TABLE IF EXISTS "events";
CREATE TABLE IF NOT EXISTS "events" (
	"id"	INTEGER NOT NULL UNIQUE,
	"type"	TEXT NOT NULL,
	"actor"	INTEGER,
	"created_at"	TEXT NOT NULL,
	"changes"	TEXT,
	PRIMARY KEY("id")
);
DROP TABLE IF EXISTS "pullrequestsLog";
CREATE TABLE IF NOT EXISTS "pullrequestsLog" (
	"eventId"	INTEGER NOT NULL UNIQUE,
	"number"	INTEGER NOT NULL,
	"action"	TEXT NOT NULL,
	"parameter"	TEXT,
	"timestamp"	TEXT NOT NULL,
	PRIMARY KEY("eventId")
);
DROP TABLE IF EXISTS "pullrequests";
CREATE TABLE IF NOT EXISTS "pullrequests" (
	"number"	INTEGER NOT NULL UNIQUE,
	"state"	TEXT NOT NULL,
	"title"	TEXT NOT NULL,
	"body"	TEXT,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT,
	"closed_at"	TEXT,
	"merged_at"	TEXT,
	"merge_commit_sha"	TEXT,
	"head_repo"	TEXT NOT NULL,
	"head_sha"	TEXT NOT NULL,
	"base_sha"	TEXT NOT NULL,
	"merged"	INTEGER,
	"mergeable"	INTEGER,
	"rebaseable"	INTEGER,
	"commits"	INTEGER NOT NULL,
	"additions"	INTEGER NOT NULL,
	"deletions"	INTEGER NOT NULL,
	"changed_files"	INTEGER NOT NULL,
	PRIMARY KEY("number")
);
DROP TABLE IF EXISTS "pushsLog";
CREATE TABLE IF NOT EXISTS "pushsLog" (
	"eventId"	INTEGER NOT NULL UNIQUE,
	"id"	INTEGER NOT NULL,
	"timestamp"	INTEGER NOT NULL,
	PRIMARY KEY("eventId")
);
DROP TABLE IF EXISTS "commits";
CREATE TABLE IF NOT EXISTS "commits" (
	"sha"	TEXT NOT NULL UNIQUE,
	"push"	INTEGER NOT NULL,
	"author"	TEXT,
	"message"	TEXT,
	PRIMARY KEY("sha")
);
DROP TABLE IF EXISTS "pushs";
CREATE TABLE IF NOT EXISTS "pushs" (
	"id"	INTEGER NOT NULL UNIQUE,
	"ref"	TEXT NOT NULL,
	"head"	TEXT NOT NULL,
	"before"	TEXT NOT NULL,
	"size"	INTEGER NOT NULL,
	PRIMARY KEY("id")
);
DROP TABLE IF EXISTS "issues";
CREATE TABLE IF NOT EXISTS "issues" (
	"number"	INTEGER NOT NULL,
	"actor"	INTEGER,
	"state"	TEXT NOT NULL,
	"title"	TEXT,
	"body"	TEXT,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	"closed_at"	TEXT,
	PRIMARY KEY("number")
);
DROP INDEX IF EXISTS "idx_commits_pushId";
CREATE INDEX IF NOT EXISTS "idx_commits_pushId" ON "commits" (
	"push"	ASC
);
DROP INDEX IF EXISTS "idx_pushs_head";
CREATE INDEX IF NOT EXISTS "idx_pushs_head" ON "pushs" (
	"head"
);
DROP INDEX IF EXISTS "idx_pushs_before";
CREATE INDEX IF NOT EXISTS "idx_pushs_before" ON "pushs" (
	"before"
);
DROP INDEX IF EXISTS "idx_actors_login";
CREATE INDEX IF NOT EXISTS "idx_actors_login" ON "actors" (
	"login"
);
COMMIT;
