#!/usr/bin/env bash
# GitHub Actions PostgreSQL 17 disposable container only. Never production.
set -euo pipefail
if [[ "$PGHOST" != "127.0.0.1" || "$PGDATABASE" != "schoolnet_lot5d_ci" || "$PGUSER" != "postgres" ]]; then
  echo "REFUS : base non ephemere ou hote non local" >&2
  exit 10
fi
if [[ -n "$(printenv SUPABASE_DB_URL || true)" || -n "$(printenv DATABASE_URL || true)" || -n "$(printenv SUPABASE_SERVICE_ROLE_KEY || true)" ]]; then
  echo "REFUS : variables d'environnement de production detectees" >&2
  exit 11
fi
workdir=$(mktemp -d)
pid_a=""
cleanup() {
  if [[ -n "$pid_a" ]] && kill -0 "$pid_a" 2>/dev/null; then
    kill "$pid_a" 2>/dev/null || true
    wait "$pid_a" 2>/dev/null || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/concurrency_prepare.sql >"$workdir/prepare.log" 2>&1
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/concurrency_session_a.sql >"$workdir/session_a.log" 2>&1 &
pid_a=$!

# Readiness emitted only after successful finalizer within still-open transaction A.
ready=0
for attempt in $(seq 1 150); do
  if grep -q 'SESSION_A_FINALIZED_UNCOMMITTED' "$workdir/session_a.log"; then
    ready=1
    break
  fi
  if ! kill -0 "$pid_a" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" -ne 1 ]]; then
  echo "CONCURRENCY FAIL: session A did not reach locked section" >&2
  cat "$workdir/session_a.log" >&2
  exit 12
fi

set +e
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/concurrency_session_b.sql >"$workdir/session_b.log" 2>&1
rc_b=$?
set -e
if [[ "$rc_b" -eq 0 ]] || ! grep -qi 'lock timeout' "$workdir/session_b.log"; then
  echo "CONCURRENCY FAIL: session B should fail with lock timeout while A is locked" >&2
  cat "$workdir/session_b.log" >&2
  exit 13
fi

wait "$pid_a"
pid_a=""
grep -q 'SESSION_A_COMMITTED' "$workdir/session_a.log"
psql -X -v ON_ERROR_STOP=1 -f scripts/lot5d/concurrency_postcheck.sql
echo "PASS - Lot 5D-A+B: 2 real PG connections, 1 commit, 1 lock timeout, replay and audit verified"
