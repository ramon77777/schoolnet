# SCHOOLNET V2 — S4-C.3-C.3.5.3.4
## Audit de parité Supabase principal / GitHub, en lecture seule

**Observation :** 26 novembre 2026. **État :** audit technique préparatoire, branche GitHub isolée. **AUCUNE ACTION DE MIGRATION AUTORISÉE.**

### 1. Situation de départ

Le sous-lot **S4-D.2c.4** a été validé par l'utilisateur sur Windows : branche `local/schoolnet-s4d2c4`, HEAD `2c595fe`, `qa:s4d2c4` **10/10**, `npm run build` réussi (934 modules), et `git status -sb` propre. La PR #55 demeure en brouillon. Tous les exports de vraies notes et leur publication sont désactivés (`SCHOOLNET_REAL_EXPORTS_RELEASED = false`).

L'audit précédent C.3-C.3.5.3.2 avait figé une divergence **62 migrations Supabase / 54 fichiers GitHub**, soit **10 versions enregistrées uniquement à distance** et **2 fichiers présents uniquement dans GitHub**. L'observation directe actuelle par le connecteur Supabase retrouve exactement **62 / 54, 10 / 2**. L'historique distant se termine par la version **20261125132844**.

Le manifeste `tests/s4c3c353/migration-reconciliation.manifest.json` reste le **constat historique initial**, établi avant la découverte ci-dessous. Il signalait neuf groupes SQL candidats et l'absence du fichier du **13 novembre 2026**. Il n'est pas réécrit rétroactivement.

**Découverte nouvelle — registre `supabase_migrations.schema_migrations.statements` :** les dix versions historiques manquantes possèdent chacune **un bloc SQL non vide** enregistré sur Supabase principal. Une comparaison du contenu entier, sans lecture de données d'élèves, établit **huit correspondances strictement identiques** à un fichier SQL déjà présent dans GitHub. La version du **13 novembre** a été retrouvée dans le registre puis archivée exactement sous `tests/s4c3c3534/recovered-ledger/` ; la version du **25 novembre à 10 h 46** contient l'intégralité de deux propositions GitHub assemblées, avec un en-tête historique de 184 caractères et un séparateur LF. Son texte historique complet a également été archivé.

Chaque contenu, source existante ou copie inertielle, est vérifié par son **SHA-256 calculé côté PostgreSQL 17** et recalculé sur les octets du blob Git. Le registre `tests/s4c3c3534/ledger-statement-evidence.json` donne les dix empreintes et les correspondances, sans divulguer de valeurs privées. Les deux copies ont l'extension **`.sql.txt`**, **hors `supabase/migrations`** : elles ne sont ni des migrations actives ni une instruction de les appliquer.

**Portée exacte de la preuve :** le texte stocké dans le registre Supabase est désormais retrouvé et corroboré au niveau des octets. Cela ne démontre pas de manière indépendante que tous les effets DDL restent effectifs, ni que le registre n'a jamais subi de modifications. **Aucun `migration repair`, réexécution SQL ou transfert de données scolaires n'est autorisé par cette découverte.**

### 2. Résultats réels de l'inspection de catalogue

Inspection en lecture seule de `schoolnet_2.0` : liste des migrations, métadonnées de tables et `SELECT` sur `pg_catalog`. **Aucun profil, identifiant d'élève ou score réel n'a été lu**, aucune écriture en base, aucune modification d'historique.

| Élément | Constat |
| --- | --- |
| Établissements : `public.schoolnet_schools.name` | Présent, `text` |
| Années : `public.school_years.name` | Présent, `text` |
| Classes : `public.classes.name` | Présent, `text` |
| Périodes : `schoolnet_private.school_grading_periods.name` | Présent, `text` |
| Matières : `public.academic_subjects.name` | Présent, `text` |
| Affectations école, enseignant, élève et coefficients | Tables présentes |
| Catalogue `school_official_curricula` / ses matières | Absents |
| `schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)` | Présente ; invoker, `search_path=pg_catalog`, `authenticated` seulement |
| RPC des moyennes générales, prévisualisation et intitulés V2 | Absentes |
| Table privée des journaux de préparation d'export | Absente |

La PR #55 préparant les intitulés scolaires n'a donc pas besoin d'inventer des colonnes `name` sur la base réelle. La présence de ces colonnes **ne justifie pas d'activer la RPC avant le catalogue général et les migrations certifiées**.

### 3. Sort des deux migrations uniquement dans GitHub

**`20261109140104_harden_assessment_legacy_rpcs.sql` (9 novembre)** : deux fonctions historiques de publication et de correction présentent déjà les garde-fous observables : validation du créateur de l'évaluation dans leur définition, `search_path=pg_catalog`, refus d'appel `anon`. Le recalcul technique refuse `anon` et `authenticated` ; le trigger de recalcul est présent. **Cela démontre des effets de protection, pas que le SQL exact du fichier GitHub a été exécuté**, ni que la migration peut être marquée comme appliquée. La fonction technique de recalcul utilise encore un `search_path=public` hérité : sa durcification éventuelle sera instruite à part, sans modification silencieuse.

**`20261110090000_school_year_rollover_controlled.sql` (10 novembre)** : les tables `school_year_rollover_decisions`, `school_year_rollover_runs`, les RPC de préparation/finalisation et le déclencheur de garde sont **absents**. Une ancienne fonction de sélection d'année scolaire existe, mais ne rend pas la bascule de fin d'année opérationnelle. **Ne pas appliquer ce long SQL à l'occasion du déploiement des moyennes** : c'est un autre périmètre fonctionnel.

