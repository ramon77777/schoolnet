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

## 5. Recette locale 5D-D — **VALIDÉE PAR L'UTILISATEUR**

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
4. Compléter la recette fidèle au vrai schéma, tester la **concurrence croisée
   avec les RPC historiques**, vérifier les listes Parent/Enseignant et préparer
   un véritable backend Admin avec rôle SQL privé et vérification Auth.
5. Soumettre une future migration finale et son éventuelle installation
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

> **À lire en premier lors de la prochaine conversation SCHOOLNET :**
> - `docs/releases/SCHOOLNET_WORKFLOW_REPRISE_LOT5D_2026-11-18.md`
> - `docs/releases/SCHOOLNET_AUDIT_SERVEUR_LOT5DB_2026-11-18.md`
> - `docs/releases/SCHOOLNET_LOT5D_AB_CANDIDAT_SQL_ISOLE_2026-11-18.md`
> - `docs/releases/SCHOOLNET_AUDIT_COMPAT_5D_D_2026-11-18.md`
>
> Branche `feature/schoolnet-lot5d-a-securisation-20261118`,
> PR #15 **brouillon**, `main` et Vercel existant non modifiés.
> **Recettes locales A9/9, B17/17, C12/12, D15/15 validées** :
> 53/53 ; lint 0 erreur (1 avertissement connu), build OK.
> **CI SQL PostgreSQL 17 fictive** 18/18 et scénarios de deux
> sessions, RLS, droits et classe réussis (run #44322527431).
> Audit du Supabase principal **SELECT uniquement**, 43 migrations,
> année 2025–2026 courante (1 actif), cible 2026–2027 déjà occupée
> (1 actif **d'un autre apprenant**) : **bascule strictement bloquée**.
> Candidat SQL transactionnel **NON INSTALLÉ**, ancienne RPC directe
> toujours présente côté Supabase et passerelle Admin encore simulée.
> **Prochaine phase à autoriser explicitement** : concurrence croisée
> avec les RPC legacy, revue des liens historiques, architecture puis
> code serveur Admin verrouillé. Aucune migration SQL ni changement
> de données réelles autorisés.
>
> **Ne pas nettoyer les scripts locaux, modifier Supabase principal,
> activer les écritures, fusionner `main` ou déployer Vercel
> sans autorisation spécifique.**
