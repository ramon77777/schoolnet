// Test de logique locale, sans reseau, sans donnees des familles et sans ecriture Supabase.
// node --experimental-strip-types --test scripts/test-schoolnet-student-identity.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STUDENT_CODE_ALPHABET,
  generateSchoolnetStudentCode,
  normalizeSchoolnetStudentCode,
  normalizeSchoolnetFamilyPhone,
  studentCodeLookupDigest,
  generateSandboxOnlyAuthEmail,
} from "../supabase/functions/_shared/schoolnetStudentIdentity.ts";

const PEPPER_A = "sandbox-only-test-pepper-32-bytes-0123456789";
const PEPPER_B = "sandbox-only-other-pepper-32-bytes-987654";

test("Alphabet de 32 symboles distincts, sans caracteres ambigus", () => {
  assert.equal(STUDENT_CODE_ALPHABET.length, 32);
  assert.equal(new Set(STUDENT_CODE_ALPHABET).size, 32);
  assert.doesNotMatch(STUDENT_CODE_ALPHABET, /[I O01]/);
});

test("10 000 identifiants aleatoires conformes, sans collision observee", () => {
  const codes = Array.from({ length: 10_000 }, generateSchoolnetStudentCode);
  assert.equal(new Set(codes).size, 10_000);
  for (const code of codes) {
    assert.match(code, /^SN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(normalizeSchoolnetStudentCode(code), code);
  }
});

test("Code saisi sans tirets, avec espaces ou en minuscules", () => {
  assert.equal(normalizeSchoolnetStudentCode(" sn-abcd-efgh-jkmn "), "SN-ABCD-EFGH-JKMN");
  assert.equal(normalizeSchoolnetStudentCode("snabcd efgh jkmn"), "SN-ABCD-EFGH-JKMN");
  for (const wrong of ["SN-0000-0000-0000", "SN-ABCD-EFGH-JKM", "SN-ABCD-EFGH-JKMI", "SN-ABCD-EFGH-JKMO", "", "SN-' OR TRUE --"] ) {
    assert.throws(() => normalizeSchoolnetStudentCode(wrong));
  }
});

test("Telephone familial : quatre variantes ivoiriennes conduisent au meme E.164", () => {
  for (const input of ["07 12 34 56 78", "+225 07 12 34 56 78", "00225 07 12 34 56 78", "2250712345678"]) {
    assert.equal(normalizeSchoolnetFamilyPhone(input), "+2250712345678");
  }
  assert.equal(normalizeSchoolnetFamilyPhone("+33612345678"), "+33612345678");
  for (const wrong of ["07 12 34 56", "07abcdefgh", "225", "+225+0712345678", "07123456789", ""] ) {
    assert.throws(() => normalizeSchoolnetFamilyPhone(wrong));
  }
});

test("Empreinte stable, differente par code et par cle serveur", async () => {
  const code = "SN-ABCD-EFGH-JKMN";
  const digest = await studentCodeLookupDigest(code, PEPPER_A);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest, await studentCodeLookupDigest("snabcdefghjkmn", PEPPER_A));
  assert.notEqual(digest, await studentCodeLookupDigest("SN-ABCD-EFGH-JKMP", PEPPER_A));
  assert.notEqual(digest, await studentCodeLookupDigest(code, PEPPER_B));
  await assert.rejects(() => studentCodeLookupDigest(code, "court"));
});

test("Deux enfants peuvent partager le telephone mais pas leur compte ni leur code", async () => {
  const phone = normalizeSchoolnetFamilyPhone("07 12 34 56 78");
  const children = [0, 1].map(() => ({
    phone,
    code: generateSchoolnetStudentCode(),
    technicalEmail: generateSandboxOnlyAuthEmail(),
  }));
  assert.equal(children[0].phone, children[1].phone);
  assert.notEqual(children[0].code, children[1].code);
  assert.notEqual(children[0].technicalEmail, children[1].technicalEmail);
  assert.match(children[0].technicalEmail, /^sn-[0-9a-f]{32}@schoolnet\.invalid$/);
  assert.notEqual(await studentCodeLookupDigest(children[0].code, PEPPER_A), await studentCodeLookupDigest(children[1].code, PEPPER_A));
});
