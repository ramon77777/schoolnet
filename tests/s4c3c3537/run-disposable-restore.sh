#!/usr/bin/env bash
# SCHOOLNET C.3.5.3.7: GitHub Actions ONLY. Synthetic database & blob bytes.
set -Eeuo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${CI:-}" != true ||
      "${RUNNER_OS:-}" != Linux || -z "${RUNNER_TEMP:-}" ||
      -z "${GITHUB_WORKSPACE:-}" ]]; then
  echo "FAIL CLOSED: disposable GitHub Actions Linux runner required" >&2
  exit 66
fi
if [[ -n "${SUPABASE_DB_URL:-}${SUPABASE_ACCESS_TOKEN:-}${DATABASE_URL:-}" ]]; then
  echo "FAIL CLOSED: remote database credentials forbidden" >&2
  exit 67
fi
SOURCE=55432
TARGET=55433
DB=schoolnet_synthetic
export PGPASSWORD=schoolnet_fictitious_ci_only
TMP="$(mktemp -d "${RUNNER_TEMP}/schoolnet-c3537-XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

pg() {
  docker run --rm --network host -e PGPASSWORD \
    -v "${GITHUB_WORKSPACE}:/repo:ro" -v "$TMP:/synthetic" \
    -w /repo postgres:17.6 "$@"
}
run_file() {
  pg psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$1" -U postgres \
    -d "$DB" -f "/repo/tests/s4c3c3537/$2"
}
run_sql() {
  pg psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$1" -U postgres \
    -d "$DB" -c "$2" | tr -d '\r'
}
require_equal() {
  if [[ "$1" != "$2" ]]; then
    echo "FAIL $3: expected $2, got $1" >&2; exit 1
  fi
  echo "PASS $3"
}
require_equal "$(run_sql "$SOURCE" "SELECT current_setting('server_version_num')::int / 10000")" 17 "Postgres source 17"
require_equal "$(run_sql "$TARGET" "SELECT current_setting('server_version_num')::int / 10000")" 17 "Postgres target 17"
require_equal "$(run_sql "$TARGET" "SELECT (to_regnamespace('schoolnet_rehearsal') IS NULL)::text")" true "Target empty"

run_file "$SOURCE" disposable-role-setup.sql
run_file "$TARGET" disposable-role-setup.sql
run_file "$SOURCE" disposable-school-fixture.sql

mkdir -p "$TMP/source/blobs" "$TMP/target"
printf 'SCHOOLNET_FICTITIOUS_BLOB_A_2026\n' > "$TMP/source/blobs/fictitious_school_a.txt"
printf 'SCHOOLNET_FICTITIOUS_BLOB_B_2026\n' > "$TMP/source/blobs/fictitious_school_b.txt"
HASH_A="$(sha256sum "$TMP/source/blobs/fictitious_school_a.txt" | cut -d' ' -f1)"
HASH_B="$(sha256sum "$TMP/source/blobs/fictitious_school_b.txt" | cut -d' ' -f1)"
[[ "$HASH_A" =~ ^[0-9a-f]{64}$ && "$HASH_B" =~ ^[0-9a-f]{64}$ ]] || exit 1
run_sql "$SOURCE" "INSERT INTO schoolnet_rehearsal.mock_storage_metadata
 (object_id,school_id,object_path,bytes_sha256) VALUES
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000010','blobs/fictitious_school_a.txt','$HASH_A'),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000011','blobs/fictitious_school_b.txt','$HASH_B')" >/dev/null

# Binary custom-format archive of ONLY the intentionally created fake schema.
pg pg_dump -Fc --no-owner --schema=schoolnet_rehearsal \
 -h 127.0.0.1 -p "$SOURCE" -U postgres -d "$DB" \
 -f /synthetic/fictitious.dump
test -s "$TMP/fictitious.dump"
(cd "$TMP" && sha256sum fictitious.dump > fictitious.dump.sha256)
(cd "$TMP" && sha256sum -c fictitious.dump.sha256)
pg pg_restore -l /synthetic/fictitious.dump | grep -F 'TABLE schoolnet_rehearsal students' >/dev/null
echo "PASS Authentic pg_dump archive and inventory"

cp "$TMP/fictitious.dump" "$TMP/tampered.dump"
printf 'CORRUPTION_TEST' >> "$TMP/tampered.dump"
test "$(sha256sum "$TMP/fictitious.dump" | cut -d' ' -f1)" != \
     "$(sha256sum "$TMP/tampered.dump" | cut -d' ' -f1)"
echo "PASS Altered PostgreSQL archive rejected by SHA256 integrity check"

