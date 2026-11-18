#!/usr/bin/env bash
# LOT 5D-E: CROSS-RPC SANDBOX ONLY. Two PostgreSQL 17 connections.
# Never use credentials, environment or hostname from real Supabase.
set -euo pipefail
if [[ "$PGHOST" != "127.0.0.1" || "$PGDATABASE" != "schoolnet_lot5d_ci" || "$PGUSER" != "postgres" ]]; then
  echo "5D-E REFUS: only disposable local PostgreSQL CI database accepted" >&2
  exit 10
fi
for key in SUPABASE_DB_URL DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL; do
  if [[ -n "$(printenv "$key" || true)" ]]; then
    echo "5D-E REFUS: non-fixture Supabase environment detected ($key)" >&2
    exit 11
  fi
done
logdir=$(mktemp -d)
pid_a=""
cleanup() {
  if [[ -n "$pid_a" ]] && kill -0 "$pid_a" 2>/dev/null; then
    kill "$pid_a" 2>/dev/null || true
    wait "$pid_a" 2>/dev/null || true
  fi
  rm -rf "$logdir"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/legacy_cross_prepare.sql \
  >"$logdir/prepare.log" 2>&1
PGAPPNAME=schoolnet_lot5de_finalizer psql -X -v ON_ERROR_STOP=1 \
  -f scripts/lot5d/legacy_cross_finalizer_a.sql \
  >"$logdir/a.log" 2>&1 &
pid_a=$!

ready=0
for attempt in $(seq 1 150); do
  count=$(psql -X -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='schoolnet_lot5de_finalizer' AND state='active' AND query LIKE '%pg_sleep(11)%'")
  if [[ "$count" = "1" ]]; then ready=1; break; fi
  if ! kill -0 "$pid_a" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" -ne 1 ]]; then
  echo "5D-E FAIL: finalizer was not locked inside open transaction" >&2
  cat "$logdir/a.log" >&2
  exit 12
fi

set +e
psql -X -v ON_ERROR_STOP=1 \
  -f scripts/lot5d/legacy_cross_upsert_b.sql \
  >"$logdir/b.log" 2>&1
rc_b=$?
set -e
if [[ "$rc_b" -eq 0 ]] || ! grep -qi "lock timeout" "$logdir/b.log"; then
  echo "5D-E FAIL: legacy RPC should wait on school_years until timeout" >&2
  cat "$logdir/b.log" >&2
  exit 13
fi
wait "$pid_a"
pid_a=""
grep -q "5D-E A COMMITTED" "$logdir/a.log"
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/legacy_cross_postcheck.sql
echo "PASS - 5D-E: guarded legacy RPC read-after-lock; archive freeze; family and report history unchanged"
