// Tests hors ligne : aucune connexion Supabase, aucun compte ni ecriture.
import {
  evaluateFamilyActivationProof,
  type FamilyActivationEvidenceInput,
  type FamilyActivationProofState,
} from "./familyActivationEvidence.ts";

const USER = "24d6d42d-420a-44a6-8baa-31896a0d8efa";
const REQUEST = "1e511ceb-75ab-4739-b865-4cf84cd84f4e";
const ADMIN = "85fd6818-3a09-4bb3-aafd-76f9a09cd41d";

function fixture(): FamilyActivationEvidenceInput {
  return {
    nowIso: "2026-11-11T18:00:00Z",
    invitation: {
      request_id: REQUEST, recipient: "parent", expected_role: "parent",
      email: "parent@example.test", user_id: USER,
      status: "sent_declared", generation_count: 1,
      last_prepared_at: "2026-11-11T17:00:00Z",
      sent_declared_at: "2026-11-11T17:10:00Z", sent_declared_by: ADMIN,
    },
    authUser: { id: USER, email: "parent@example.test" },
    profile: { id: USER, role: "parent" },
    passwordUpdated: {
      source: "supabase_auth_audit", user_id: USER,
      action: "user_updated_password", happened_at: "2026-11-11T17:20:00Z",
    },
    validPasswordVerified: {
      source: "password_verification_hook", user_id: USER,
      valid: true, happened_at: "2026-11-11T17:21:00Z",
    },
    passwordLogin: {
      source: "supabase_auth_audit", user_id: USER,
      action: "login", happened_at: "2026-11-11T17:21:10Z",
    },
  };
}

function verify(name: string, mutate: (item: FamilyActivationEvidenceInput) => void,
  expected: FamilyActivationProofState, verified = false) {
  Deno.test(name, () => {
    const item = fixture();
    mutate(item);
    const output = evaluateFamilyActivationProof(item);
    if (output.state !== expected || output.verified !== verified) {
      throw new Error(name + ": attendu " + expected + "/" + verified +
        ", obtenu " + output.state + "/" + output.verified);
    }
  });
}

verify("preuve purement simulee coherente : logique OK (PAS de preuve de production)",
  () => {}, "verified", true);
verify("aucune invitation n'est jamais activee", x => { x.invitation = null; }, "not_applicable");
verify("lien prepare mais non remis => aucune activation", x => {
  x.invitation!.status = "prepared";
  x.invitation!.sent_declared_at = null;
  x.invitation!.sent_declared_by = null;
}, "awaiting_delivery");
verify("une declaration manquante ne suffit pas", x => {
  x.invitation!.sent_declared_by = null;
}, "awaiting_delivery");
verify("un statut activated seul ne constitue jamais une preuve", x => {
  x.invitation!.status = "activated";
  x.passwordUpdated = null; x.validPasswordVerified = null; x.passwordLogin = null;
}, "requires_review");
verify("preuves non configurees => refus", x => {
  x.authUser = null; x.profile = null;
  x.passwordUpdated = null; x.validPasswordVerified = null; x.passwordLogin = null;
}, "evidence_source_unavailable");
verify("getUser sans preuve password refuse", x => {
  x.passwordUpdated = null;
}, "evidence_source_unavailable");
verify("login seul n'est pas preuve de changement", x => {
  x.passwordUpdated = null; x.validPasswordVerified = null;
}, "evidence_source_unavailable");
verify("un token ou email confirme ne suffit pas", x => {
  x.passwordUpdated = null; x.validPasswordVerified = null; x.passwordLogin = null;
  Object.assign(x, { signedIn: true, emailConfirmed: true, jwt: "FAKE" });
}, "evidence_source_unavailable");
verify("user Auth different refuse", x => { x.authUser!.id = ADMIN; }, "identity_mismatch");
verify("email Auth differente refuse", x => { x.authUser!.email = "bad@example.test"; }, "identity_mismatch");
verify("role profil different refuse", x => { x.profile!.role = "student"; }, "identity_mismatch");
verify("id profil different refuse", x => { x.profile!.id = ADMIN; }, "identity_mismatch");
verify("preuve changement de mot de passe autre utilisateur refuse", x => {
  x.passwordUpdated!.user_id = ADMIN;
}, "identity_mismatch");
verify("verification de mot de passe autre utilisateur refuse", x => {
  x.validPasswordVerified!.user_id = ADMIN;
}, "identity_mismatch");
verify("login autre utilisateur refuse", x => { x.passwordLogin!.user_id = ADMIN; }, "identity_mismatch");
verify("action incorrecte refuse", x => {
  x.passwordUpdated!.action = "login";
}, "identity_mismatch");
verify("source d'audit non fiable refuse", x => {
  x.passwordUpdated!.source = "client" as "supabase_auth_audit";
}, "identity_mismatch");
verify("verification negative refuse", x => {
  x.validPasswordVerified!.valid = false as true;
}, "identity_mismatch");
verify("source du hook non fiable refuse", x => {
  x.validPasswordVerified!.source = "browser" as "password_verification_hook";
}, "identity_mismatch");
verify("preuve avant envoi refusee", x => {
  x.passwordUpdated!.happened_at = "2026-11-11T17:05:00Z";
}, "invalid_chronology");
verify("preuve a l'instant de l'envoi refusee", x => {
  x.passwordUpdated!.happened_at = "2026-11-11T17:10:00Z";
}, "invalid_chronology");
verify("mauvais ordre password-login refuse", x => {
  x.validPasswordVerified!.happened_at = "2026-11-11T17:19:00Z";
}, "invalid_chronology");
verify("login precede verification refuse", x => {
  x.passwordLogin!.happened_at = "2026-11-11T17:20:59Z";
}, "invalid_chronology");
verify("login trop eloigne du hook refuse", x => {
  x.passwordLogin!.happened_at = "2026-11-11T17:30:00Z";
}, "invalid_chronology");
verify("preuve dans le futur refusee", x => {
  x.passwordLogin!.happened_at = "2026-11-11T18:10:00Z";
}, "invalid_chronology");
verify("date non UTC refusee", x => {
  x.passwordUpdated!.happened_at = "2026-11-11 17:20:00";
}, "invalid_chronology");
verify("date d'envoi anterieure a preparation refusee", x => {
  x.invitation!.sent_declared_at = "2026-11-11T16:59:00Z";
}, "invalid_chronology");
verify("generation nulle refusee", x => {
  x.invitation!.generation_count = 0;
}, "identity_mismatch");
verify("statut activated coherent SANS preuve refuse", x => {
  x.invitation!.status = "activated"; x.authUser = null;
}, "requires_review");
