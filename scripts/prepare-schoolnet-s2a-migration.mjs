// SCHOOLNET 2.0 - S2-A : preparer une migration VERSIONNEE sans la rendre
// executable par un "supabase db push" accidentel.
// Cette commande n'execute aucun SQL, ne contacte pas la base distante,
// ne modifie ni les migrations existantes ni la production.
//
// Usage depuis la racine du depot : node scripts/prepare-schoolnet-s2a-migration.mjs

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const slug = "schoolnet_s2a_classes_tenant_foundation";
const migrationsDir = join(root, "supabase", "migrations");
const stagingDir = join(root, "supabase", "proposals", "staged");
const proposalPath = join(
  root, "supabase", "proposals", "s2_school_classes_tenant_foundation.sql"
);

const fail = (message) => {
  console.error("[S2-A] ERREUR :", message);
  process.exitCode = 1;
};

const existingMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(`_${slug}.sql`));
const existingStaged = existsSync(stagingDir)
  ? readdirSync(stagingDir).filter((name) => name.endsWith(`_${slug}.sql`))
  : [];

if (existingMigrations.length || existingStaged.length) {
  fail(
    "Une migration S2-A est deja preparee. Aucun fichier ne sera ecrase : " +
    [...existingMigrations, ...existingStaged].join(", ")
  );
} else {
  const proposal = readFileSync(proposalPath, "utf8");
  const required = [
    "Lot S2-A - PROPOSITION NON APPLIQUEE",
    "classes_school_id_fkey",
    "classes_learning_context_chk",
    "classes_school_unique_name_year_idx",
    "classes_select_school_admin_own_school",
    "classes_legacy_level_name_year_idx",
  ];

  if (!required.every((marker) => proposal.includes(marker))) {
    fail("La proposition SQL S2-A ne correspond plus au contenu valide.");
  } else {
    const before = new Set(readdirSync(migrationsDir));
    const isWindows = process.platform === "win32";
    const result = spawnSync(
      isWindows ? "npx.cmd" : "npx",
      ["supabase", "migration", "new", slug],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        shell: isWindows,
        timeout: 120_000,
      }
    );

    if (result.status !== 0 || result.error) {
      fail(
        "La CLI Supabase n'a pas cree la migration. " +
        String(result.stderr || result.stdout || result.error || "")
          .slice(0, 1800) +
        "\nVerifier localement : npx supabase --version"
      );
    } else {
      const created = readdirSync(migrationsDir)
        .filter((name) => !before.has(name) && name.endsWith(`_${slug}.sql`));

      if (created.length !== 1) {
        fail(
          "Impossible d'identifier un seul nouveau fichier Supabase. " +
          "Verifier le dossier supabase/migrations manuellement."
        );
      } else {
        const generatedPath = join(migrationsDir, created[0]);
        const generatedContent = readFileSync(generatedPath, "utf8");

        if (generatedContent.trim()) {
          fail(
            "Le fichier genere n'est pas vide : aucune suppression " +
            "ni modification automatique n'a ete effectuee."
          );
        } else {
          mkdirSync(stagingDir, { recursive: true });
          const stagedPath = join(stagingDir, created[0]);

          const migrationSql = [
            "-- SCHOOLNET 2.0 / S2-A - MIGRATION VERSIONNEE EN ATTENTE.",
            "-- Generee par la CLI Supabase, non installee.",
            "-- NE PAS deplacer sous supabase/migrations ni lancer db push",
            "-- avant sauvegarde verifiee et autorisation explicite.",
            "-- Une fois autorisee, la migration doit etre appliquee une seule fois.",
            "",
            "BEGIN;",
            "SET LOCAL lock_timeout = '3s';",
            "SET LOCAL statement_timeout = '30000ms';",
            "",
            proposal.trimEnd(),
            "",
            "COMMIT;",
            "",
          ].join("\n");

          writeFileSync(stagedPath, migrationSql, {
            encoding: "utf8",
            flag: "wx",
          });
          unlinkSync(generatedPath);

          console.log("[S2-A] Migration PREPAREE et NON appliquee.");
          console.log("[S2-A] Fichier :", stagedPath);
          console.log("[S2-A] Dossier migrations : aucun nouveau SQL.");
          console.log("[S2-A] Prochaine etape : sauvegarde puis validation.");
        }
      }
    }
  }
}
