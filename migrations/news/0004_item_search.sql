-- Item-level keyword search over AI News, replacing the whole-issue table from 0003_search.sql
-- so multi-term and Han-pair queries must match within a single news item.
DROP TRIGGER issues_fts_insert;
DROP TRIGGER issues_fts_update;
DROP TABLE issues_fts;

CREATE VIRTUAL TABLE issue_items_fts USING fts5(
  date UNINDEXED,
  snippet UNINDEXED,
  body,
  tokenize = 'trigram'
);

CREATE TRIGGER issue_items_fts_insert AFTER INSERT ON issues BEGIN
  INSERT INTO issue_items_fts (rowid, date, snippet, body)
  SELECT
    (CAST(strftime('%s', NEW.date) AS INTEGER) / 86400) * 32 + CAST(key AS INTEGER),
    NEW.date,
    json_extract(value, '$.title') || '：' || json_extract(value, '$.summary'),
    json_extract(value, '$.tag') || ' ' || json_extract(value, '$.title') || ' ' ||
      json_extract(value, '$.summary')
  FROM json_each(NEW.items_json);
END;

CREATE TRIGGER issue_items_fts_update AFTER UPDATE OF title, summary, items_json ON issues BEGIN
  DELETE FROM issue_items_fts
  WHERE rowid BETWEEN (CAST(strftime('%s', OLD.date) AS INTEGER) / 86400) * 32
                  AND (CAST(strftime('%s', OLD.date) AS INTEGER) / 86400) * 32 + 31;
  INSERT INTO issue_items_fts (rowid, date, snippet, body)
  SELECT
    (CAST(strftime('%s', NEW.date) AS INTEGER) / 86400) * 32 + CAST(key AS INTEGER),
    NEW.date,
    json_extract(value, '$.title') || '：' || json_extract(value, '$.summary'),
    json_extract(value, '$.tag') || ' ' || json_extract(value, '$.title') || ' ' ||
      json_extract(value, '$.summary')
  FROM json_each(NEW.items_json);
END;

-- Backfill the items of issues that existed before this migration.
INSERT INTO issue_items_fts (rowid, date, snippet, body)
SELECT
  (CAST(strftime('%s', issues.date) AS INTEGER) / 86400) * 32 + CAST(item.key AS INTEGER),
  issues.date,
  json_extract(item.value, '$.title') || '：' || json_extract(item.value, '$.summary'),
  json_extract(item.value, '$.tag') || ' ' || json_extract(item.value, '$.title') || ' ' ||
    json_extract(item.value, '$.summary')
FROM issues, json_each(issues.items_json) AS item;
