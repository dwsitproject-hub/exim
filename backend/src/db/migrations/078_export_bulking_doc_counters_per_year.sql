-- Document number running serial continues across months within a year; resets when year changes.

CREATE TABLE export_bulking_doc_number_counters_new (
  series_code VARCHAR(32) NOT NULL,
  year INT NOT NULL CHECK (year >= 2000 AND year <= 9999),
  last_serial INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_eb_doc_counters_new PRIMARY KEY (series_code, year)
);

INSERT INTO export_bulking_doc_number_counters_new (series_code, year, last_serial, updated_at)
SELECT series_code, year, MAX(last_serial), MAX(updated_at)
FROM export_bulking_doc_number_counters
GROUP BY series_code, year;

DROP TABLE export_bulking_doc_number_counters;

ALTER TABLE export_bulking_doc_number_counters_new
  RENAME TO export_bulking_doc_number_counters;

ALTER TABLE export_bulking_doc_number_counters
  RENAME CONSTRAINT pk_eb_doc_counters_new TO pk_eb_doc_counters;

CREATE INDEX IF NOT EXISTS idx_eb_doc_counters_lookup
  ON export_bulking_doc_number_counters (series_code, year DESC);
