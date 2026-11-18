#!/usr/bin/env node
/**
 * Vérification locale UNIQUEMENT. Aucun appel réseau, aucune écriture.
 * Utilisation future : npm run sandbox:check -- --file .env.sandbox.local
 * Ne jamais afficher une clé ou une URL de l'utilisateur dans les logs.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  parseSandboxEnv,
  validateSandboxEnvironment,
} from "./lib/schoolnet-sandbox-env.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--file" ||
      path.basename(args[1]) !== ".env.sandbox.local") {
    process.stderr.write(
      "REFUS: utilisez --file .env.sandbox.local (configuration locale ignoree par Git).\n",
    );
    process.exitCode = 2;
    return;
  }

  const candidate = path.resolve(process.cwd(), args[1]);
  const projectRoot = path.resolve(process.cwd());
  if (candidate !== path.join(projectRoot, ".env.sandbox.local")) {
    process.stderr.write("REFUS: le fichier doit etre a la racine du projet.\n");
    process.exitCode = 2;
    return;
  }

  let source;
  try {
    source = await readFile(candidate, "utf8");
  } catch {
    process.stderr.write(
      "REFUS: .env.sandbox.local absent. Aucun projet de test n'est configure.\n",
    );
    process.exitCode = 2;
    return;
  }

  const parsed = parseSandboxEnv(source);
  const result = validateSandboxEnvironment(parsed.env, parsed.issues);
  if (!result.valid) {
    process.stderr.write("REFUS: configuration de recette non conforme.\n");
    for (const issue of result.issues) {
      process.stderr.write(" - " + issue + "\n");
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    "OK: configuration syntaxique sandbox distincte, sans secret interdit.\n" +
    "ECRITURES DESACTIVEES : aucun backend ni frontend sandbox n'a ete active.\n" +
    "Aucun appel reseau ou projet Supabase touche.\n",
  );
}

await main();
