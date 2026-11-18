-- Data for concurrency ONLY, in disposable PostgreSQL 17 database.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT schoolnet_private.save_lot5d_legacy_decision(
  '20252025-2025-4025-8025-202520252025',
  '20262026-2026-4026-8026-202620262026',
  '11111111-1111-4111-8111-111111111111',
  'repeat',
  'c0260000-0000-4000-8000-000000000026',
  'Concurrence uniquement en fixtures',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
COMMIT;
