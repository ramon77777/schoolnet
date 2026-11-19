-- Session A: finalized year, uncommitted for race test only.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT schoolnet_private.finalize_lot5d_legacy_year(
 '20252025-2025-4025-8025-202520252025',
 '20262026-2026-4026-8026-202620262026',
 '2026-2027','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '10000000-0000-4000-8000-0000000000e1'
);
SELECT pg_catalog.pg_sleep(11);
COMMIT;
\echo 5D-E A COMMITTED
