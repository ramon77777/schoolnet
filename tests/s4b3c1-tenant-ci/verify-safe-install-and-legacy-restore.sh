#!/usr/bin/env bash
# SCHOOLNET C.1 - tests destructifs limites au PostgreSQL CI jetable local.
# Executer APRES rollback-a-b.sql et AVANT le rollback B.4.
# Etat initial et final : nouvelles API C.1 absentes, trois RPC V1 durcies.
# Aucune URI distante n'est acceptee ; ne jamais utiliser le projet principal.
set -euo pipefail

: "${DB_URL:?DB_URL doit designer le PostgreSQL CI jetable sur 127.0.0.1:54342}"
case "$DB_URL" in
  postgresql://*@127.0.0.1:54342/postgres|postgres://*@127.0.0.1:54342/postgres) ;;
  *)
    printf '%s\n' 'Refus : seul PostgreSQL CI sur 127.0.0.1:54342/postgres est autorise.' >&2
    exit 2
    ;;
esac

sn_c1_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$sn_c1_script_dir/../.."
sn_c1_log="$(mktemp)"
trap 'rm -f -- "$sn_c1_log"' EXIT

sn_c1_psql() {
  psql --no-psqlrc --quiet --dbname="$DB_URL" --set=ON_ERROR_STOP=1 "$@"
}

sn_c1_expect_failure() {
  local sn_c1_expected="$1"
  local sn_c1_marker="$2"
  shift 2
  if sn_c1_psql "$@" >"$sn_c1_log" 2>&1; then
    printf '%s\n' "ECHEC : refus attendu ($sn_c1_expected)." >&2
    cat -- "$sn_c1_log" >&2
    exit 1
  fi
  if ! grep -Fq -- "$sn_c1_expected" "$sn_c1_log"; then
    printf '%s\n' "ECHEC : erreur inattendue, attendu $sn_c1_expected." >&2
    cat -- "$sn_c1_log" >&2
    exit 1
  fi
  printf '%s\n' "$sn_c1_marker"
}

# ON_ERROR_STOP arrete la connexion au refus ; --single-transaction garantit
# que la tentative entiere est annulee, sans effet partiel.
sn_c1_expect_failure \
  S4B3C1_LEGACY_RESTORE_REQUIRES_DISTINCT_GO \
  S4B3C1_LEGACY_RESTORE_DEFAULT_DENIED_PASS \
  --single-transaction \
  --file=supabase/verification/s4b3c1_legacy_parent_rpcs_restore_original_manual.sql

# GO technique EXCLUSIVEMENT pour cette fixture locale. Le script de restauration
# verifie les hashes durcis avant, puis hashes et ACL d'origine apres restauration.
sn_c1_psql --single-transaction \
  --command="SET LOCAL schoolnet.c1_allow_legacy_restore='yes';" \
  --file=supabase/verification/s4b3c1_legacy_parent_rpcs_restore_original_manual.sql

# Ce fichier ouvre sa propre transaction READ ONLY et termine par ROLLBACK.
sn_c1_psql \
  --file=supabase/verification/s4b3c1_parent_official_results_preflight_readonly.sql

# Changement volontaire d'un attribut de la definition capturee : C.1 doit
# refuser avant toute creation. Le changement STABLE est lui aussi annule.
sn_c1_expect_failure \
  S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT \
  S4B3C1_LEGACY_DRIFT_INSTALL_DENIED_PASS \
  --single-transaction \
  --command="ALTER FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) STABLE;" \
  --file=supabase/proposals/s4b3c1_parent_official_results.sql

# Le preflight de reinstallation prouve que la tentative precedente a bien
# conserve la definition/ACL d'origine. Revenir ensuite a l'etat de depart :
# V1 durcie et API C.1 absentes, pour poursuivre les rollbacks B.4/B.3.
sn_c1_psql --single-transaction \
  --file=supabase/proposals/s4b3c1_parent_official_results.sql
sn_c1_psql --single-transaction \
  --file=supabase/verification/s4b3c1_parent_official_results_rollback_manual.sql

printf '%s\n' 'S4B3C1_SAFE_INSTALL_AND_LEGACY_RESTORE_PASS'
