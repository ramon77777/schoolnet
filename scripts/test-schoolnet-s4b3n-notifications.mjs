// SCHOOLNET V2 — S4-B.3-N: contrats de notifications, sans appel reseau.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(path, "utf8");
const sql = file("supabase/proposals/s4b3n_school_assessment_notifications.sql");
const rollback = file("supabase/verification/s4b3n_school_assessment_notifications_rollback_manual.sql");
const appliedMigration = file("supabase/migrations/20261120130939_schoolnet_s4b3n_official_assessment_notifications.sql");
const aclProposal = file("supabase/proposals/s4b3n_legacy_assessment_notify_permission_hardening.sql");
const appliedAclMigration = file("supabase/migrations/20261120132205_schoolnet_s4b3n_legacy_assessment_notify_permission_hardening.sql");
const aclRollback = file("supabase/verification/s4b3n_legacy_assessment_notify_permission_rollback_manual.sql");
const ui = file("src/features/notifications/pages/NotificationsPage.tsx");
const bell = file("src/features/notifications/components/NotificationBell.tsx");
const fixture = file("tests/s4b3n-tenant-ci/fixtures/notifications-a-b.sql");
const ci = file(".github/workflows/schoolnet-s4b3n-notification-ci.yml");

test("La migration ne requiert aucun enregistrement ou paiement de donnees", () => {
  assert.match(sql, /PROPOSITION CI ISOLEE, NON INSTALLEE/);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM public\.notifications)\b/i);
});
test("Le chemin officiel n'utilise pas les inscriptions V1 pour les destinataires", () => {
  assert.match(sql, /S4B3N_ROUTING_OFFICIEL/);
  assert.match(sql, /schoolnet_private\.school_course_links/);
  assert.match(sql, /schoolnet_school_student_class_assignments/);
  assert.match(sql, /schoolnet_school_memberships/);
  assert.match(sql, /student_m\.member_role='student'/);
});
test("L'etablissement et la classe doivent coincider", () => {
  assert.match(sql, /student_a\.school_id=l\.school_id/);
  assert.match(sql, /student_a\.class_id=l\.class_id/);
  assert.match(sql, /student_a\.school_year_id=l\.school_year_id/);
  assert.match(sql, /student_a\.status='active'/);
});
test("Les affectations et memberships enseignants sont revalides a l'envoi", () => {
  assert.match(sql, /ta\.status='active'/);
  assert.match(sql, /teacher_m\.member_role='teacher' AND teacher_m\.status='active'/);
  assert.match(sql, /co\.status='active'/);
  assert.match(sql, /s\.status='active'/);
});
test("La notification ne contient ni question, ni note, ni soumission", () => {
  assert.doesNotMatch(sql, /\b(?:quiz_questions|submissions|grades|scores)\b/i);
  assert.match(sql, /pg_catalog\.left\(a\.title,180\)/);
});
test("Un brouillon et une evaluation non liee restent invisibles", () => {
  assert.match(sql, /a\.status::text='published' AND al\.status='active'/);
  assert.match(sql, /JOIN schoolnet_private\.school_assessment_links al/);
});
test("Les deux sens de publication et de rattachement sont pris en charge", () => {
  assert.match(sql, /TG_OP='INSERT'/);
  assert.match(sql, /TG_OP='UPDATE'/);
  assert.match(sql, /AFTER INSERT OR UPDATE OF status/);
  assert.match(sql, /notify_official_assessment_link_change/);
});
test("Le retrait est notifie uniquement aux destinataires deja informes", () => {
  assert.match(sql, /assessment_withdrawn/);
  assert.match(sql, /n\.event_key='assessment_published'/);
  assert.match(sql, /OLD\.status IS DISTINCT FROM NEW\.status/);
});
test("Le doublon est evite a la source", () => {
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(fixture, /S4B3N_PASS_DRAFT_THEN_PUBLISH_AND_IDEMPOTENCE/);
  assert.match(fixture, /S4B3N_PASS_LINK_AFTER_PUBLISH_AND_DUPLICATES/);
});
test("Les fonctions privees ne sont pas des RPC publiques", () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path=pg_catalog/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION/);
});
test("Le lien ouvre le cours officiel et non le moteur de remises V1", () => {
  assert.match(sql, /'\/app\/student\/school-courses\/'\|\|l\.course_id::text/);
  assert.doesNotMatch(sql, /\/app\/student\/assessments\/'\|\|l\.course_id/i);
  assert.match(bell, /notification\.action_url\.startsWith\("\/app\/"\)/);
});
test("Le filtre des notifications inclut la publication et le retrait", () => {
  assert.match(ui, /eventKey === "assessment_published" \|\| eventKey === "assessment_withdrawn"/);
  assert.match(ui, /query\.in\("event_key", \["assessment_published", "assessment_withdrawn"\]\)/);
});
test("Une base jetable teste l'isolation A\/B, les revocations et la RLS", () => {
  for(const marker of [
    "S4B3N_PASS_SCHOOL_A_B_DISJOINT",
    "S4B3N_PASS_REVOKED_STUDENT_SILENT",
    "S4B3N_PASS_REVOKED_CLASS_ASSIGNEE",
    "S4B3N_PASS_REVOKED_TEACHER_ASSIGNMENT",
    "S4B3N_PASS_SUSPENDED_SCHOOL_SILENT",
    "S4B3N_PASS_RLS_STUDENT_B",
    "S4B3N_PASS_V1_UNCHANGED",
  ]) assert.ok(fixture.includes(marker), marker);
});
test("Rollback cible preserve le flux V1 et n'efface pas l'historique", () => {
  assert.match(rollback, /DROP TRIGGER trg_s4b3n_official_assessment_link_notifications/);
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.notify_assessment_published/);
  assert.match(rollback, /S4B3N_ROLLBACK_PASS/);
  assert.doesNotMatch(rollback, /\b(?:DELETE FROM public\.notifications|TRUNCATE public\.notifications)\b/i);
});
test("La CI exploite uniquement Supabase local et verifie le retour arriere", () => {
  assert.match(ci, /supabase start -x/);
  assert.match(ci, /notification-core\.sql/);
  assert.match(ci, /notifications-a-b\.sql/);
  assert.match(ci, /s4b3n_school_assessment_notifications_rollback_manual\.sql/);
  assert.match(ci, /supabase stop --no-backup/);
  assert.doesNotMatch(ci, /supabase db push|supabase db reset --linked|vercel --prod/);
});


