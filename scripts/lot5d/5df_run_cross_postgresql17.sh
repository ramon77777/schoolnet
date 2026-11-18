#!/usr/bin/env bash
# SCHOOLNET Lot 5D-F full historical RPCs: two PG17 sessions, never real Supabase.
set -euo pipefail
if [[ "$PGHOST" != "127.0.0.1" || "$PGDATABASE" != "schoolnet_lot5d_ci" || "$PGUSER" != "postgres" ]]; then
  echo "REFUS: uniquement la base PostgreSQL 17 ephemere SCHOOLNET" >&2
  exit 10
fi
for key in SUPABASE_DB_URL DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL; do
  if [[ -n "$(printenv "$key" || true)" ]]; then
    echo "REFUS: variable de connexion non isolee $key" >&2
    exit 11
  fi
done
scenario="$1"
case "$scenario" in
  upsert) session_b="scripts/lot5d/5df_cross_upsert_b.sql" ;;
  status) session_b="scripts/lot5d/5df_cross_status_b.sql" ;;
  *) echo "Scenario F inconnu" >&2; exit 12 ;;
esac

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

psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/legacy_cross_prepare.sql >"$logdir/prepare.log" 2>&1
PGAPPNAME=schoolnet_5df_finalizer psql -X -v ON_ERROR_STOP=1 \
  -f scripts/lot5d/legacy_cross_finalizer_a.sql >"$logdir/a.log" 2>&1 &
pid_a=$!

ready=0
for attempt in $(seq 1 150); do
  running=$(psql -X -v ON_ERROR_STOP=1 -tAc \
    "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='schoolnet_5df_finalizer' AND state='active' AND query LIKE '%pg_sleep(11)%'")
  if [[ "$running" = "1" ]]; then ready=1; break; fi
  if ! kill -0 "$pid_a" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" -ne 1 ]]; then
  echo "F FAIL: session A did not reach locked finalizer" >&2
  cat "$logdir/a.log" >&2
  exit 13
fi

set +e
psql -X -v ON_ERROR_STOP=1 -f "$session_b" >"$logdir/b.log" 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]] || ! grep -qi "lock timeout" "$logdir/b.log"; then
  echo "F FAIL: $scenario should block on school_years before stale read" >&2
  cat "$logdir/b.log" >&2
  exit 14
fi
wait "$pid_a"
pid_a=""
grep -q "5D-E A COMMITTED" "$logdir/a.log"
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/5df_full_regression_post_postgresql17.sql
run_count=$(psql -X -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM public.school_year_rollover_runs")
if [[ "$run_count" != "1" ]]; then
  echo "F FAIL: unexpected rollover run count" >&2
  exit 15
fi
echo "PASS - LOT 5D-F ($scenario): 2 real PG17 sessions, 1 committed finalization, 1 expected lock timeout, 13 post-assertions ROLLBACK"