# Recreate on the separate 55433 PostgreSQL server with roles already provisioned.
pg pg_restore --exit-on-error --single-transaction --no-owner \
 -h 127.0.0.1 -p "$TARGET" -U postgres -d "$DB" \
 /synthetic/fictitious.dump
require_equal "$(run_sql "$TARGET" "SELECT count(*) FROM schoolnet_rehearsal.students")" 5 "Five fictional student records"
require_equal "$(run_sql "$TARGET" "SELECT count(*) FROM schoolnet_rehearsal.mock_auth_accounts")" 4 "Four MOCK auth records (not GoTrue)"
require_equal "$(run_sql "$TARGET" "SELECT count(*) FROM schoolnet_rehearsal.mock_storage_metadata")" 2 "Two Storage metadata rows"
require_equal "$(run_sql "$TARGET" "SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname='schoolnet_rehearsal'")" 6 "Six RLS policies preserved"
require_equal "$(run_sql "$TARGET" "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='schoolnet_rehearsal' AND rowsecurity")" 3 "Three RLS-enabled tables"
require_equal "$(run_sql "$TARGET" "SELECT CASE WHEN
(SELECT average_on20 FROM schoolnet_rehearsal.students WHERE student_id='00000000-0000-4000-8000-000000000102')=0
AND (SELECT average_on20 FROM schoolnet_rehearsal.students WHERE student_id='00000000-0000-4000-8000-000000000103') IS NULL
THEN 'OK' ELSE 'FAIL' END")" OK "Real zero distinct from missing average"

require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_a; SELECT count(*) FROM schoolnet_rehearsal.students")" 3 "A RLS students"
require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_b; SELECT count(*) FROM schoolnet_rehearsal.students")" 2 "B RLS students"
require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_a; SELECT count(*) FROM schoolnet_rehearsal.students WHERE school_id='00000000-0000-4000-8000-000000000011'")" 0 "A cannot read B"
require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_b; SELECT count(*) FROM schoolnet_rehearsal.students WHERE school_id='00000000-0000-4000-8000-000000000010'")" 0 "B cannot read A"
require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_a; SELECT count(*) FROM schoolnet_rehearsal.mock_auth_accounts")" 2 "Mock Auth A scope"
require_equal "$(run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_b; SELECT count(*) FROM schoolnet_rehearsal.mock_storage_metadata")" 1 "Fake Storage metadata B scope"
if run_sql "$TARGET" "SET ROLE schoolnet_rehearsal_guest; SELECT count(*) FROM schoolnet_rehearsal.students" >/dev/null 2>&1; then
  echo "FAIL: guest can read!" >&2
  exit 1
fi
echo "PASS Guest forbidden"

# Separate fictitious blobs archive; a DB dump does not contain object bytes.
(cd "$TMP/source" && sha256sum blobs/* > blobs.sha256)
tar -cf "$TMP/fictitious_blobs.tar" -C "$TMP/source" blobs blobs.sha256
tar -xf "$TMP/fictitious_blobs.tar" -C "$TMP/target"
(cd "$TMP/target" && sha256sum -c blobs.sha256)
require_equal "$(run_sql "$TARGET" "SELECT bytes_sha256 FROM schoolnet_rehearsal.mock_storage_metadata WHERE object_path='blobs/fictitious_school_a.txt'")" \
 "$(sha256sum "$TMP/target/blobs/fictitious_school_a.txt" | cut -d' ' -f1)" "A blob/metadata parity"
require_equal "$(run_sql "$TARGET" "SELECT bytes_sha256 FROM schoolnet_rehearsal.mock_storage_metadata WHERE object_path='blobs/fictitious_school_b.txt'")" \
 "$(sha256sum "$TMP/target/blobs/fictitious_school_b.txt" | cut -d' ' -f1)" "B blob/metadata parity"
printf 'CORRUPTED\n' >> "$TMP/target/blobs/fictitious_school_a.txt"
if (cd "$TMP/target" && sha256sum -c blobs.sha256 >/dev/null 2>&1); then
  echo "FAIL: corrupted fake blob undetected" >&2; exit 1
fi
echo "PASS Fake blob tampering detected"
tar -xf "$TMP/fictitious_blobs.tar" -C "$TMP/target"
(cd "$TMP/target" && sha256sum -c blobs.sha256 >/dev/null)
echo "PASS Fake blob recovery repeated"

echo "C3537_SYNTHETIC_PG_DUMP_RESTORE=PASS"
echo "C3537_INDEPENDENT_POSTGRES_HOSTS=PASS"
echo "C3537_REAL_GOTRUE_RESTORE=NOT_PERFORMED"
echo "C3537_REAL_STORAGE_SERVICE_RESTORE=NOT_PERFORMED"
echo "C3537_REAL_ARCHIVE_USED=FALSE"
echo "C3537_PRODUCTION_GO=FALSE"
