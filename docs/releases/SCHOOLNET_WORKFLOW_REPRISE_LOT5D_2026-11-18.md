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

### 5D-F : **RPC HISTORIQUES COMPLÈTES + CONCURRENCE SQL + ARCHITECTURE ADMIN — CI VALIDÉE, LOCAL À FAIRE**

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

**Recette locale F NON ENCORE VALIDÉE :** exécuter
`git pull --ff-only`, `npm run qa:lot5d:f`, `npm run lint`,
`npm run build`. Les recettes locales précédentes A+B+C+D+E restent
**73/73 validées**. Préserver le stash, les scripts non suivis et
`tsconfig.app.tsbuildinfo`.

**Risques encore bloquants :** dossier déjà actif en année cible 2026–2027,
RPC directe de changement d'année encore non neutralisée côté réel,
écritures directes RLS, `admin_finalize_public_enrollment_request`,
affichage des dernières classes historiques côté Parent/Enseignant,
test sur schéma réellement fidèle et passerelle serveur encore inexistante.

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

### Prochain test local — Lot 5D-F

Les cinq jobs CI du 5D-F sont verts sur GitHub ; la **recette locale
de l'utilisateur reste à faire**. Terminal PowerShell :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:f
npm run lint
npm run build
git status --short
```

Attendu : **12/12 tests F**, zéro erreur ESLint (un avertissement
React Hook historique possible), build réussi, aucun fichier local
non suivi effacé. Le SQL F reste non installable.

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
   tests locaux F à confirmer, choix de la passerelle Admin et
   vérification des chemins non couverts (RLS direct et demandes publiques).
6. Soumettre une future migration finale et son éventuelle installation
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
>
> Branche `feature/schoolnet-lot5d-a-securisation-20261118`,
> PR #15 **brouillon**, `main` et Vercel existant inchangés.
> **Recette locale A9/9, B17/17, C12/12, D15/15 validée : 53/53 ;
> recette locale E **20/20 VALIDÉE** : **73/73 tests locaux A à E**.**
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
> **Prochaine action immédiate** : recette locale `qa:lot5d:f`
> **12/12 attendus**, lint et build ; la CI F a déjà **5/5 jobs SUCCESS**.
> **Après GO distinct** : vérifier une copie fidèle du schéma réel,
> corriger les parcours directs et écrans Parent/Enseignant,
> concevoir la passerelle Admin authentifiée, puis seulement
> étudier la migration canonique. **Rien à installer encore.**
> **Ne pas toucher aux dossiers réels, SQL Editor principal,
> `supabase db push`, flag d'écriture, `main` ou Vercel
> sans autorisation spécifique.**
