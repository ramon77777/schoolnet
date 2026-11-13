// SCHOOLNET - Lot 5.C-B.2 - primitives d'identite apprenant SANS e-mail personnel.
// Serveur uniquement : ne jamais importer ce module dans une page React.
// Aucune creation Auth, aucune notification, aucune ecriture SQL ici.

export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^SN-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})$/;
const INVALID_CODE = "Identifiant scolaire invalide.";
const INVALID_PHONE = "Numero de telephone familial invalide.";

/** Code opaque non sequentiel, 12 caracteres de 5 bits = 60 bits. */
export function generateSchoolnetStudentCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const text = Array.from(bytes, (value) => STUDENT_CODE_ALPHABET[value & 31]).join("");
  return `SN-${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`;
}

/** Les separations et la casse peuvent changer ; aucun autre caractere n'est accepte. */
export function normalizeSchoolnetStudentCode(value: string): string {
  if (typeof value !== "string" || value.length > 60) throw new Error(INVALID_CODE);
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^SN[A-HJ-NP-Z2-9]{12}$/.test(compact)) throw new Error(INVALID_CODE);
  const code = `SN-${compact.slice(2, 6)}-${compact.slice(6, 10)}-${compact.slice(10, 14)}`;
  if (!CODE_PATTERN.test(code)) throw new Error(INVALID_CODE);
  return code;
}

/** Le +225 est ajoute uniquement pour un mobile ivoirien de 10 chiffres. */
export function normalizeSchoolnetFamilyPhone(value: string): string {
  if (typeof value !== "string" || value.length > 64 || !/^[+\d\s().-]+$/.test(value)) {
    throw new Error(INVALID_PHONE);
  }
  const compact = value.replace(/[\s().-]/g, "");
  let e164 = compact;
  if (/^0[157]\d{8}$/.test(e164)) e164 = `+225${e164}`;
  else if (/^2250[157]\d{8}$/.test(e164)) e164 = `+${e164}`;
  else if (/^00225(0[157]\d{8})$/.test(e164)) e164 = `+${e164.slice(2)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) throw new Error(INVALID_PHONE);
  return e164;
}

/** Empreinte HMAC serveur pour recherche privee ; ne JAMAIS exposer la cle HMAC. */
export async function studentCodeLookupDigest(code: string, serverPepper: string): Promise<string> {
  const normalized = normalizeSchoolnetStudentCode(code);
  if (typeof serverPepper !== "string" || new TextEncoder().encode(serverPepper).length < 32) {
    throw new Error("Configuration serveur de l'identifiant scolaire indisponible.");
  }
  const secret = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(serverPepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const message = new TextEncoder().encode(`schoolnet/student-code/v1:${normalized}`);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", secret, message));
  return Array.from(digest, (octet) => octet.toString(16).padStart(2, "0")).join("");
}

/** PROTOTYPE SANDBOX : .invalid ne recoit aucun e-mail, ni confirmation, ni reset. */
export function generateSandboxOnlyAuthEmail(): string {
  return `sn-${crypto.randomUUID().replace(/-/g, "")}@schoolnet.invalid`;
}
