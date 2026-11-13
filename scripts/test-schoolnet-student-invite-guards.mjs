import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSchoolnetNoEmailStudent, isInvitationSessionEligible } from "../src/features/auth/lib/schoolnetStudentInviteGuards.ts";

const student = { user: { app_metadata: { schoolnet_no_email_student: true } } };
const parent = { user: { app_metadata: { schoolnet_family_invitation: true } } };
const ordinary = { user: { app_metadata: {} } };

test("01 - invitation scolaire reservee au marqueur Auth de l'enfant", () => {
  assert.equal(isInvitationSessionEligible(student, "student-invite"), true);
  assert.equal(isInvitationSessionEligible(parent, "student-invite"), false);
  assert.equal(isInvitationSessionEligible(ordinary, "student-invite"), false);
});
test("02 - user_metadata ne peut pas justifier une invitation scolaire", () => {
  const forged = { user: { app_metadata: {}, user_metadata: { schoolnet_no_email_student: true } } };
  assert.equal(isInvitationSessionEligible(forged, "student-invite"), false);
});
test("03 - marqueurs familiaux et scolaires simultanes: refus", () => {
  assert.equal(isInvitationSessionEligible({
    user: { app_metadata: { schoolnet_no_email_student: true, schoolnet_family_invitation: true } },
  }, "student-invite"), false);
});
test("04 - invitation Parent existante conservee", () => {
  assert.equal(isInvitationSessionEligible(parent, "family-invite"), true);
  assert.equal(isInvitationSessionEligible(student, "family-invite"), false);
  assert.equal(isInvitationSessionEligible(ordinary, "family-invite"), false);
});
test("05 - recuperation de mot de passe ordinaire inchangee", () => {
  for(const session of [student, parent, ordinary]) {
    assert.equal(isInvitationSessionEligible(session, null), true);
  }
});
test("06 - aucune session, aucune invitation", () => {
  for(const mode of [null, "student-invite", "family-invite"]) {
    assert.equal(isInvitationSessionEligible(null, mode), false);
    assert.equal(isInvitationSessionEligible({ user: null }, mode), false);
  }
});
test("07 - marqueur scolaire strictement booleen", () => {
  for(const flag of ["true", 1, "1", false, {}, null, undefined]) {
    assert.equal(isSchoolnetNoEmailStudent({ app_metadata: { schoolnet_no_email_student: flag } }), false);
  }
  assert.equal(isSchoolnetNoEmailStudent(student.user), true);
});
test("08 - controle d'activation effectue avant lecture du profil", () => {
  const source = readFileSync(new URL("../src/lib/auth/AuthProvider.tsx", import.meta.url), "utf8");
  const gate = source.indexOf('supabase.rpc("schoolnet_no_email_my_session_enabled")');
  const profile = source.indexOf("const profile = await fetchProfileSafe(session.user.id)");
  assert.ok(gate > -1 && profile > gate);
  assert.match(source, /checkError \|\| enabled !== true/);
});
test("09 - verification distante du marqueur avant modification du mot de passe", () => {
  const source = readFileSync(new URL("../src/features/auth/pages/ResetPasswordPage.tsx", import.meta.url), "utf8");
  const verify = source.indexOf("supabase.auth.getUser()");
  const change = source.indexOf("supabase.auth.updateUser({ password })");
  assert.ok(verify > -1 && change > verify);
  assert.match(source, /isInvitationSessionEligible\([\s\S]*verified\?\.user/);
});
test("10 - l'interface ne pretend pas que la connexion scolaire est ouverte", () => {
  const reset = readFileSync(new URL("../src/features/auth/pages/ResetPasswordPage.tsx", import.meta.url), "utf8");
  assert.match(reset, /l'administration vous informera lorsque la connexion scolaire sera disponible/);
  assert.doesNotMatch(reset, /VITE_SCHOOLNET_STUDENT_LOGIN_RELEASE_ENABLED/);
});
