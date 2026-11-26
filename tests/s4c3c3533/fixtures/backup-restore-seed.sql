-- S4-C.3-C.3.5.3.3 -- disposable fictional PostgreSQL CI only.
-- Never execute this script against a hosted or SCHOOLNET production database.
BEGIN;
CREATE SCHEMA schoolnet_ci_backup;
CREATE TABLE schoolnet_ci_backup.sample_markers (
  marker text PRIMARY KEY,
  amount numeric(8,2) NOT NULL,
  published boolean NOT NULL
);
INSERT INTO schoolnet_ci_backup.sample_markers(marker,amount,published) VALUES
  ('SYNTHETIC_A',12.50,true),
  ('SYNTHETIC_B',0.00,false),
  ('SYNTHETIC_C',18.75,true);
COMMIT;
