-- Keyword search over AI News. The trigram tokenizer matches any substring of three or more
-- characters, so Chinese text needs no word segmentation; shorter terms fall back to LIKE.
-- The rowid is the issue date as a day number, so a trigger can replace one issue's row
-- without a scan. Triggers keep the table in step with every write to issues, including the
-- refresh in saveIssue; hidden issues keep their row, and queries join issues to skip them.
CREATE VIRTUAL TABLE issues_fts USING fts5(date UNINDEXED, body, tokenize = 'trigram');

CREATE TRIGGER issues_fts_insert AFTER INSERT ON issues BEGIN
  INSERT INTO issues_fts (rowid, date, body)
  VALUES (
    CAST(strftime('%s', NEW.date) AS INTEGER) / 86400,
    NEW.date,
    NEW.title || char(10) || NEW.summary || char(10) || (
      SELECT group_concat(
        json_extract(value, '$.tag') || ' ' || json_extract(value, '$.title') || ' ' ||
          json_extract(value, '$.summary'),
        char(10)
      )
      FROM json_each(NEW.items_json)
    )
  );
END;

CREATE TRIGGER issues_fts_update AFTER UPDATE OF title, summary, items_json ON issues BEGIN
  DELETE FROM issues_fts WHERE rowid = CAST(strftime('%s', OLD.date) AS INTEGER) / 86400;
  INSERT INTO issues_fts (rowid, date, body)
  VALUES (
    CAST(strftime('%s', NEW.date) AS INTEGER) / 86400,
    NEW.date,
    NEW.title || char(10) || NEW.summary || char(10) || (
      SELECT group_concat(
        json_extract(value, '$.tag') || ' ' || json_extract(value, '$.title') || ' ' ||
          json_extract(value, '$.summary'),
        char(10)
      )
      FROM json_each(NEW.items_json)
    )
  );
END;

-- Backfill the issues that existed before this migration.
INSERT INTO issues_fts (rowid, date, body)
SELECT
  CAST(strftime('%s', date) AS INTEGER) / 86400,
  date,
  title || char(10) || summary || char(10) || (
    SELECT group_concat(
      json_extract(value, '$.tag') || ' ' || json_extract(value, '$.title') || ' ' ||
        json_extract(value, '$.summary'),
      char(10)
    )
    FROM json_each(issues.items_json)
  )
FROM issues;
