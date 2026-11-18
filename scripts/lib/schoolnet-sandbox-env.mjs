/**
 * SCHOOLNET — validation STRICTEMENT locale d'une configuration de recette.
 * Pas de requete reseau, aucune connexion Supabase, aucune mutation.
 * Toutes les erreurs sont des CODES sans afficher URL, cle ou identifiants.
 * Ce module NE DEVERROUILLE PAS le frontend ni les RPC SQL existantes.
 */
export const PRODUCTION_APP_ORIGIN = "https://schoolnet-snowy.vercel.app";
export const PRODUCTION_SUPABASE_URL = "https://anttmbhaphkhmkoqsofd.supabase.co";

export const REQUIRED_SANDBOX_ENV_KEYS = Object.freeze([
  "VITE_SCHOOLNET_ENVIRONMENT",
  "VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED",
  "VITE_SCHOOLNET_SANDBOX_APP_ORIGIN",
  "VITE_SCHOOLNET_SANDBOX_PROJECT_REF",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
]);

const allowedKeys = new Set(REQUIRED_SANDBOX_ENV_KEYS);
const refPattern = /^[a-z0-9]{20}$/;

export function parseSandboxEnv(source) {
  const env = Object.create(null);
  const issues = [];
  if (typeof source !== "string") return { env, issues: ["SOURCE_NOT_TEXT"] };

  for (const [index, line] of source.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const match = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) {
      issues.push("INVALID_LINE_" + (index + 1));
      continue;
    }
    const key = match[1];
    if (Object.hasOwn(env, key)) {
      issues.push("DUPLICATE_KEY_" + key);
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Aucun commentaire inline, interpolation ni shell eval implicite.
    if (/\$[{(]/.test(value) || /[\r\n]/.test(value)) {
      issues.push("INTERPOLATION_FORBIDDEN_" + key);
      continue;
    }
    env[key] = value;
  }
  return { env, issues };
}

function isCanonicalHttpsOrigin(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    const mainHostname = new URL(PRODUCTION_APP_ORIGIN).hostname;
    // Refuser le domaine officiel, ses sous-domaines et les suffixes pieges
    // du type "schoolnet-snowy.vercel.app.evil.example".
    const overlapsProduction =
      url.hostname === mainHostname ||
      url.hostname.endsWith("." + mainHostname) ||
      url.hostname.startsWith(mainHostname + ".");
    return url.origin === value && url.protocol === "https:" &&
      url.username === "" && url.password === "" && url.port === "" &&
      url.pathname === "/" && url.search === "" && url.hash === "" &&
      !overlapsProduction &&
      !url.hostname.endsWith(".invalid") &&
      url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

function isPublishableKey(value) {
  if (typeof value !== "string" || value.length < 30) return false;
  if (/REPLACE|EXAMPLE|PLACEHOLDER|SERVICE_ROLE|SECRET/i.test(value)) return false;
  if (value.startsWith("sb_publishable_")) {
    return /^sb_publishable_[a-zA-Z0-9_-]+$/.test(value);
  }
  // Les anciens JWT anon restent acceptables en frontend. Ne jamais
  // supposer que tous les JWT sont publics : verifier explicitement role=anon.
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && payload.role === "anon";
  } catch {
    return false;
  }
}

export function validateSandboxEnvironment(env, parseIssues = []) {
  const issues = [...parseIssues];
  if (!env || typeof env !== "object") return { valid: false, issues: ["ENV_MISSING"] };

  for (const key of Object.keys(env)) {
    if (!allowedKeys.has(key)) issues.push("UNEXPECTED_KEY_" + key);
  }
  for (const key of REQUIRED_SANDBOX_ENV_KEYS) {
    if (!Object.hasOwn(env, key) || !String(env[key]).trim()) {
      issues.push("MISSING_" + key);
    }
  }
  if (env.VITE_SCHOOLNET_ENVIRONMENT !== "sandbox") issues.push("SANDBOX_MODE_REQUIRED");
  // PREPARATION SEULEMENT : aucune activation des ecritures n'est autorisee
  // par ce validateur, meme si la base de test est futurement disponible.
  if (env.VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED !== "false") {
    issues.push("SANDBOX_WRITES_MUST_REMAIN_DISABLED");
  }

  const origin = env.VITE_SCHOOLNET_SANDBOX_APP_ORIGIN;
  if (!isCanonicalHttpsOrigin(origin)) issues.push("INVALID_SANDBOX_ORIGIN");
  if (origin === PRODUCTION_APP_ORIGIN) issues.push("PRODUCTION_ORIGIN_FORBIDDEN");

  const ref = env.VITE_SCHOOLNET_SANDBOX_PROJECT_REF;
  if (typeof ref !== "string" || !refPattern.test(ref)) {
    issues.push("INVALID_SANDBOX_PROJECT_REF");
  }
  const url = env.VITE_SUPABASE_URL;
  if (typeof url !== "string" || !refPattern.test(ref || "") ||
      url !== "https://" + ref + ".supabase.co") {
    issues.push("SUPABASE_URL_REF_MISMATCH");
  }
  if (url === PRODUCTION_SUPABASE_URL ||
      ref === new URL(PRODUCTION_SUPABASE_URL).hostname.split(".")[0]) {
    issues.push("PRODUCTION_SUPABASE_FORBIDDEN");
  }
  if (!isPublishableKey(env.VITE_SUPABASE_ANON_KEY)) {
    issues.push("UNSAFE_OR_MISSING_PUBLIC_KEY");
  }
  return { valid: issues.length === 0, issues };
}