test("La migration 20261120130939 correspond octet pour octet au SQL de la CI", () => {
  assert.equal(appliedMigration, sql);
  assert.match(sql, /S4B3N_ROUTING_OFFICIEL/);
  assert.match(sql, /S4B3N_POSTFLIGHT_FAILED/);
});
test("Le durcissement du trigger historique conserve son fichier source distinct", () => {
  assert.match(aclProposal, /NON APPLIQUEE/);
  assert.match(aclProposal, /REVOKE ALL ON FUNCTION public\.notify_assessment_published\(\)/);
  assert.match(aclProposal, /FROM PUBLIC, anon, authenticated/);
  assert.match(aclProposal, /S4B3N_PERMISSIONS_HARDENING_PASS/);
  assert.doesNotMatch(aclProposal, /CREATE OR REPLACE FUNCTION|DROP TRIGGER|DELETE FROM public\./i);
});
test("La migration 20261120132205 correspond exactement au SQL de durcissement applique", () => {
  assert.equal(appliedAclMigration, aclProposal);
  assert.match(appliedAclMigration, /S4B3N_PERMISSIONS_HARDENING_PASS/);
  assert.match(appliedAclMigration, /REVOKE ALL ON FUNCTION public\.notify_assessment_published\(\)/);
});

test("Les controles ACL preservent le role service_role et le trigger", () => {
  assert.match(aclProposal, /has_function_privilege\('service_role',v_oid,'EXECUTE'\)/);
  assert.match(aclProposal, /trg_notify_assessment_published/);
  assert.match(fixture, /S4B3N_PASS_LEGACY_ACL_HARDENING/);
  assert.match(fixture, /S4B3N_PASS_LEGACY_TRIGGER_AFTER_REVOKE/);
});
test("Le rollback ACL restaure exactement les grants directs historiques", () => {
  assert.match(aclRollback, /GRANT EXECUTE ON FUNCTION public\.notify_assessment_published\(\)/);
  assert.match(aclRollback, /TO anon, authenticated/);
  assert.match(aclRollback, /S4B3N_PERMISSIONS_ROLLBACK_PASS/);
  assert.doesNotMatch(aclRollback, /GRANT EXECUTE.*TO PUBLIC|DROP FUNCTION|DELETE FROM public\./i);
});
test("La CI isole le durcissement et sa restauration, sans aucune commande prod", () => {
  assert.match(ci, /s4b3n_legacy_assessment_notify_permission_hardening\.sql/);
  assert.match(ci, /20261120132205_schoolnet_s4b3n_legacy_assessment_notify_permission_hardening\.sql/);
  assert.match(ci, /s4b3n_legacy_assessment_notify_permission_rollback_manual\.sql/);
  assert.match(ci, /20261120130939_schoolnet_s4b3n_official_assessment_notifications\.sql/);
  assert.doesNotMatch(ci, /supabase db push|supabase db reset --linked|vercel --prod/);
});
