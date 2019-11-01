BEGIN TRANSACTION;
DROP TABLE IF EXISTS "pullrequests";
CREATE TABLE IF NOT EXISTS "pullrequests" (
	"number"	INTEGER NOT NULL UNIQUE,
	"state"	TEXT NOT NULL,
	"title"	TEXT NOT NULL,
	"author"	TEXT NOT NULL,
	"created_at"	TEXT,
	"updated_at"	TEXT,
	PRIMARY KEY("number")
);
DROP TABLE IF EXISTS "commits";
CREATE TABLE IF NOT EXISTS "commits" (
	"sha"	TEXT NOT NULL,
	"ref"	TEXT NOT NULL,
	"author"	TEXT NOT NULL,
	"message"	TEXT,
	"authored_at"	TEXT NOT NULL,
	"state"	TEXT,
	PRIMARY KEY("sha","ref")
);
DROP INDEX IF EXISTS "idx_pullrequests_updated_at";
CREATE INDEX IF NOT EXISTS "idx_pullrequests_updated_at" ON "pullrequests" (
	"updated_at"	ASC
);
DROP INDEX IF EXISTS "idx_pullrequests_state";
CREATE INDEX IF NOT EXISTS "idx_pullrequests_state" ON "pullrequests" (
	"state"	ASC
);
DROP INDEX IF EXISTS "idx_commits_ref";
CREATE INDEX IF NOT EXISTS "idx_commits_ref" ON "commits" (
	"ref"	ASC
);
DROP INDEX IF EXISTS "idx_commits_sha";
CREATE INDEX IF NOT EXISTS "idx_commits_sha" ON "commits" (
	"sha"	ASC
);
COMMIT;
