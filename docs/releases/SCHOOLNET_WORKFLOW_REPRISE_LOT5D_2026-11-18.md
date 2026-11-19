# SCHOOLNET — Workflow de reprise et avancement au 18 novembre 2026

> **DOCUMENT DE REPRISE ACTUEL — Audit serveur 5D-B validé en lecture seule le 18/11/2026 ; aucune installation SQL.**
>
> Statuts distincts : **PUBLIÉ**, **TESTÉ LOCAL**, **PRÉPARÉ GITHUB**, **EN ATTENTE D'AUTORISATION**.
> Ce document complète [le workflow directeur historique](../WORKFLOW_DIRECTEUR_SCHOOLNET_2_0_2026-11-10.md) sans réécrire son historique.

## 1. Règles de travail à respecter

1. Le travail est enregistré sur **une branche GitHub distincte**.
2. L'utilisateur synchronise VS Code local et effectue `npm run ...`, puis teste les pages.
3. L'utilisateur valide les résultats par des captures / retours.
4. Après validation, une PR est fusionnée dans `main` **sur autorisation explicite**.
5. Le projet Vercel **existant** se met à jour depuis `main` (pas de second site).
6. Les écritures Supabase, migrations, changements Auth/Storage, et de l'année active
   nécessitent une **autorisation distincte**, une sauvegarde validée et une recette ciblée.
7. Ne pas effacer les scripts non suivis, les propositions locales SQL ou le stash.
   Jamais `git reset --hard`, `git clean -fd`, `supabase db push` sans accord.

La règle de sécurité reste **fail-closed** : Preview Vercel / localhost en lecture
seule sur les modules sensibles, écriture seulement après contrôle serveur.

## 2. État publié et déjà vérifié

| Lot | État au 18/11 | Preuve / précisions |
| --- | --- | --- |
| Lot 5C — parcours d'inscription, parent/enfant et invitations | **PUBLIÉ** | Espaces Parent et Super Admin vérifiés en production avec captures. |
| S2-A — établissements / tenant | **PUBLIÉ** | Accès limité à l'établissement autorisé ; test visuel production. |
| S2-B — classes officielles | **PUBLIÉ** | Page, formulaire et catalogue visibles en production. |
| S3-A — enseignants / rattachements | **PUBLIÉ** | Page accessible ; répertoire vide sur école de test. |
| S3-B — élèves / rattachements | **PUBLIÉ** | Page accessible ; répertoire vide sur école de test. |
| S3-C — affectations pédagogiques | **PUBLIÉ** | Page accessible ; aucun lien créé dans l'école de test. |