### 4. Risque hérité distinct : `get_my_role()`

La fonction `public.get_my_role()` est déjà `SECURITY DEFINER`, avec `search_path=public` et exécution `anon` autorisée sur l'instance actuelle. Ces propriétés demandent une **revue de sécurité dédiée** (surface d'attaque, définition complète, dépendances, plan de tests) ; elles ne démontrent pas à elles seules une exploitation ni n'autorisent un correctif improvisé. Les futures nouvelles fonctions privilégiées doivent conserver une recherche d'objets stable et vérifier `auth.uid()`.

### 5. Sauvegardes et restauration : preuve encore insuffisante

L'utilisateur avait déjà vérifié localement une archive PostgreSQL du 24 novembre : empreinte SHA-256 cohérente, format reconnu par `pg_restore -l`, inventaire des objets et lecture complète réussis. **Ces contrôles n'attestent pas d'une restauration indépendante**. Le dossier privé `D:\SCHOOLNET_BACKUPS_PRIVES` ne doit jamais être copié vers GitHub ou joint à la CI.

La porte `tests/s4c3c3533/recovery-readiness.json` reste bloquée : aucune nouvelle sauvegarde complète Auth + DB + Storage certifiée par ce sous-lot, aucune restitution contrôlée sur une cible indépendante et aucune preuve de retour arrière intégral. Les objets de Storage ne sont pas contenus dans une simple exportation SQL. Aucun essai de restauration n'a été réalisé sur Supabase principal.

### 6. Changement Supabase CLI v3 (novembre 2026)

**CLI v3** a modifié les cibles par défaut des commandes : mode local par défaut, et sélection distante explicite ; les flags de liaison historiques sont dépréciés. Voir [changelog officiel](https://supabase.com/changelog/supabase-cli-v3) et [guide de migration](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3). Les workflows précédents sont restés explicitement fixés à la CLI **v2.122.1** ; **ne pas les remplacer par un `latest` implicite**, ni utiliser `--remote` / `db push` / `migration repair` pendant cet audit. Toujours vérifier `supabase --help` avant toute future opération approuvée.

### 7. Artifacts vérifiables du sous-lot

- `tests/s4c3c3534/readonly-parity-observation.json` : snapshot réduit, **métadonnées seulement**, enregistrement immuable de ce que le catalogue a confirmé et de ce qu'il n'a pas prouvé.
- `tests/s4c3c3534/ledger-statement-evidence.json` : dix empreintes **SHA-256**, huit fichiers candidats strictement identiques et deux archives supplémentaires non exécutables.
- `tests/s4c3c3534/recovered-ledger/*.sql.txt` : textes du registre distant du **13/11** et du **25/11** conservés sans modification, isolés des migrations SQL exécutables. Le filtre automatique de secrets n'a détecté aucun motif évident dans ces deux textes ; une relecture humaine reste nécessaire.
- `tests/s4c3c3534/readonly-catalog-audit.sql` : exemple de quatre requêtes **SELECT-only** pour rejouer un contrôle de catalogue lors d'un audit autorisé. La CI ne l'exécute pas contre un serveur.
- `scripts/test-schoolnet-s4c3c3534-readonly-parity.mjs` : comparaison automatique avec les manifestes historiques et les blocages de sauvegarde ; vérifications de non-activation.
- `.github/workflows/schoolnet-s4c3c3534-readonly-parity-ci.yml` : exécution Node, vérifications antérieures, lint et build **sans identifiant ni réseau Supabase**.

### 8. Critères concrets pour lever les blocages, et ordre des décisions

1. **Sources historiques :** les dix textes enregistrés dans le registre distant sont désormais retrouvés et hachés. Faire **relire et approuver** leur provenance, leurs éventuels effets secondaires et les différences avec le schéma effectivement installé, en particulier le fichier du 13 novembre et l'assemblage du 25 novembre. Ne jamais déduire de l'identité du texte que les effets sont encore présents ; **aucune modification du registre distant**.
2. **Deux fichiers Git-only :** approuver explicitement la décision par migration. La sécurisation des corrections pourrait être déjà effective mais non attribuable à ce fichier exact ; la bascule annuelle n'est pas installée et ne doit pas être confondue avec les moyennes générales.
3. **Sauvegarde privée et restauration :** vérifier un export récent DB et une cible de test isolée, inventorier Auth/config et Storage, comparer structures et permissions, disposer d'un retour arrière réellement testé. Cette opération nécessitera un GO distinct.
4. **Parité technique :** réconcilier le SQL cible C.3-C.3 avec les définitions réelles des functions, grants, RLS et hooks. Tester ensuite dans une base jetable représentative, sans importer d'élèves ni de notes.
5. **Décision de livraison :** seulement après preuves suffisantes et GO explicite, préparer de nouvelles migrations régulières avec `supabase migration new` (commande/version vérifiée), les tester, puis planifier séparément l'application, `main` et Vercel.

**AUCUNE ACTION DE MIGRATION AUTORISÉE**, ni `main`, ni Vercel, ni export réel. Ce sous-lot conclut uniquement un audit de métadonnées. La PR reste brouillon jusqu'à la recette Windows et à la validation de l'utilisateur.
