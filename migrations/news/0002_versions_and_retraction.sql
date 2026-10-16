-- Every accepted write is kept as a numbered version; issues holds the latest one for reads.
CREATE TABLE issue_versions (
  date TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, version)
) WITHOUT ROWID;

INSERT INTO issue_versions (date, version, title, summary, items_json, created_at)
SELECT date, 1, title, summary, items_json, created_at FROM issues;

ALTER TABLE issues ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE issues ADD COLUMN updated_at TEXT;
-- A retracted issue keeps its rows and versions; reads skip it while hidden_at is set.
ALTER TABLE issues ADD COLUMN hidden_at TEXT;

UPDATE issues SET updated_at = created_at;