- Dépôt : [`ramon77777/schoolnet`](https://github.com/ramon77777/schoolnet).
- Branche de production : `main`, commit fusion du Lot 5C/S2/S3 : **`2761d73`**.
- PR #13 et PR #14 fusionnées sur `main`.
- Production Vercel **existante** : https://schoolnet-snowy.vercel.app .
- Les **interfaces** ont été validées en production par captures ; cela ne
  remplace pas une recette d'écriture de données réelles pour chaque module.
- Supabase principal `schoolnet_2.0` : projet **`anttmbhaphkhmkoqsofd`**,
  **43 migrations** enregistrées lors du dernier audit en lecture seule.
- Les tables / RPC S2 et S3 sont présentes ; les fonctions de passage 5D
  historique, elles, **ne sont pas installées**.

## 3. Poste Windows / état local avant 5D-B

- Répertoire : `D:\Bakary\10 autres\schoolnet`.
- Branche locale activée pour le Lot 5D : `feature/schoolnet-lot5d-a-securisation-20261118`.
- Backup des fichiers locaux : `D:\Bakary\SCHOOLNET_BACKUPS\LOCAL_BEFORE_MAIN_20261118_114501`.
- Sauvegarde PostgreSQL + Storage préalable à la publication 5C
  déjà effectuée (archive `pg_restore --list` vérifiée,
  Storage : **24/24** fichiers dans 7 buckets, manifeste SHA256).
- Fichiers non suivis à conserver : `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs`,
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`,
  `supabase/proposals/staged/`.
- `tsconfig.app.tsbuildinfo` peut changer à chaque build ; ancien stash sauvegardé.
- Recette locale 5D-A **validée** : 9/9 tests + lint (0 erreur, 1 avertissement connu)
  + build + captures des pages Années scolaires / Passage d'année.

## 4. Lot 5D — là où nous en sommes

### 5D-A : **TESTÉ LOCAL, PR #15 EN BROUILLON, NON PUBLIÉ**

Branche : `feature/schoolnet-lot5d-a-securisation-20261118`.
[PR #15](https://github.com/ramon77777/schoolnet/pull/15).

- Blocage des écritures 5D par défaut, même sur production non explicitement ouverte.
- Retrait du bouton Admin « Définir année active ».
- Séparation des classes historiques et des classes officielles d'établissement.
- Proposition SQL 5D-A en `supabase/proposals/`, **non exécutée**.
- La recette visuelle des deux pages, le code et les tests ont été validés.
- **La PR est volontairement toujours en brouillon, sans fusion et sans déploiement**.

### 5D-B, phase diagnostic : **TESTS LOCAUX VALIDÉS + AUDIT SERVEUR LECTURE SEULE TERMINÉ**

Dans la **même branche et la même PR #15** :

- `src/features/enrollments/lib/schoolYearRolloverPreflight.ts`
  - Diagnostic pur : année source/cible, année unique, dossiers cible
    actifs/terminés, classes d'origine manquantes/incompatibles,
    classes S3-C, doublons, incohérences.
  - **Le résultat n'autorise jamais l'écriture**. Les tests sur les données
    visibles dans le navigateur ne remplacent pas une inspection serveur.
- `src/features/admin/pages/AdminYearRollover.tsx`
  - Synthèse du diagnostic en lecture seule, boutons de décision et
    de finalisation visuellement grisés si désactivés.
  - Un résultat « 0 anomalie locale » n'autorise pas une bascule.
- `supabase/verification/20261118_schoolnet_lot5db_readonly_preflight.sql`
  - Requête agrégée **WITH/SELECT uniquement** pour audit futur.
  - N'écrit aucune donnée.
- `supabase/proposals/20261118_schoolnet_lot5db_TRANSACTION_DRAFT_NOT_INSTALLABLE.sql`
  - **Document SQL intégralement commenté, non exécutable**.
  - Définit les contraintes à respecter pour la future transaction :
    verrous, décisions complètes, cible déjà peuplée, isolation des
    établissements, idempotence, événements d'audit et retour arrière.
- `scripts/test-schoolnet-lot5d-b-preflight.mjs`
  - Tests d'anomalies, absence d'écriture et non-déploiement SQL.
- `package.json` : `npm run qa:lot5d:b`.
- `.github/workflows/schoolnet-quality.yml` : contrôle B ajouté aux PR.

**Recette locale B du 18/11 validée par l'utilisateur :** 
`qa:lot5d:a` 9/9, `qa:lot5d:b` 17/17, ESLint 0 erreur
(1 avertissement React Hook historique), build Vite réussi et captures
des pages `/app/admin/year-rollover` et `/app/admin/school-years`.
Le panneau 5D-B s'affiche et les commandes de décision/finalisation
sont grises et réellement désactivées.

**Audit Supabase principal terminé en lecture seule :** voir 
[rapport d'audit serveur 5D-B](./SCHOOLNET_AUDIT_SERVEUR_LOT5DB_2026-11-18.md).
43 migrations, aucune RPC 5D finale installée, ancienne RPC directe présente,
aucun trigger 5D-A, protections RLS existantes mais pas de verrou métier SQL.
La source et la cible ont chacune 1 dossier actif, pour **deux élèves différents**.

**Attention : le SQL transactionnel 5D-B n'est PAS encore implémenté et
aucune fonction serveur n'est installée.** Ce jalon constitue un diagnostic
et une spécification sécurisée, pas une activation.

### 5D-A+B, phase C : **CANDIDAT TRANSACTIONNEL PREPARE SUR GITHUB — NON INSTALLE**

Suite à l'autorisation de conception, les livrables suivants sont présents
dans la même branche, sans changement de `main` ou de Supabase principal :

- [Dossier de conception du candidat SQL consolidé](./SCHOOLNET_LOT5D_AB_CANDIDAT_SQL_ISOLE_2026-11-18.md).
- `supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql` :
  **SQL exécutable seulement en PostgreSQL isolé**, pas dans `supabase/migrations/`.
  Garde SQL anti-bascule directe, registre de décisions, journal et finaliseur
  privé, verrouillage, contrôle des droits, RLS, idempotence et rollback.
- `scripts/lot5d/fixture_postgresql17.sql` : profil, classes, année et
  inscriptions **entièrement fictifs** (schéma réduit).
- `scripts/lot5d/test_consolidated_postgresql17.sql` :
  **18 vérifications SQL** en transaction avec `ROLLBACK`, injection d'erreur,
  brouillon cible, départ et réinscription au niveau suivant.
- `scripts/test-schoolnet-lot5d-consolidated-sandbox.mjs` :
  12 contrôles de structure et de sécurité hors ligne, `npm run qa:lot5d:c`.
- CI GitHub `schoolnet-quality.yml` : job PostgreSQL 17 **jetable**,
  base `schoolnet_lot5d_ci` sur `127.0.0.1`, sans clé Supabase ni Vercel.

**Résultats GitHub Actions confirmés :** recette SQL PostgreSQL 17
**18/18 réussie**, job complet de qualité (statiques, lint, build, fonctions
Edge) **réussi**, run
[#44317583860](https://github.com/ramon77777/schoolnet/actions/runs/44317583860),
commit `0c36d202`. Toutes les données et le schéma de ce job sont
**fictifs**, sur base éphémère. Cette réussite **ne valide pas**
l'installation ni la sûreté sur le vrai schéma Supabase. Le candidat n'est
pas autorisé pour le SQL Editor principal ni une fusion de PR.

**Politique v1 volontairement plus stricte :** toute ligne de dossier en
année cible (`draft`, `active`, `completed`, `withdrawn`,
`cancelled`) bloque le passage. Les anciennes affectations `class_students`
sont conservées ; il faudra tester les effets sur les listes d'élèves
et les historiques enseignants.

**Verrou métier persistant :** le dossier actif déjà présent dans
2026–2027 appartient à un autre élève que celui actif en 2025–2026,
mais empêche néanmoins la bascule. Aucune régularisation automatique.

### 5D-D : **COMPATIBILITÉ RÉELLE AUDITÉE EN LECTURE SEULE + TESTS CONCURRENTS PRÉPARÉS**

Le 18/11, l'utilisateur a confirmé les résultats locaux précédents :
**5D-A 9/9, 5D-B 17/17, 5D-C 12/12, lint 0 erreur (1 avertissement connu),
build Vite réussi, Git fast-forward OK**. Les fichiers non suivis sont conservés.

Nouveaux travaux **sur la même branche / PR #15** :

- [Rapport de compatibilité réelle, concurrence et passerelle Admin](./SCHOOLNET_AUDIT_COMPAT_5D_D_2026-11-18.md).
  Inspection de `pg_catalog`, `information_schema` et fonctions/triggers
  du **Supabase principal avec SELECT uniquement** : 43 migrations, 1 année
  courante, 1 dossier actif source, 1 dossier actif cible distinct,
  aucune migration 5D installée.
- `scripts/lot5d/fixture_postgresql17.sql` renforcé : copie **synthétique**
  du trigger `ensure_student_single_class_per_school_year` et contrôle
  de rôle élève (`validate_class_student_role`).
- `scripts/lot5d/schema_compatibility_postgresql17.sql` : vérifie que
  l'élève fictif ne peut rejoindre deux classes dans la même année.
- `scripts/lot5d/run_concurrency_postgresql17.sh` + quatre fichiers SQL
  de préparation/deux sessions/postcontrôle : le premier commit laisse une
  transaction ouverte, le second client doit subir un `lock timeout`,
  puis le replay identique est idempotent et un autre `operation_id` rejeté.
- `scripts/lot5d/authorization_postgresql17.sql` :
  vérifie accès Admin, refus étudiant et `anon` à la fonction privée,
  ainsi que blocage de l'activation directe y compris pour Admin.
- `scripts/lot5d/admin_gateway_contract_mock.mjs` :
  **référence pure non déployée**, sans réseau ni SQL ; contrôle du contrat
  de requête (origine sandbox, identité serveur, rôle global, JSON strict).
- `scripts/test-schoolnet-lot5d-d-readiness.mjs` :
  **15 tests statiques** dans `npm run qa:lot5d:d`, complétant les contrôles
  d'intégration PostgreSQL de la CI.

**Statut :** le job PostgreSQL 17 éphémère enrichi (concurrence, contraintes
et autorisations) est exécuté uniquement sur données fictives. Conserver
une distinction entre **CI vérifiée** et **recette locale utilisateur**.
Aucun nouveau service/endpoint Admin n'a été créé. Toutes les écritures
5D restent interdites sur le Supabase principal.

**Risques non clos** : interactions concurrentes avec les RPC historiques,
lecture des anciens `class_students` dans les interfaces Parent/Enseignant,
fidélité de tous les triggers du vrai schéma et qualification métier du
dossier cible déjà actif. Une authentification réelle de la passerelle et
un rôle SQL dédié sont à concevoir avant un GO de migration.

### 5D-E : **CONCURRENCE RPC LEGACY + ARCHIVES + PASSERELLE MOCK — CI ET LOCAL VALIDÉS**

Livrable sur la même branche, toujours dans la PR #15 **en brouillon**,
sans installation SQL ni code serveur déployé :

- [Rapport 5D-E — concurrence, historiques et passerelle simulée](./SCHOOLNET_LOT5DE_CONCURRENCE_RPC_ARCHIVES_2026-11-18.md).
- `supabase/proposals/20261118_schoolnet_lot5de_history_guards_SANDBOX_ONLY.sql` :
  proposition de triggers privés qui bloquent, après une finalisation
  5D enregistrée, toute réécriture d'un dossier **ou d'une ancienne
  affectation** de l'année source.
- `scripts/lot5d/legacy_rpc_guarded_fixture_postgresql17.sql` :
  **simulation partielle** des anciennes RPC `admin_upsert_student_enrollment`
  et `admin_set_student_enrollment_status`, avec verrou
  `school_years IN SHARE MODE` AVANT lecture du calendrier ;
  **aucune RPC réelle n'est modifiée**.
- `scripts/lot5d/legacy_cross_*.sql` et
  `run_legacy_cross_postgresql17.sh` : deuxième session Admin
  simulée en concurrence avec la finalisation, `lock timeout`,
  puis tests de la nouvelle année et du gel des anciennes classes.
- Simulation avec **parent_links, bulletin, document fictif et lien
  class_students historique**, comparés avant/après via digest.
  Le vrai Supabase comporte actuellement 1 bulletin, 2 liens parentaux,
  4 événements et 0 document : tous préservés (aucune écriture réelle).
- `scripts/lot5d/admin_gateway_dryrun.mjs` :
  orchestrateur **purement fictif et hors réseau** des étapes
  Auth → rôle global Admin → requête stricte → transaction mock.
  **Aucun endpoint HTTP ni rôle SQL serveur réel**.
- `scripts/test-schoolnet-lot5d-e-legacy-cross.mjs` :
  **20 tests statiques et fonctionnels hors réseau**,
  commande `npm run qa:lot5d:e`.
- GitHub Actions `schoolnet-quality.yml` : **3 jobs SUCCESS**
  au [run #44329876560](https://github.com/ramon77777/schoolnet/actions/runs/44329876560),
  dont un **nouveau PostgreSQL 17 indépendant**, sans Supabase réel.
  Le job de qualité a validé **20/20** pour E, lint, build et
  les tests précédents ; le job E a validé **11 assertions SQL**
  de concurrence et conservation d'archives fictives.

**Limite absolue :** les anciennes RPC ne sont **pas encore corrigées
dans le Supabase principal**. Les nouveaux tests prouvent la réponse
du **modèle corrigé en sandbox**, pas l'absence de conflit sur
production. Le dossier cible actif 2026–2027 bloque toujours
toute bascule réelle. La recette locale E **a été validée par l'utilisateur le 18/11/2026 : 20/20**,
lint 0 erreur (1 avertissement React Hook connu), build Vite réussi.
Cette validation ne vaut pas autorisation d'écriture SQL réelle.

### 5D-F : **RPC HISTORIQUES COMPLÈTES + CONCURRENCE SQL + ARCHITECTURE ADMIN — CI ET LOCAL VALIDÉS**

Travaux préparés **uniquement** sur GitHub et PostgreSQL 17 fictif :
[Rapport 5D-F et proposition d'architecture](./SCHOOLNET_LOT5DF_RPC_COMPLETES_PASSERELLE_ADMIN_2026-11-18.md).

- **Audit Supabase principal en SELECT uniquement** : définitions complètes
  de cinq RPC Admin (upsert, statut, wrapper genre, affectation, retrait).
  Aucune migration, aucun dossier, aucun Auth ni RLS réel modifié.
- **Candidat entier** : proposition
  `supabase/proposals/20261118_schoolnet_lot5df_legacy_full_lock_SANDBOX_ONLY.sql`
  issue de `pg_get_functiondef`, avec `search_path=pg_catalog` et verrou
  `school_years IN SHARE MODE` **avant** les lectures métier dans les cinq RPC.
  **Il est interdit de l'installer dans le Supabase principal.**
- **Régressions** : 12 assertions SQL avant bascule sous `ROLLBACK`
  (numérotation, date initiale, statut, retrait et réaffectation,
  wrapper genre, rôle) ; deux scénarios de concurrence distincts
  avec finaliseur sur une base PostgreSQL 17 fictive ; 13 assertions
  après bascule (archives conservées, statut historique bloqué,
  opérations dans la nouvelle année autorisées).
- **CI vérifiée** : [run #44336667446](https://github.com/ramon77777/schoolnet/actions/runs/44336667446),
  **5 jobs SUCCESS**, dont deux nouveaux jobs F (upsert complet et statut
  complet) + `npm run qa:lot5d:f` **12/12** dans GitHub Actions.
- **Passerelle Admin réelle** : architecture documentée, **PAS implémentée** :
  Auth réelle, profil Admin, origine exacte, contrat strict, transaction
  privée sous rôle SQL à privilèges minimaux, idempotence et journal.
  Aucun endpoint, rôle SQL, secret ou déploiement ajouté.

**Recette locale F validée par l'utilisateur le 18 novembre 2026** :
`git pull --ff-only` sans conflit (`4920c68..f3ec13f`),
`npm run qa:lot5d:f` **12/12**, `npm run lint` **0 erreur** (1 warning
préexistant `react-hooks/exhaustive-deps`, `EnrollmentRecordsPage.tsx:161`),
`npm run build` **réussi**, Vite v7.3.1, **867 modules**.
Avertissements Browserslist et bundle important non bloquants.
**Cumul A+B+C+D+E+F : 85/85 tests locaux validés.**
`tsconfig.app.tsbuildinfo`, les trois scripts locaux non suivis et
`supabase/proposals/staged/` sont inchangés et conservés.

**Risques encore bloquants :** dossier déjà actif en année cible 2026–2027,
RPC directe de changement d'année encore non neutralisée côté réel,
écritures directes RLS, `admin_finalize_public_enrollment_request`,
affichage des dernières classes historiques côté Parent/Enseignant,
test sur schéma réellement fidèle et passerelle serveur encore inexistante.

### 5D-G : **AUDIT RLS RÉEL + VOIES DIRECTES + PASSERELLE MOCK — CI ET LOCAL VALIDÉS**

Le 18/11/2026, sur la PR #15 **en brouillon** :
[rapport technique et limites du Lot 5D-G](./SCHOOLNET_LOT5DG_AUDIT_RLS_PASSERELLE_2026-11-18.md).

- **Audit en SELECT uniquement du Supabase principal** : catalogue RLS,
  privilèges de table, colonnes, contraintes et triggers réels, sans
  accès aux fiches personnelles ou modification du schéma.
- **Voies de modification identifiées** :
  `school_years` et `class_students` conservent des droits Admin directs
  sous RLS ; `student_enrollments` n'a pas de privilèges directs
  `authenticated`, malgré ses policies, et passe par les RPC ;
  `student_enrollment_documents` accepte INSERT/DELETE Admin.
  L'interface Admin peut encore créer/supprimer des années **inactives**,
  ce qui doit rester autorisé.
- **Candidat complémentaire SANDBOX_ONLY** :
  `supabase/proposals/20261118_schoolnet_lot5dg_archive_documents_SANDBOX_ONLY.sql`
  préserve les métadonnées documentaires des années clôturées,
  sans empêcher les nouvelles pièces de l'année cible.
- **Blocage critique restant** : `AdminEnrollmentDocuments.tsx`
  retire un fichier Storage **avant** la suppression des métadonnées.
  Les policies du bucket ne tiennent pas compte du passage 5D.
  **Le trigger de métadonnées ne doit donc PAS être installé seul**.
  Revoir ensemble Storage RLS, contrôle serveur et UI avant GO.
- **Passerelle Admin** :
  `scripts/lot5d/5dg_admin_gateway_reference.mjs` teste en pur mock
  l'authentification, la session non révoquée, le rôle global Admin,
  le rate-limit, l'origine, le préflight et l'audit. **Aucun serveur réel,
  endpoint, secret ni connexion SQL n'est créé.**
- **CI** : [run #44342623526](https://github.com/ramon77777/schoolnet/actions/runs/44342623526),
  **6/6 jobs SUCCESS** dont PostgreSQL 17 fictif G, `qa:lot5d:g`
  **20/20 en CI**, lint/build réussis. PostgreSQL G vérifie les
  droits RLS et documents en 2 phases, avec `ROLLBACK` pour les tests.
- **Recette locale G : VALIDÉE LE 18/11/2026**. Transmission
  intégrale par l'utilisateur : `git pull --ff-only` réussi
  (`f3ec13f..20125ba`), `npm run qa:lot5d:g` **20/20**,
  `npm run lint` **0 erreur** (1 avertissement React Hook connu),
  `npm run build` **réussi**, Vite v7.3.1, 867 modules.
  Les fichiers locaux non suivis sont conservés.
  **Cumul des recettes locales A–G : 105/105 tests validés**.

**Aucune migration 5D installée, aucune donnée Supabase principale
modifiée, aucune fusion ni publication de production.** Une copie fidèle
du schéma avec Storage isolé et une vraie passerelle sécurisée restent
indispensables ; l'année cible 2026–2027 déjà active demeure bloquante.

### 5D-H : **ARCHIVAGE STORAGE SANS SUPPRESSION DANGEREUSE ET CLASSES HISTORIQUES — CI ET LOCAL VALIDÉS**

Le 18/11/2026 sur la PR #15 en brouillon :
[rapport H](./SCHOOLNET_LOT5DH_ARCHIVES_STORAGE_CLASSES_2026-11-18.md).

- **Correctif interface :** plus de suppression de fichiers ou de métadonnées
  directement depuis `AdminEnrollmentDocuments.tsx` ; bouton désactivé
  « Suppression suspendue ». Téléchargement et dépôt conservés.
- **Dépôt sans effacement compensatoire :** si l'upload Storage réussit
  mais que l'INSERT de métadonnées n'est pas confirmé, l'objet distant
  est conservé et une vérification administrative est requise.
  Une reprise serveur reste à concevoir pour les objets sans registre.
- **Candidat RLS Storage `SANDBOX_ONLY`** :
  `supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql`
  remplace `DELETE` sur le bucket par `USING (false)`
  **seulement dans un PostgreSQL 17 fictif**, sans toucher aux policies
  de lecture/dépôt. Ce SQL **n'est pas installable** au principal.
- **Parent :** dernière classe explicitement **historique**,
  année active non confirmée. Résolveur de classes annuelles
  `parentYearClassProposal.ts` validé hors réseau,
  **pas connecté** car `authenticated` n'a pas de SELECT direct
  sur `student_enrollments`; lecture familiale serveur à construire.
- **Enseignant :** `TeacherClasses.tsx` affiche des données
  fictives ; l'avertissement le précise. Le vrai parcours annuel
  reste à créer via droits propres de l'Enseignant.
- **CI** : [run #44349058440](https://github.com/ramon77777/schoolnet/actions/runs/44349058440),
  **7/7 jobs SUCCESS**, `qa:lot5d:h` **24/24** en CI, PG17
  H valide en isolé, lint et build réussis.
- **Recette locale H : VALIDÉE LE 18 NOVEMBRE 2026** :
  l'utilisateur a effectué un `git pull --ff-only` sans conflit
  (`20125ba..c9ad909`), `qa:lot5d:h` **24/24**, les
  **10/10 tests historiques Parent du Lot 5.C** séparément,
  `npm run lint` **0 erreur** (1 warning React Hook connu) et
  `npm run build` **réussi** (Vite v7.3.1, **868 modules**).
  **Total des tests locaux 5D-A à H : 129/129**,
  les 10 tests Parent étant distincts de ce total.
  Aucun fichier local non suivi n'a été supprimé.

**Aucune suppression Storage sécurisée par un backend réel n'existe.
Aucune migration 5D, aucun rôle nouveau, aucun déploiement** ;
2026–2027 occupée par un autre élève reste un blocage métier.

### 5D-I : **LECTURE ANNUELLE PARENT AUTORISÉE + REVUE DOCUMENTAIRE PRIVÉE — CI ET LOCAL VALIDÉS**

[Rapport détaillé du Lot 5D-I](./SCHOOLNET_LOT5DI_LECTURE_PARENT_REVUE_DOCUMENTAIRE_2026-11-18.md)

- **Fonction serveur Parent préparée :**
  `supabase/functions/schoolnet-parent-current-class/index.ts` et
  `supabase/functions/_shared/lot5diParentAnnualRead.ts`.
  Vraie implémentation Deno de la lecture, avec `auth.getUser`,
  rôle `parent` relu en base, liens `parent_links` limités à
  l'identité JWT, inscriptions `active` de l'année `is_current`
  uniquement, sortie minimale.
  **Flag serveur désactivé par défaut, fonction non déployée,
  frontend Parent non raccordé.**
- **Proposition de revue documentaire `SANDBOX_ONLY` :**
  `supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql`.
  Registre privé de demande + événement d'audit,
  contrôle Admin global, verrou année, idempotence et refus
  d'une bascule sur année avec demande non résolue.
  **Aucune suppression physique et aucun backup effectué.**
- **Recettes CI** : [run #44353622841](https://github.com/ramon77777/schoolnet/actions/runs/44353622841),
  **8/8 jobs SUCCESS**, `qa:lot5d:i` **30/30 tests Node**,
  compilation Deno Edge réussie et 8 assertions SQL
  PostgreSQL 17 en `ROLLBACK`, données fictives seulement.
- **Recette locale I : VALIDÉE LE 19 NOVEMBRE 2026** :
  `git pull --ff-only` réussi (`c9ad909..cc466e6`),
  `npm run qa:lot5d:i` **30/30** et tests historiques
  Parent 5.C **10/10** (séparément), `npm run lint`
  **0 erreur** (1 avertissement React Hook historique),
  `npm run build` **réussi**, Vite v7.3.1,
  **868 modules**. Fichiers locaux non suivis et
  `tsconfig.app.tsbuildinfo` conservés.
  **Cumul local Lots 5D-A à I : 159/159 tests validés**.
- **Points bloquants** : véritable sauvegarde, empreinte et reprise
  documentaire non implémentées ; vérification des sessions/rate-limit
  avant déploiement Parent ; UI Parent non connectée ;
  année cible 2026–2027 déjà occupée.

**Aucun SQL installé sur le projet principal, aucun endpoint déployé,
aucune fusion main ni mise en production. Toutes les protections
non déployées restent à l'étude sous nouveau GO.**

### 5D-J : **RECETTES AUTH/SESSIONS PARENT ET STORAGE HTTP ISOLÉ — CI ET LOCAL VALIDÉS**

Le 19/11/2026 sur la PR #15 **en brouillon** :
[rapport technique 5D-J](./SCHOOLNET_LOT5DJ_AUTH_SESSIONS_STORAGE_HTTP_2026-11-19.md).

- **Audit Supabase en SELECT uniquement** : les colonnes de
  `auth.sessions` (`id`, `user_id`, `not_after`) existent ;
  aucune session réelle ni objet Storage d'élève consulté.
  Les sessions peuvent nécessiter une vérification de présence
  autoritative au-delà de `auth.getUser`.
- **Contrat Parent local** :
  `scripts/lot5d/5dj_parent_http_security_reference.mjs` ;
  port `127.0.0.1`, identité/session actives et cohérentes,
  expiration, rôle `parent` revalidé, rate-limit obligatoire,
  aucune identité ou rôle accepté du navigateur,
  réponse minimale. **Adaptateurs fictifs : pas de vraie Auth.**
- **Simulation de conservation** :
  `scripts/lot5d/5dj_retention_recovery_reference.mjs` ;
  copie binaire privée, relecture, taille et SHA-256,
  attestation fictive, traitement des timeouts incertains et
  classification des orphelins/manques. **Aucune suppression
  physique, aucune réparation automatique.**
- **Tests HTTP réels sur boucle locale** :
  `scripts/test-schoolnet-lot5d-j-isolated-http.mjs` ;
  **40/40 tests J**, dont appels au mini-service HTTP Auth/Storage
  sur `127.0.0.1`. Aucune donnée réelle ni clé cloud.
- **CI** : [run #44488437331](https://github.com/ramon77777/schoolnet/actions/runs/44488437331),
  **9/9 jobs SUCCESS**, y compris job J autonome,
  lot précédent A–I, lint, build et compilation Deno.
- **Recette locale J : VALIDÉE LE 19/11/2026**.
  `git pull --ff-only` **réussi** (`cc466e6..5f394be`) ;
  `npm run qa:lot5d:j` **40/40 tests réussis** ;
  Parent historique 5.C **10/10**, comptés séparément ;
  `npm run lint` **0 erreur** (1 warning React Hook connu) ;
  `npm run build` **réussi** (Vite v7.3.1, **868 modules**).
  Le statut Git final est identique au statut initial.
  **Cumul des recettes locales A–J : 199/199 validés**.

**Verrous maintenus :** `schoolnet-parent-current-class`
**OFF/non déployée**, aucune politique Storage J ni migration
créée, aucune suppression d'objet, aucun backup réel ;
année cible 2026–2027 occupée. Vraie recette Auth/Storage
sur sandbox fidèle et accord séparé restent indispensables.

### 5D-K : **AUTH / STORAGE RÉELS SUR STACK SUPABASE LOCALE ÉPHÉMÈRE — CI ET LOCAL VALIDÉS**

Le 19/11/2026, sur la PR #15 **brouillon** :
[rapport technique détaillé](./SCHOOLNET_LOT5DK_AUTH_STORAGE_REELS_ISOLES_2026-11-19.md).

- **Audit préliminaire, zéro écriture sur les projets hébergés :**
  `schoolnet_2.0` reste le principal protégé ;
  `schoolnet-auth-sandbox` possède déjà des comptes
  et sessions de tests mais aucun bucket Storage ni
  tables annuelles nécessaires. Aucun ancien test modifié.
- **Infrastructure de test vraiment Supabase :**
  GitHub Actions démarre `supabase/setup-cli@v3`
  avec CLI **3.0.0**, puis `supabase init` et
  `supabase start` **dans un dossier éphémère hors dépôt**.
  GoTrue, PostgREST, PostgreSQL et Storage sont
  des services réels mais **uniquement locaux**
  (`127.0.0.1:54321/54322`). Les données sont
  détruites en fin de job.
- **Fixture locale protégée :**
  `scripts/lot5d/5dk_local_supabase_real_api_fixture.sql` ;
  familles A/B fictives, années, inscriptions et classes,
  RLS et grants explicites ; Admin Storage privé sans
  suppression client ; rétention privée serveur.
  **Ce SQL n'est PAS une migration, ne reproduit pas
  le schéma complet ni les 43 migrations principales.**
- **Tests réels K (CI uniquement) :**
  `scripts/test-schoolnet-lot5d-k-real-supabase.mjs`,
  **21/21** : création de 5 utilisateurs Auth fictifs,
  JWT et `auth.sessions`, deux Parents isolés,
  absence de `SELECT` direct sur les dossiers,
  lecture annuelle serveur, bucket privé réel,
  upload/download Auth, DELETE refusé,
  copie relue et SHA-256, déconnexion/révocation,
  conservation de l'historique.
- **Tests K hors réseau (recette locale) :**
  `scripts/test-schoolnet-lot5d-k-contract.mjs`,
  **20/20 en CI et en local le 19/11/2026**.
- **CI** : [run #44493802616](https://github.com/ramon77777/schoolnet/actions/runs/44493802616),
  **10/10 jobs SUCCESS** sur le commit documentaire initial
  (et [run #44493115080](https://github.com/ramon77777/schoolnet/actions/runs/44493115080)
  **10/10** sur le code des tests Supabase), tous les lots
  antérieurs encore verts.
- **Recette locale K : VALIDÉE LE 19/11/2026** :
  `git pull --ff-only` réussi (`5f394be..80b0146`),
  `npm run qa:lot5d:k` **20/20**, tests Parent 5.C
  **10/10 séparément**, ESLint **0 erreur**
  (1 warning React Hook connu), build Vite **réussi**
  (v7.3.1, **868 modules**). État Git local inchangé.
  **Cumul des tests locaux A–K : 219/219 validés**.

**Limites avant GO :** la fonction Edge Parent I reste
OFF/non déployée et ne contrôle pas encore elle-même
`auth.sessions`, quota persistant non implémenté ;
pas d'audit documentaire durable, ni de suppression
ou restauration réelle. La vraie année 2026–2027
reste occupée, donc **aucune bascule autorisée**.

### 5D-L : **SESSIONS PARENT RÉVOQUÉES + QUOTA ATOMIQUE PERSISTANT — CI ET LOCAL VALIDÉS**

Le 19/11/2026, sur la PR #15 **en brouillon** :
[rapport technique 5D-L](./SCHOOLNET_LOT5DL_SESSION_PARENT_QUOTA_PERSISTANT_2026-11-19.md).

- **Fonction Edge Parent sécurisée dans la source** :
  `supabase/functions/schoolnet-parent-current-class/index.ts`
  appelle désormais `authorizeParentSession` après
  `auth.getUser` pour exiger session réelle non
  révoquée, rôle Parent vérifié en base et quota serveur
  avant la moindre lecture familiale. Retours
  **401/403/429/503** selon la situation.
  **Toujours OFF et non déployée** ;
  la page Parent n'est pas raccordée.
- **Candidat SQL `SANDBOX_ONLY`, non migration** :
  `scripts/lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql`,
  uniquement sur la fixture Docker locale du Lot K :
  compteur PostgreSQL durable **12 lectures / 60 s /
  compte** (seuil de test à valider), privé RLS,
  fonction SECURITY DEFINER en schéma non exposé
  et wrapper public SECURITY INVOKER **service_role
  uniquement**, jamais les rôles navigateur.
- **Recettes hors réseau L** :
  `scripts/test-schoolnet-lot5d-l-session-gate.mjs`,
  **30/30 validés en CI**.
- **Recettes réelles L en CI Supabase local** :
  `scripts/test-schoolnet-lot5d-l-real-supabase.mjs`,
  **21/21** : GoTrue, `auth.sessions`, signOut,
  rôles, session croisée, privilèges SQL,
  deux sessions d'un Parent sur le même quota,
  **24 requêtes concurrentes → 12 autorisées,
  12 refusées**.
- **CI final** :
  [run #44497337368](https://github.com/ramon77777/schoolnet/actions/runs/44497337368),
  **10/10 jobs SUCCESS**, build, lint et compilation
  Deno inchangés. Une attente de test incorrecte sur
  JWT expiré a été corrigée avant cette validation.
- **Recette locale L : VALIDÉE le 19/11/2026** :
  `qa:lot5d:l` **30/30**, cumul A–L **249/249
  tests locaux validés** ; Parent 5.C **10/10**
  séparément, ESLint **0 erreur** (1 warning connu),
  build Vite **réussi** (868 modules), fast-forward
  `80b0146..1bf8e5b` sans conflit et fichiers locaux préservés.

**Blocages :** SQL L jamais installé au principal ;
Edge non déployée, aucun véritable parcours
HTTP Edge qualifié, pas de rate-limit des
jetons invalides ni de prise en charge complète
de la concurrence révocation/lecture ;
schéma K simplifié, année cible 2026–2027
déjà occupée. **Aucun GO production.**

### 5D-M : **VRAIE FONCTION EDGE PARENT TESTÉE VIA HTTP SUR SUPABASE LOCAL — CI ET LOCAL VALIDÉS**

Le 19/11/2026 sur la PR #15 **en brouillon** :
[rapport technique 5D-M](./SCHOOLNET_LOT5DM_EDGE_HTTP_PARENT_END_TO_END_2026-11-19.md).

- **Vraie fonction Edge, source inchangée sur l'hébergement :**
  `supabase/functions/schoolnet-parent-current-class/index.ts`
  garde son origine/projet de production exacts
  et son flag **OFF en hébergement**. Un mode
  de test additionnel exige un projet local
  (`http://kong:8000` / `127.0.0.1:54321`),
  une origine locale exacte et un flag serveur
  temporaire ; aucune URL Supabase hébergée
  ne satisfait cette combinaison.
- **Isolation stricte** : script
  `scripts/lot5d/5dm_prepare_edge_http_fixture.mjs`
  recopie **octet pour octet** la fonction et
  ses helpers dans un dossier GitHub Actions
  temporaire. Le `verify_jwt=false` n'existe
  **que dans la config locale jetable** pour
  tester les rejets Auth internes, jamais
  dans le `supabase/config.toml` du dépôt.
- **Recette HTTP end-to-end** :
  `scripts/test-schoolnet-lot5d-m-edge-http-real.mjs`,
  **25/25 scénarios réussis** : deux vraies
  sessions Parents fictives, isolation entre
  familles, historique non exposé comme courant,
  refus de JWT invalide et de rôle interdit,
  session révoquée **401**, quota **429**,
  panne du RPC **503**, aucune écriture
  des inscriptions historiques.
- **Recette locale hors réseau** :
  `scripts/test-schoolnet-lot5d-m-edge-http-contract.mjs`,
  **24/24 en CI et confirmés sur Windows le 19/11/2026**.
- **CI** : [run #44501540891](https://github.com/ramon77777/schoolnet/actions/runs/44501540891),
  **11/11 jobs SUCCESS**, y compris lots A–L,
  vraie Edge Deno, Auth/PostgreSQL locaux,
  lint et build. Les tests préliminaires
  I/CORS ont été adaptés sans affaiblir
  les règles d'accès POST.
- **Recette locale M : VALIDÉE LE 19/11/2026** :
  `git pull --ff-only` **réussi sans conflit**
  (`1bf8e5b..77a8bcb`), M **24/24 tests**,
  Parent 5.C **10/10 tests séparément**,
  lint **0 erreur** (1 warning React Hook
  historique), build Vite **réussi**
  (868 modules), état Git inchangé.
  **Cumul local A–M : 273/273 tests validés**.

**Bloqueurs avant production :** aucun SQL
L/M installé en hébergement, Edge non déployée,
code frontend Parent non raccordé ;
la vérification gateway JWT finale,
la parité du schéma 43 migrations, le
quota métier, la sauvegarde documentaire
durable et le blocage 2026–2027
restent à traiter. **Pas de GO production.**

### 5D-N : **VALIDATION JWT DE LA PASSERELLE SUPABASE ACTIVE SUR EDGE HTTP LOCALE — CI VALIDÉE, LOCAL À FAIRE**

Lot N démarré le 19/11/2026 sur la PR #15
**en brouillon** : [rapport technique 5D-N](./SCHOOLNET_LOT5DN_GATEWAY_JWT_VERIFY_TRUE_2026-11-19.md).

- **Nouvelle pile locale Docker indépendante** du M,
  avec **`verify_jwt=true`** dans le
  `config.toml` **TEMPORAIRE** uniquement,
  via `scripts/lot5d/5dn_prepare_jwt_verified_edge_fixture.mjs`.
  La vraie Edge et ses helpers sont copiés
  octet pour octet : **aucun changement de
  code Edge ou de la configuration suivie**.
- **Contrôles N hors réseau** :
  `scripts/test-schoolnet-lot5d-n-gateway-jwt-contract.mjs`
  **24/24 en CI**, recette Windows à recevoir.
- **Tests HTTP réels N** :
  `scripts/test-schoolnet-lot5d-n-gateway-jwt-real.mjs`
  **22/22** (23/23 nœuds Node avec
  agrégateur) : JWT légitime admis,
  jeton altéré/malformé refusé, deux
  familles isolées, rôles refusés,
  session révoquée → 401, quota → 429,
  panne SQL → 503, aucune mutation annuelle.
- **CI final** :
  [run #44506298347](https://github.com/ramon77777/schoolnet/actions/runs/44506298347)
  **12/12 jobs SUCCESS** ; une simple URL
  de contrôle de santé Auth dans N02 avait
  été corrigée avant la CI verte.
- **Recette locale N À FAIRE** :
  A–M **273/273 validés**, N **24/24 attendus**,
  objectif A–N **297/297**, Parent historique
  5.C **10/10 séparément**.

**Limites :** compatibilité des clés JWT du
**Supabase hébergé NON PROUVÉE**, schéma 43
migrations non reproduit, Edge Parent
OFF/non déployée, frontend non raccordé,
quota 12/min non approuvé, stockage durable
et année cible 2026–2027 bloqués.
Aucun nouveau GO production.

### Situation métier à résoudre

| Année | Année courante | Dossiers actifs | Impact |
| --- | --- | ---: | --- |
| 2025–2026 | Oui | 1 | Source legacy du passage envisagé. |
| 2026–2027 | Non | 1 | Dossier déjà actif dans la cible : **blocage obligatoire**. |
| 2027–2028 | Non | 0 | Aucune bascule décidée. |

**Précision issue de l'audit :** les deux dossiers actifs ne constituent **pas**
un doublon d'élève interannuel (0 paire de dossiers actifs avec le même
`student_id` sur deux années). Les deux classes sont en contexte
`legacy_unclassified`, cohérentes avec leur année. La situation bloquante
est une année cible **déjà occupée par un dossier actif distinct** ; le
responsable doit qualifier ce dossier avant toute clôture/bascule.
La base contient 4 événements d'inscriptions, 2 `class_students`,
2 `class_teachers` et 0 classe ou affectation S3-C officielle.
Les 1 affiliation d'établissement active restent indépendantes des dossiers
legacy.

**Risque SQL confirmé :** la RPC `admin_set_current_school_year` contrôle
le rôle Admin et verrouille la table des années, mais ne contrôle pas
la clôture des dossiers source/cible ni l'audit métier. Les anciens
`admin_upsert_student_enrollment` et `admin_set_student_enrollment_status`
peuvent modifier `class_students` et `profiles.class_name`. Le passage
5D définitif ne doit pas les réutiliser sans preuve d'innocuité.
Les alertes Security Advisors sur les fonctions `SECURITY DEFINER`
sont documentées dans le rapport, sans révocation globale imprudente.

**Interdictions absolues :**
- Ne pas utiliser la RPC historique `admin_set_current_school_year` en production :
  son serveur n'est pas encore protégé par le correctif 5D-A/B.
- Ne pas fixer `VITE_SCHOOLNET_LOT5D_WRITES_ENABLED=true`.
- Ne pas installer `20261110090000_school_year_rollover_controlled.sql` telle quelle.
- Ne pas installer la proposition 5D-A et 5D-B séparément : la migration finale
  devra **consolider** les protections, sans contournement par simple GUC.
- Ne jamais modifier ou « corriger » le dossier actif 2026–2027 par déduction
  ou à partir de la date système. Faire un audit métier et un choix approuvé.

## 5. Recettes locales 5D-D et 5D-E — **VALIDÉES**

Le 18/11/2026, après `git pull --ff-only` réussi (branche
`feature/schoolnet-lot5d-a-securisation-20261118`,
fast-forward `f93d228..dce9eeb`), l'utilisateur a transmis :

- `npm run qa:lot5d:d` : **15/15 réussis**, zéro échec.
- `npm run lint` : **0 erreur**, 1 warning préexistant
  `react-hooks/exhaustive-deps` dans `EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **réussi**, 867 modules Vite transformés.
  Browserslist ancien et bundle principal important restent des
  avertissements non bloquants.
- `git status --short` avant/après inchangé : `tsconfig.app.tsbuildinfo`
  modifié par build, trois scripts locaux non suivis, ainsi que
  `supabase/proposals/staged/` conservés.

**Récapitulatif validé localement :** A **9/9**, B **17/17**,
C **12/12**, D **15/15** soit **53/53 tests locaux** sur ces quatre
commandes, hors lint/build. Recette SQL **18/18** et scénarios de
concurrence/permis PostgreSQL 17 **réussis sur CI fictive**
(run [#44322527431](https://github.com/ramon77777/schoolnet/actions/runs/44322527431)).

Cette validation **n'autorise aucune migration réelle** :
proposition SQL `SANDBOX_ONLY.sql` toujours non installée, accès
admin à l'année active toujours verrouillé dans la branche et
**passerelle Admin réelle non implémentée**.

**Action suivante sous nouveau GO :** examiner la concurrence croisée
des anciennes fonctions d'inscription, identifier les conséquences
des affiliations historiques `class_students`, puis concevoir la
passerelle Admin serveur authentifiée, sans connexion de production
ni installation de SQL. Aucun travail de cette prochaine phase
n'est présumé autorisé par les tests ci-dessus.

### Recette locale 5D-E — **VALIDÉE LE 18 NOVEMBRE 2026**

L'utilisateur a transmis la sortie complète du terminal PowerShell sur
`D:\\Bakary\\10 autres\\schoolnet`. Branche confirmée :
`feature/schoolnet-lot5d-a-securisation-20261118`.

- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward réussi**, de `dce9eeb` vers `4920c68`, sans conflit.
- `npm run qa:lot5d:e` : **20 tests, 20 réussis**, 0 échec.
- `npm run lint` : **0 erreur**, 1 avertissement déjà connu
  `react-hooks/exhaustive-deps` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **réussi**, TypeScript + Vite, **867 modules**,
  `vite v7.3.1`. Avertissements non bloquants : données Browserslist
  anciennes, bundle JS principal volumineux.
- `git status --short` avant/après : `tsconfig.app.tsbuildinfo` modifié
  et les trois scripts locaux non suivis ainsi que
  `supabase/proposals/staged/` **conservés**.

**Total recettes locales A+B+C+D+E : 9+17+12+15+20 =
73/73 tests réussis.** Tests SQL en CI sur fixtures PostgreSQL 17
distincts de ce cumul local. Aucune écriture sur Supabase principal,
aucune migration installée, aucune fusion de la PR #15, aucune mise en
production Vercel décidée. La réussite de 5D-E ne rend pas la bascule
annuelle opérationnelle : anciennes RPC réelles et backend Admin privé
toujours à sécuriser sous nouveau GO.

### Recette locale du Lot 5D-F — **VALIDÉE LE 18 NOVEMBRE 2026**

L'utilisateur a exécuté dans PowerShell, sur
`D:\Bakary\10 autres\schoolnet`, la branche
`feature/schoolnet-lot5d-a-securisation-20261118` :

- `git status --short` et `git branch --show-current` : branche
  attendue, état local contrôlé avant et après.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward réussi**, de `4920c68` à `f3ec13f`.
- `npm run qa:lot5d:f` : **12 tests réussis, 0 échec**.
- `npm run lint` : **0 erreur**, 1 avertissement
  React Hook déjà connu à la ligne 161 d'`EnrollmentRecordsPage.tsx`.
- `npm run build` : **TypeScript et Vite réussis**, 867 modules,
  Vite v7.3.1 (avertissements Browserslist et taille du bundle).
- `git status --short` final inchangé : `tsconfig.app.tsbuildinfo`
  modifié, 3 scripts locaux non suivis et `supabase/proposals/staged/`
  toujours préservés ; aucun fichier local supprimé.

**Total local validé des Lots 5D-A à F : 9+17+12+15+20+12 =
85/85 tests.** Les scénarios de concurrence PostgreSQL 17,
distincts de ces tests locaux, ont réussi dans GitHub Actions sur
des **données fictives**. Aucune installation des propositions SQL F,
aucun véritable backend Admin et aucune validation de production.

### Recette locale du Lot 5D-G — **VALIDÉE LE 18 NOVEMBRE 2026**

L'utilisateur a exécuté la recette dans PowerShell sur
`D:\Bakary\10 autres\schoolnet`, depuis la branche
`feature/schoolnet-lot5d-a-securisation-20261118` :

- `git status --short` et `git branch --show-current` : branche attendue
  et état Git local contrôlé au début et à la fin.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward réussi**, de `f3ec13f` à `20125ba`, sans conflit.
- `npm run qa:lot5d:g` : **20/20 tests réussis**, zéro échec.
- `npm run lint` : **0 erreur** ; avertissement historique
  `react-hooks/exhaustive-deps` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : TypeScript et Vite **réussis**, Vite v7.3.1,
  **867 modules** ; avertissements non bloquants sur Browserslist
  et taille du bundle JavaScript.
- `git status --short` final : état local **inchangé** ;
  `tsconfig.app.tsbuildinfo` modifié, trois scripts non suivis
  `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs` et
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`,
  ainsi que `supabase/proposals/staged/` **conservés**.

**Total des recettes locales Lots 5D-A à G :**
9 + 17 + 12 + 15 + 20 + 12 + 20 = **105/105 tests validés**.
Les assertions SQL PostgreSQL 17 exécutées dans GitHub Actions
sont distinctes et ne sont pas comptées dans ce cumul.

**Important :** cette recette valide un contrat de passerelle
**mock/hors réseau** et une CI sur PostgreSQL 17 **fictif** ;
elle ne valide pas un backend Admin réellement authentifié,
la sécurité des fichiers Storage ni l'installation SQL en
production. Aucune fonction 5D réelle n'a été installée.

### Recette locale du Lot 5D-H — **VALIDÉE LE 18 NOVEMBRE 2026**

L'utilisateur a transmis la sortie complète PowerShell, depuis
`D:\Bakary\10 autres\schoolnet`, sur la branche
`feature/schoolnet-lot5d-a-securisation-20261118` :

- `git status --short` puis `git branch --show-current` :
  branche vérifiée, état local contrôlé avant/après.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward réussi** de `20125ba` vers `c9ad909`,
  sans conflit ni perte des fichiers locaux.
- `npm run qa:lot5d:h` : **24/24 tests réussis**, aucun échec.
- `node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs` :
  **10/10 tests de non-régression Parent réussis**,
  vérifiés à part du total A–H.
- `npm run lint` : **0 erreur** ; 1 warning connu
  `react-hooks/exhaustive-deps` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **TypeScript et Vite réussis**,
  Vite v7.3.1, **868 modules** ; remarques non bloquantes
  Browserslist et taille du bundle principal.
- `git status --short` final **inchangé** :
  `tsconfig.app.tsbuildinfo` modifié, scripts
  `schoolnet-student-auth-sandbox-local.mjs`,
  `test-schoolnet-student-auth-flow-mock.mjs`,
  `test-schoolnet-student-auth-sandbox-local.mjs`
  et `supabase/proposals/staged/` non suivis **préservés**.

**Cumul des recettes locales A à H : 9 + 17 + 12 + 15 + 20
+ 12 + 20 + 24 = 129/129 tests validés.** Les 10 tests Parent
Lot 5.C, ainsi que les essais SQL PostgreSQL 17 exécutés
en CI, sont confirmés **séparément**, sans double comptage.

La validation n'installe pas la politique Storage `SANDBOX_ONLY`,
ne crée pas de backend Admin authentifié, ne garantit pas encore
les objets Storage du vrai service et ne résout pas l'année
cible 2026–2027 déjà occupée.

### Recette locale du Lot 5D-I — **VALIDÉE LE 19 NOVEMBRE 2026**

L'utilisateur a transmis le journal PowerShell complet du projet
`D:\Bakary\10 autres\schoolnet` :

- `git branch --show-current` : branche
  `feature/schoolnet-lot5d-a-securisation-20261118` conforme.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward sans conflit**, `c9ad909..cc466e6`.
- `npm run qa:lot5d:i` : **30 tests réussis sur 30**,
  aucun échec ni test ignoré.
- `node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs` :
  **10/10 tests Parent historiques réussis**, comptés séparément.
- `npm run lint` : **0 erreur**,
  **1 avertissement préexistant** `react-hooks/exhaustive-deps`,
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : TypeScript et Vite **réussis**,
  Vite v7.3.1, **868 modules**. Les avertissements
  Browserslist et taille du bundle sont non bloquants.
- `git status --short` après exécution **inchangé** :
  `tsconfig.app.tsbuildinfo` modifié ; fichiers locaux
  `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs`,
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`
  et dossier `supabase/proposals/staged/` **préservés**.
- Les mentions PowerShell « Historique restauré » ne sont pas
  des erreurs des commandes ni des tests.

**Bilan local A à I : 9 + 17 + 12 + 15 + 20 + 12 + 20 + 24
+ 30 = 159/159 tests réussis.** Les 10 tests Parent
5.C et les essais PostgreSQL 17 CI sont distincts de ce total.

**Périmètre confirmé :** code Parent annualisé désactivé et non déployé,
registre documentaire SQL `SANDBOX_ONLY` non installé,
aucune suppression Storage serveur ni sauvegarde réelle. L'année
2026–2027 est toujours bloquée par son dossier actif existant.

**Prochaine phase sous GO distinct :** qualifier sur une
infrastructure isolée l'Auth, les sessions, le rate-limit,
l'API Storage, la sauvegarde/réconciliation documentaire et la
lecture Parent réellement autorisée. Pas de SQL principal,
de migration, de fusion `main` ni de déploiement Vercel.

### Recette locale du Lot 5D-J — **VALIDÉE LE 19 NOVEMBRE 2026**

Résultat PowerShell intégral transmis depuis
`D:\Bakary\10 autres\schoolnet`, sur la branche
`feature/schoolnet-lot5d-a-securisation-20261118` :

- `git status --short` / `git branch --show-current` :
  branche attendue et état local vérifiés avant et après.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  **fast-forward réussi** `cc466e6..5f394be`, sans conflit.
- `npm run qa:lot5d:j` : **40/40 tests J réussis**,
  incluant les scénarios d'Auth/session et les vrais
  échanges HTTP sur une fixture `127.0.0.1` seulement.
- `node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs` :
  **10/10 tests Parent 5.C réussis séparément**.
- `npm run lint` : **0 erreur**, un avertissement historique
  `react-hooks/exhaustive-deps` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **TypeScript et Vite réussis**,
  Vite v7.3.1, **868 modules** ; remarques non bloquantes
  Browserslist et bundle principal volumineux.
- `git status --short` final identique à celui du début :
  `tsconfig.app.tsbuildinfo` modifié, trois scripts locaux
  `schoolnet-student-auth-sandbox-local.mjs`,
  `test-schoolnet-student-auth-flow-mock.mjs` et
  `test-schoolnet-student-auth-sandbox-local.mjs`,
  ainsi que `supabase/proposals/staged/` non suivis **préservés**.

**Bilan cumulatif local 5D-A à J :**
9 + 17 + 12 + 15 + 20 + 12 + 20 + 24 + 30 + 40
= **199/199 tests validés**. Les **10 tests Parent 5.C**
sont vérifiés à part, tout comme les assertions SQL des CI.

La validation confirme les contrats simulés du J ; elle
**ne constitue pas une recette de sécurité de Supabase Auth
ou Storage sur un environnement connecté et fidèle**.
La fonction Parent I reste OFF/non déployée, et la copie
de rétention et l'audit Storage véritables restent non implémentés.
L'année cible 2026–2027 est toujours occupée et la bascule interdite.

### Recette locale du Lot 5D-K — **VALIDÉE LE 19 NOVEMBRE 2026**

L'utilisateur a exécuté les commandes PowerShell depuis
`D:\Bakary\10 autres\schoolnet` et transmis la sortie complète :

- `git status --short` et `git branch --show-current` :
  branche `feature/schoolnet-lot5d-a-securisation-20261118`
  confirmée, état local vérifié avant et après.
- `git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118` :
  fast-forward **réussi sans conflit** de `5f394be`
  vers `80b0146`.
- `npm run qa:lot5d:k` : **20/20 tests contractuels
  réussis**, aucun échec, aucun test ignoré.
- `node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs` :
  **10/10 tests Parent historiques du Lot 5.C réussis**,
  calculés séparément du total A–K.
- `npm run lint` : **0 erreur**, un avertissement
  `react-hooks/exhaustive-deps` préexistant dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **TypeScript et Vite réussis**,
  Vite v7.3.1, **868 modules**. Les avertissements
  Browserslist et taille du bundle ne bloquent pas la compilation.
- `git status --short` final **inchangé** :
  `tsconfig.app.tsbuildinfo` modifié, fichiers non suivis
  `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs`,
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`
  et `supabase/proposals/staged/` **préservés**.

**Cumul des tests locaux 5D-A à K : 199 + 20 =
219/219 tests réussis.** Les 10 tests Parent 5.C et
les **21/21 intégrations API Supabase réellement locales en CI**
sont des validations **complémentaires non comptées dans 219**.
La CI du code K et la CI du rapport initial K ont
toutes deux réussi leurs **10/10 jobs**.

Cette recette ne valide **pas** les scénarios sur
le schéma complet du principal : la fixture SQL K
reste simplifiée et temporaire. La fonction Edge Parent
n'est **ni déployée ni activée**, et ne contrôle pas encore
elle-même la révocation des sessions ; rate-limit
persistant et audit durable de rétention restent absents.
Les deux projets Supabase hébergés demeurent inchangés.

**Prochaine étape uniquement sous GO distinct :**
préparer et qualifier la vérification de session
côté Edge, un quota persistant, les permissions
sur schéma plus fidèle, et la réconciliation
documentaire avec une sauvegarde durable.

**Aucune migration sur Supabase principal, aucune fusion
`main`, aucun déploiement Vercel.**
### Recette locale du Lot 5D-L — **VALIDÉE LE 19/11/2026**

Compte rendu PowerShell transmis depuis
`D:\Bakary\10 autres\schoolnet` :

- Branche `feature/schoolnet-lot5d-a-securisation-20261118` confirmée ;
  `git pull --ff-only` **réussi** (`80b0146..1bf8e5b`) sans conflit.
- `npm run qa:lot5d:l` : **30/30 tests réussis**, sans échec
  ni test ignoré.
- Tests Parent historiques 5.C : **10/10**, calculés séparément.
- ESLint : **0 erreur**, 1 avertissement historique React Hook
  `exhaustive-deps` à `EnrollmentRecordsPage.tsx:161`.
- Build `tsc -b && vite build` : **réussi**, Vite v7.3.1,
  **868 modules** ; avertissements non bloquants Browserslist
  et gros chunks.
- `git status --short` **inchangé** entre début et fin :
  `tsconfig.app.tsbuildinfo` modifié, trois scripts
  `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs` et
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`
  non suivis, ainsi que `supabase/proposals/staged/` :
  **tout est préservé**.

**Recettes locales Lots 5D-A à L : 249/249 tests validés**.
Les 10 tests Parent 5.C et les **21 tests K + 21 tests L**
sur API Supabase locale réelle en CI restent distincts.
GitHub Actions [#44497337368](https://github.com/ramon77777/schoolnet/actions/runs/44497337368)
et [#44498015968](https://github.com/ramon77777/schoolnet/actions/runs/44498015968)
ont chacun réussi **10/10 jobs**.

Les barrières de sécurité restent actives : Edge Parent
**OFF et non déployée**, SQL L **SANDBOX_ONLY et non installé**
sur Supabase hébergé, quota 12/min **à valider métier**,
pas de copie fidèle des 43 migrations, sauvegarde documentaire
durable non finalisée, cible 2026–2027 occupée.
**Aucun GO de migration, fusion main ou Vercel**.

### Recette locale du Lot 5D-M — **VALIDÉE LE 19 NOVEMBRE 2026**

L'utilisateur a transmis la sortie PowerShell complète depuis
`D:\Bakary\10 autres\schoolnet` :

- Branche `feature/schoolnet-lot5d-a-securisation-20261118`
  confirmée ; `git pull --ff-only` **réussi sans conflit**
  (`1bf8e5b..77a8bcb`).
- `npm run qa:lot5d:m` : **24/24 tests M réussis**,
  sans échec, annulation ni test ignoré.
- Tests historiques Parent 5.C : **10/10 réussis**,
  comptés séparément.
- ESLint : **0 erreur**, un avertissement React Hook
  `react-hooks/exhaustive-deps` préexistant,
  à `EnrollmentRecordsPage.tsx:161`.
- Build `tsc -b && vite build` : **réussi**,
  Vite v7.3.1, **868 modules** ; avertissements
  non bloquants Browserslist et taille du bundle.
- `git status --short` avant/après **identique** :
  `tsconfig.app.tsbuildinfo` reste modifié ;
  `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs`,
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`
  et `supabase/proposals/staged/` restent non suivis
  et **préservés**.

**Cumul local 5D-A à M : 249 + 24 =
273/273 tests validés**. Les **10 tests Parent 5.C**,
les **21 intégrations K**, **21 L** et **25 scénarios
HTTP M** exécutés en CI sont des validations distinctes.

**CI confirmée :** [#44501540891](https://github.com/ramon77777/schoolnet/actions/runs/44501540891)
et [#44502231086](https://github.com/ramon77777/schoolnet/actions/runs/44502231086)
ont chacune réussi **11/11 jobs**.

**Restrictions inchangées :** la vraie Edge Parent
est **non déployée** et le frontend **non raccordé**.
Le `verify_jwt=false` du test M reste **uniquement
dans la configuration Docker temporaire** ; SQL
`SANDBOX_ONLY` non installé sur Supabase hébergé,
parité avec les 43 migrations non démontrée,
quota 12/min encore à approuver, conservation
documentaire durable non achevée et année
2026–2027 occupée.

**Toute nouvelle phase, migration, activation Edge,
fusion de `main` ou publication Vercel
nécessite un GO distinct.**

### Prochaine recette locale — Lot 5D-N

La CI a validé **12/12 jobs**,
**24/24 tests N hors réseau** et
**22/22 scénarios HTTP Edge réels**
avec `verify_jwt=true` sur une pile
Supabase locale jetable.

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:n
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build
git status --short
```

**Attendu : N 24/24**, Parent 5.C
10/10 séparément, lint 0 erreur
(un warning historique possible),
build Vite réussi, scripts locaux et
propositions non suivies préservés.
Cumul A–M **273/273**, objectif
A–N **297/297** après validation.

**Ne pas exécuter `qa:lot5d:n:integration`
sans une pile Supabase locale dédiée :
la CI l'a déjà effectuée.**

## 6. Ce qui suivra, sur validations distinctes

**5D-A+B / CANDIDAT PREPARE, RECETTE SQL ISOLEE ET REVUE METIER A TERMINER** :
1. **Audit technique terminé en lecture seule.** Examen métier du
   dossier actif 2026–2027 par un responsable habilité : **à faire**,
   sans changement de statut automatique.
2. **Candidat consolidé / 18 tests SQL fictifs validés et concurrence CI réussie ;**
   recette locale `qa:lot5d:d` **15/15 validée par l'utilisateur**.
   Pas de migration ni de backend Admin réel installé.
3. Définir la politique d'année SCHOOLNET globale et le parcours
   des établissements ; la gestion S3-C reste **distincte**.
4. **5D-E : concurrence croisée avec RPC legacy simulées, gel des archives
   et mock Admin validés en CI** ; recette locale E **20/20 validée par l'utilisateur**.
   Ensuite, auditer **les définitions complètes des RPC de production**,
   tester une copie fidèle du vrai schéma, revoir les écrans historiques
   Parent/Enseignant et préparer un véritable backend Admin avec un rôle
   SQL privé et une authentification vérifiée.
5. **5D-F : cinq RPC historiques complètes préparées et CI validée ;**
   tests locaux F **12/12 validés**, choix de la passerelle Admin et
   vérification des chemins non couverts (RLS direct et demandes publiques).
6. **5D-G** : audit RLS/droits/Storage en lecture seule, CI 6/6
   et mock gateway **20/20 validés également en local le 18/11/2026**.
   **Garde documentaire SQL insuffisant seul** : l'ordre actuel
   Storage.remove() avant métadonnées doit être protégé côté Storage
   et métier sur un environnement isolé.
7. **5D-H :** suppression navigateur suspendue, réponse SQL incertaine
   conservée, politique Storage refusant DELETE seulement en PG17 fictif,
   et étiquetage Parent/Enseignant corrigé. **24/24 tests H validés
   en CI et en local ; 10/10 tests Parent du Lot 5.C validés
   en local et CI 7/7 jobs SUCCESS.** La vraie suppression privée,
   la lecture annuelle parentale et les tests Storage API restent ouverts.
8. **5D-I** : lecture annuelle Parent à serveur Auth réel préparée,
   **non déployée et désactivée**, revue documentaire SQL privée
   `SANDBOX_ONLY` sans effacement, idempotence et blocage
   de la clôture avec demande en attente. CI **8/8**, tests I
   **30/30 validés également en local le 19/11/2026** ;
   cumul A–I **159/159**. Tests Parent 5.C **10/10**
   relancés séparément. Sauvegarde/restauration
   Storage, rôle SQL dédié et parcours annuel Parent réel
   restent à valider.
9. **5D-J :** contrat HTTP local de vérification des sessions
   Parent, refus des rôles non autorisés et des pannes rate-limit,
   copie/lecture/empreinte SHA-256 de pièces fictives et diagnostics
   de reprise sans suppression. CI **9/9 jobs**, J **40/40
   validés en local le 19/11/2026**, cumul A–J **199/199** ;
   tests Parent 5.C **10/10** séparément. **Aucune vraie
   session Supabase ni aucun fichier réel n'ont été utilisés.**
10. **5D-K :** intégration CI sur de **vraies API Supabase
   locales éphémères**, cinq comptes Auth fictifs,
   deux buckets privés, deux familles isolées RLS,
   `auth.sessions` vérifié après signOut,
   sauvegarde Storage réelle locale avec SHA-256,
   refus de suppression Admin. **21/21 parcours API
   réels en CI, 20/20 tests contractuels K également
   validés en local le 19/11/2026, cumul A–K
   219/219**, tests historiques Parent 5.C 10/10
   séparément ; CI **10/10 jobs SUCCESS**.
   Le sandbox hébergé et le principal sont inchangés.
11. **5D-L** : source Edge Parent renforcée avec
   contrôle de présence de session en base et quota
   atomique PostgreSQL, grâce à un RPC privé
   service_role-only **SANDBOX_ONLY**. CI **10/10
   jobs**, L **30/30 hors réseau** + **21/21
   intégration Supabase locale réelle**, recette
   locale L **30/30 validée le 19/11/2026**,
   cumul A–L **249/249**. **Aucune migration
   ni fonction Edge déployée.** Seuil test
   de 12/min à revoir avant GO.
12. **5D-M** : vraie fonction Edge Deno servie
   via Supabase CLI local jetable sur le routeur HTTP
   réel : **25/25 scénarios**, tests contractuels
   hors réseau **24/24**, GitHub Actions
   **11/11 jobs SUCCESS**. Aucun client hébergé
   ou fichier réel utilisé. Recette locale M
   **24/24 validée le 19/11/2026**,
   cumul **A–M 273/273 tests locaux validés**. **Mode test `verify_jwt=false`
   UNIQUEMENT dans la config Docker jetable,
   pas dans le vrai dépôt ou en production.**
13. **5D-N** : seconde pile Docker Jetable avec
   **`verify_jwt=true` au niveau passerelle**,
   Edge copiée octet pour octet, **24/24 tests
   contractuels et 22/22 scénarios HTTP réels**
   réussis en CI **12/12 jobs SUCCESS**.
   Recette locale N à confirmer ; objectif
   A–N **297/297**. Clés JWT hébergées
   **non qualifiées** ; aucune fonction
   ni SQL installés en production.
14. Soumettre une future migration finale et son éventuelle installation
   dans le principal **uniquement sous nouveaux GO distincts**,
   après sauvegarde et préflight. Aucune écriture réelle actuellement.

**APRÈS ACTIVATION SQL AUTORISÉE** :
- Recette métier contrôlée, puis fusion PR #15 et publication sur le **Vercel
  SCHOOLNET existant** uniquement après validation.
- Traiter les demandes d'inscription publiques encore ouvertes, sans lien
  automatique avec les dossiers et familles existants.
- Étendre le cycle annuel aux établissements S3-C, classes/enseignants/élèves
  et renouvellement des affectations, **sans déplacer les inscriptions historiques**.
- Reprendre le backlog de la feuille de route (salles / emploi du temps,
  présences, bulletins, notification, finances, documents) au fil des GO.

## 7. Dettes techniques distinctes, non bloquantes pour la recette locale

- ESLint : avertissement `useEffect` dépendance `user` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- Browserslist : base `caniuse-lite` ancienne.
- Bundle Vite principal important : code splitting à planifier.
- Migration séparée `20261109140104_harden_assessment_legacy_rpcs.sql`
  encore à traiter ; ne pas l'installer implicitement avec le Lot 5D.

## 8. Règle de reprise

> **SCHOOLNET : documents prioritaires pour la reprise**
> - `docs/releases/SCHOOLNET_WORKFLOW_REPRISE_LOT5D_2026-11-18.md`
> - `docs/releases/SCHOOLNET_AUDIT_SERVEUR_LOT5DB_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5D_AB_CANDIDAT_SQL_ISOLE_2026-11-18.md`
> - `docs/releases/SCHOOLNET_AUDIT_COMPAT_5D_D_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DE_CONCURRENCE_RPC_ARCHIVES_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DF_RPC_COMPLETES_PASSERELLE_ADMIN_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DG_AUDIT_RLS_PASSERELLE_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DH_ARCHIVES_STORAGE_CLASSES_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DI_LECTURE_PARENT_REVUE_DOCUMENTAIRE_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5DJ_AUTH_SESSIONS_STORAGE_HTTP_2026-11-19.md`
> - `docs/releases/SCHOOLNET_LOT5DK_AUTH_STORAGE_REELS_ISOLES_2026-11-19.md`
> - `docs/releases/SCHOOLNET_LOT5DL_SESSION_PARENT_QUOTA_PERSISTANT_2026-11-19.md`
> - `docs/releases/SCHOOLNET_LOT5DM_EDGE_HTTP_PARENT_END_TO_END_2026-11-19.md`
> - `docs/releases/SCHOOLNET_LOT5DN_GATEWAY_JWT_VERIFY_TRUE_2026-11-19.md`
>
> Branche `feature/schoolnet-lot5d-a-securisation-20261118`,
> PR #15 **brouillon**, `main` et Vercel existant inchangés.
> **Recettes locales A9/9, B17/17, C12/12, D15/15,
> E20/20, F12/12, G20/20, H24/24, I30/30 et J40/40
> VALIDÉES le 19/11/2026 : 199/199 tests locaux A à J.**
> Les 10/10 tests historiques Parent 5.C sont validés
> et comptabilisés séparément.
> CI GitHub Actions [run #44329876560](https://github.com/ramon77777/schoolnet/actions/runs/44329876560) :
> **3 jobs SUCCESS**, incluant tests 5D-E 20/20, SQL PG17
> concurrent, 11 assertions de garde historique et archivage fictif.
> Audit Supabase principal **SELECT uniquement**, 43 migrations,
> année 2025–2026 courante (1 actif), cible 2026–2027 (1 actif
> d'un autre élève), 1 bulletin, 2 parent_links, 4 événements,
> 2 liens legacy : **aucune donnée modifiée**.
> Candidat SQL A+B et garde E **NON INSTALLÉS** ;
> anciennes RPC réelles **non corrigées** ;
> passerelle Admin uniquement simulée et **NON DÉPLOYÉE**.
>
> **Point de reprise après VALIDATION LOCALE G le 18/11/2026 :**
> A9/9 + B17/17 + C12/12 + D15/15 + E20/20 + F12/12 + G20/20
> = **105/105 tests locaux validés par l'utilisateur** ; lint 0 erreur,
> build Vite réussi. CI [run #44342623526](https://github.com/ramon77777/schoolnet/actions/runs/44342623526)
> **6/6 jobs SUCCESS** avec PostgreSQL 17 fictif, sans écriture dans
> Supabase principal.
> **Blocages persistants :** dossier actif déjà présent en 2026–2027 ;
> le Storage supprime l'objet avant la métadonnée SQL et n'a aucun
> garde d'archive adapté ; aucune passerelle Admin réelle
> (uniquement des adaptateurs mock sans réseau), schéma de test non fidèle
> à l'intégralité de la production et écrans Parent/Enseignant historiques.
> **Lot 5D-H validé par l'utilisateur le 18/11/2026** :
> **129/129 tests locaux A–H**, ainsi que **10/10 tests historiques
> Parent 5.C** vérifiés séparément ; lint 0 erreur, build Vite réussi
> (868 modules), fast-forward `20125ba..c9ad909` sans conflit.
> CI [run #44349841500](https://github.com/ramon77777/schoolnet/actions/runs/44349841500)
> **7/7 jobs SUCCESS** sur le commit documentaire du H.
> Suppression navigateur suspendue, fichier conservé si SQL non
> confirmé, proposition de politique Storage H **SANDBOX_ONLY**
> (NON INSTALLÉE). Parent/Enseignant indiquent la classe historique
> ou le caractère fictif des données ; lecture de la classe annuelle
> active Parent pas encore raccordée.
> **Après GO distinct** : concevoir la suppression privée avec
> conservation et reprise, tests Auth/Storage fidèles, lecture
> annuelle Parent/Enseignant et passerelle Admin authentifiée.
> **Année cible occupée : aucune bascule autorisée.**
> **Aucune migration ni déploiement autorisé.**
> **VALIDATION LOCALE DU LOT 5D-I le 19 novembre 2026** :
> `qa:lot5d:i` **30/30**, cumul A–I **159/159 tests
> locaux validés**, plus **10/10 tests Parent 5.C** séparément.
> Lint **0 erreur** (1 avertissement connu), build Vite
> **réussi** (868 modules) et fast-forward `c9ad909..cc466e6`
> sans conflit ; scripts et propositions locaux non suivis conservés.
> GitHub Actions [#44354522623](https://github.com/ramon77777/schoolnet/actions/runs/44354522623)
> **8/8 jobs SUCCESS** sur le commit documentaire initial I.
> Fonction Parent annuelle compilée mais **OFF/non déployée** ;
> requête documentaire privée `SANDBOX_ONLY` testée sur PostgreSQL
> 17 fictif, **aucune suppression ni backup réel**.
> La cible 2026–2027 reste occupée : **aucune bascule possible**.
> **Prochaine phase sous nouveau GO :** sandbox Auth/Storage fidèle,
> sessions/rate-limit, conservation vérifiable et réconciliation,
> raccordement Parent sous autorisation.
> **Pas de SQL principal, pas de fusion main, pas de Vercel production.**
> **Lot 5D-J validé localement le 19 novembre 2026** :
> `qa:lot5d:j` **40/40**, cumul A–J **199/199 tests
> locaux validés**, Parent 5.C **10/10 séparément**,
> lint **0 erreur**, build Vite **réussi** (868 modules),
> fast-forward `cc466e6..5f394be` sans conflit.
> CI [#44488962570](https://github.com/ramon77777/schoolnet/actions/runs/44488962570)
> **9/9 jobs SUCCESS** sur le commit documentaire J.
> Auth/session et Storage HTTP sont des **simulations limitées
> à 127.0.0.1**. L'Edge annuelle Parent I reste OFF/non déployée ;
> aucune vérification réelle `auth.sessions`, aucun
> rate-limit persistant ou backup Storage réel n'est installé.
> La cible 2026–2027 reste occupée : **bascule interdite**.
> **Prochaine phase avec GO distinct :** banc Auth/Storage
> isolé plus fidèle (vraies sessions fictives, RLS, bucket privé,
> conservation/reprise prouvées), puis validations produit et sécurité.
> **Aucune migration, aucune fusion main ni aucun déploiement.**
> **Lot 5D-K : validation locale reçue le 19/11/2026** :
> `qa:lot5d:k` **20/20**, total A–K **219/219
> tests locaux validés**, Parent 5.C **10/10 séparément**,
> lint **0 erreur** (1 warning historique), build Vite
> **réussi** (868 modules), fast-forward
> `5f394be..80b0146` sans conflit, fichiers locaux
> non suivis conservés.
> **CI** : [run #44493802616](https://github.com/ramon77777/schoolnet/actions/runs/44493802616)
> **10/10 jobs SUCCESS**, plus
> [run #44493115080](https://github.com/ramon77777/schoolnet/actions/runs/44493115080)
> **10/10** sur le code : **21/21 tests d'intégration
> réels API Supabase locale** (GoTrue, PostgREST,
> `auth.sessions`, RLS, Storage et rétention SHA-256)
> distincts des 219 tests locaux.
> **Limites :** intégration exécutée dans une pile
> jetable à schéma minimal, pas sur une reproduction
> intégrale du principal. Edge Parent I toujours
> OFF/non déployée, sans véritable vérification de
> session révoquée ni quota persistant ; sauvegarde
> uniquement sur Storage CI local, sans rétention
> serveur durable ou reprise métier complète.
> **Année cible 2026–2027 occupée : bascule interdite.**
> **Prochaine phase sous GO distinct :** sécuriser le
> vrai parcours Edge, quota et conservation/reprise,
> puis revoir la compatibilité avec le schéma réel.
> **Pas de SQL hébergé, pas de fusion `main`
> ni de déploiement Vercel.**
> **5D-L : recette locale VALIDÉE le 19/11/2026** :
> **30/30 tests L**, total **249/249 tests locaux A–L** ;
> Parent 5.C **10/10** séparément ; ESLint 0 erreur
> (1 avertissement existant), build Vite réussi (868 modules).
> Fast-forward `80b0146..1bf8e5b` sans conflit ;
> scripts locaux non suivis et propositions préservés.
> CI [#44497337368](https://github.com/ramon77777/schoolnet/actions/runs/44497337368)
> et [#44498015968](https://github.com/ramon77777/schoolnet/actions/runs/44498015968)
> **10/10 jobs SUCCESS chacun** ; **21/21 intégrations L**
> sur vraie pile Supabase locale jetable.
> 24 demandes concurrentes : **12 acceptées, 12 refusées**.
> **Bloqueurs :** Edge Parent toujours OFF/non déployée,
> SQL L privé seulement dans la fixture locale,
> quota 12/min à confirmer, HTTP Edge bout-à-bout non qualifié,
> schéma réel non reproduit intégralement et année cible
> 2026–2027 occupée. **Aucune bascule autorisée.**
> **Prochain lot seulement après accord distinct ;
> aucun changement Supabase principal, main ou Vercel.**
> **Lot 5D-M : recette locale VALIDÉE le 19/11/2026** :
> `npm run qa:lot5d:m` **24/24**, total
> **273/273 tests locaux A–M** ;
> Parent 5.C **10/10** séparément,
> ESLint **0 erreur** (1 warning historique),
> build Vite **réussi** (868 modules),
> pull `1bf8e5b..77a8bcb` sans conflit
> et fichiers non suivis préservés.
> CI [#44501540891](https://github.com/ramon77777/schoolnet/actions/runs/44501540891)
> et [#44502231086](https://github.com/ramon77777/schoolnet/actions/runs/44502231086) :
> **11/11 jobs SUCCESS chacune** ;
> **25/25 scénarios HTTP** de la vraie Edge
> avec Auth/Postgres locaux et familles fictives,
> distincts des tests locaux.
> Session révoquée : 401 ; rôle interdit : 403 ;
> quota épuisé : 429 ; RPC indisponible : 503.
> **Limites :** Edge toujours non déployée,
> frontend non raccordé, `verify_jwt=false`
> réservé au Docker de test, SQL non installé
> en hébergement, schéma non paritaire,
> seuil 12/min non validé métier, rétention
> documentaire durable ouverte et
> année cible 2026–2027 occupée.
> **Prochaine phase sous GO distinct ;
> aucune migration, fusion `main`,
> bascule ni publication Vercel.**
> **Point de reprise après CI 5D-N, 19/11/2026** :
> [12/12 jobs SUCCESS](https://github.com/ramon77777/schoolnet/actions/runs/44506298347).
> **24/24 contrôles N hors réseau**,
> **22/22 scénarios HTTP Edge** réels avec
> `verify_jwt=true` dans le Docker de CI
> (23/23 tests Node incluant l'agrégateur).
> JWT authentique accepté ; altéré/refusé ;
> familles isolées, session révoquée 401,
> rôle interdit 403, quota 429, panne RPC 503.
> Aucun changement Edge applicative ni
> `supabase/config.toml` suivi ; aucun projet
> Supabase hébergé modifié.
> **Recette locale N : à faire**, `qa:lot5d:n`
> **24/24**, Parent 5.C 10/10,
> lint et build. Total A–M **273/273 validés**,
> objectif A–N **297/297**.
> **Bloqueurs :** clés/signatures JWT hébergées
> non vérifiées ; Edge Parent OFF/non déployée,
> frontend non raccordé, schéma 43 migrations
> non reproduit, quota 12/min à approuver,
> rétention durable absente, année
> 2026–2027 occupée et bascule interdite.
> **Aucune migration Supabase principal,
> fusion `main` ou déploiement Vercel.**
> **Ne pas toucher aux dossiers réels, SQL Editor principal,
> `supabase db push`, flag d'écriture, `main` ou Vercel
> sans autorisation spécifique.**
