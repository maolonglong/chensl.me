CREATE TABLE issues (
  date TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
