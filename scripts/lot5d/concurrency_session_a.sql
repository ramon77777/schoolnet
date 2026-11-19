-- Session A finalizes and retains transaction lock while session B races.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT schoolnet_private.finalize_lot5d_legacy_year(
  '20252025-2025-4025-8025-202520252025',
  '20262026-2026-4026-8026-202620262026',
  '2026-2027',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '10000000-0000-4000-8000-000000000091'
);
\echo SESSION_A_FINALIZED_UNCOMMITTED
SELECT pg_catalog.pg_sleep(11);
COMMIT;
\echo SESSION_A_COMMITTED
