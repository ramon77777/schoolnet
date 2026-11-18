# SCHOOLNET — Lot 5D-G : audit RLS réel, chemins directs et préparation de la passerelle Admin

**Date :** 18 novembre 2026  
**Statut :** [GitHub Actions #44342623526](https://github.com/ramon77777/schoolnet/actions/runs/44342623526) : **6 jobs SUCCESS** sur la branche.  
**Recette locale utilisateur :** **G à effectuer (20 tests attendus)** ; Lots A à F : **85/85 déjà validés**.  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15) **brouillon**.  
**Protection :** aucune écriture dans Supabase principal ; aucune migration, aucune Edge Function ni API réellement déployée, aucun changement sur `main` ou Vercel production.

## 1. Méthode et preuve

Le schéma principal `schoolnet_2.0` a été examiné **exclusivement en SELECT** :
`pg_catalog.pg_class`, `pg_catalog.pg_trigger`, `pg_catalog.pg_constraint`,
`pg_catalog.pg_policies`, `information_schema.columns` et
`has_table_privilege`. Les contrôles ne consultent **aucune fiche nominative**.
Les fonctions historiquement auditées au Lot F restent installées sans modification.

Les scripts de reprise sont consignés dans
[`supabase/verification/20261118_schoolnet_lot5dg_catalog_SELECT_ONLY.sql`](../../supabase/verification/20261118_schoolnet_lot5dg_catalog_SELECT_ONLY.sql).

### Matrice de droits réellement observée

Les droits ci-dessous sont les **privilèges de table** : une permission `GRANT`
ne garantit **pas** qu'une ligne soit modifiable, car les politiques RLS
restent appliquées et d'autres triggers peuvent refuser l'opération.

| Table | Privilèges `authenticated` observés | RLS / conséquence |
| --- | --- | --- |
| `school_years` | SELECT, INSERT, UPDATE, DELETE | RLS Admin global sur les modifications. **Aucun garde 5D de bascule installé** ; une écriture directe autorisée reste un risque. |
| `class_students` | SELECT, INSERT, UPDATE, DELETE | RLS Admin global ; l'ancienne affectation n'est pas gelée par 5D-E tant que le SQL n'a pas été installé. |
| `student_enrollments` | Aucun privilège de table observé pour `authenticated` | Des politiques RLS existent mais les écritures se font via les RPC `SECURITY DEFINER` ; ne pas interpréter la policy comme un GRANT. |
| `student_enrollment_documents` | SELECT, INSERT, DELETE ; **pas UPDATE** | RLS Admin avec condition de preuve Storage à l'insertion. Le garde d'archive doit protéger ces opérations et l'objet Storage. |
| `report_cards` | SELECT, INSERT, UPDATE, DELETE | RLS Admin ; les bulletins et l'historique doivent être protégés indépendamment du cycle annuel. |
| `parent_links` | SELECT, INSERT, UPDATE, DELETE | RLS Admin pour les écritures, lecture Parent/Élève. La relation familiale doit subsister entre années. |
| `public_enrollment_request_resolutions` | SELECT seulement | La finalisation passe par une RPC vérifiant l'Admin et les liens, encore à revoir avec une bascule concurrente. |

**Nuance importante :** des `GRANT` de table existent également pour
`anon` sur `school_years`, `class_students`, `report_cards`,
mais **leurs politiques RLS de modification ciblent `authenticated`**
et contrôlent l'Admin. Aucun constat de modification anonyme effective
n'a été fait ; la CI reproduit explicitement l'isolation RLS.
Ne pas supprimer des grants sans étude des appels et contraintes existants.

Les tables auditables ont RLS activé. Les déclencheurs réels
`school_years` ne comprennent actuellement que `set_updated_at`,
pas les trois triggers 5D-A+B. Pour `student_enrollment_documents`,
les colonnes et contraintes documentaires ont été vérifiées ;
leur clé `enrollment_id` référence `student_enrollments`
avec `ON DELETE RESTRICT`.

## 2. Chemins directs et implications métier

La lecture de la branche SCHOOLNET confirme :

- `src/features/admin/pages/AdminSchoolYears.tsx` utilise encore
  `school_years.insert()` pour créer une année **non active**
  et `.delete()` pour supprimer une année autorisée, avec une
  activation directe **désactivée dans l'interface**.
  **Ne pas révoquer tous les droits Admin**, ce qui casserait
  ces actions légitimes ; protéger spécifiquement `is_current`.
- `src/features/admin/pages/AdminClasses.tsx` utilise les RPC
  `admin_assign_student_to_class` et
  `admin_remove_student_from_class`. Des clients Admin peuvent
  néanmoins disposer de privilèges DML directs sur `class_students`.
- `src/features/enrollments/lib/adminEnrollmentsApi.ts`
  utilise les RPC `admin_upsert_student_enrollment_with_gender`
  et `admin_set_student_enrollment_status` : elles restent réelles
  et non corrigées tant que le candidat F n'est pas installé.
- `src/features/parent/lib/parentChildViews.ts` déduit encore
  la **dernière classe connue** de `class_students.created_at`.
  Ce n'est pas une preuve de classe **active dans l'année courante**.
  Aucune suppression des anciens liens `parent_links` ne doit servir
  à résoudre ce problème d'affichage.
- `admin_finalize_public_enrollment_request` peut rattacher
  une demande publique à un dossier existant, sans verrou annuel
  explicite. Sa cohérence pendant une bascule reste à prouver.

### Risque supplémentaire : Storage et justificatifs scolaires

**Blocage de production découvert au 5D-G.** La page
`src/features/enrollments/components/AdminEnrollmentDocuments.tsx`
effectue actuellement `supabase.storage.remove()` **avant**
`student_enrollment_documents.delete()`.

Les politiques réelles du bucket
`student-enrollment-documents` autorisent la suppression Storage
par l'Admin sous leurs conditions, sans test explicite d'année clôturée.
Le candidat de protection SQL G pourrait donc refuser la suppression
de la **métadonnée** alors que le **fichier a déjà disparu du stockage**.
Cela peut créer une archive scolaire incohérente.

**Ne pas installer le garde G seul, ni activer le cycle annuel avant :**
une protection Storage RLS à réviser, une procédure de suppression
cohérente côté serveur/UI, des tests de stockage effectivement isolés
et une stratégie de reprise en cas d'échec. La sécurisation du fichier
et de la métadonnée est **un même invariant métier**.

## 3. Livrables exclusivement isolés

### Protection documentaire complémentaire

[`supabase/proposals/20261118_schoolnet_lot5dg_archive_documents_SANDBOX_ONLY.sql`](../../supabase/proposals/20261118_schoolnet_lot5dg_archive_documents_SANDBOX_ONLY.sql)

Proposition de trigger privé `schoolnet_private.guard_lot5dg_closed_document`
qui acquiert un verrou `school_years IN SHARE MODE` avant lecture de
l'archive et bloque les créations, modifications et suppressions de
**métadonnées** attachées à une année source déjà finalisée.
Les pièces de la nouvelle année restent possibles. Le trigger
est `SECURITY DEFINER` avec `search_path=pg_catalog`,
et son `EXECUTE` est révoqué pour les rôles API.

**Ce candidat ne protège pas encore l'objet du bucket Storage.**
Il est **non installable indépendamment** ; il exige une migration
canonique consolidée et la sécurisation Storage.

### Banc PostgreSQL 17 proche de certains aspects réels

La CI charge uniquement une base `schoolnet_lot5d_ci` sur
`127.0.0.1`, puis les propositions sandbox 5D-A+B et 5D-E et le
garde documentaire G. Elle ajoute une fixture dont les colonnes
documentaires, droits de table et politiques Admin essentiels
correspondent au schéma audité.

**Limite explicite de fidélité :** la fixture ne reproduit pas
tout le schéma, tous les triggers, l'intégralité des politiques,
les fonctions Auth, ni le service Storage. La FK
`uploaded_by` y pointe vers `public.profiles` au lieu de
`auth.users` réel. Ce n'est ni un dump de production ni
une validation complète du passage annuel réel.

Le job `lot5d_direct_paths` vérifie :
- Avant clôture : six assertions, rôle Admin autorisé à créer/supprimer
  une année **inactive**, changement direct de `is_current` refusé,
  maintenance ancienne classe avant clôture possible, dépôt/suppression
  de métadonnées documentaires possible, accès anonyme refusé via RLS ;
  `ROLLBACK` final.
- Après décision puis finalisation **fictives** : huit assertions
  (et vérification complémentaire de statut) : dossier et pièce
  historiques conservés, suppression et nouvelle pièce de l'ancienne
  année rejetées, modification même par un client privilégié rejetée,
  nouveaux justificatifs de la cible acceptés, lien de classe historique
  figé, bascule directe refusée ; `ROLLBACK` pour ces essais.
- Aucune donnée utilisateur, aucun secret, aucune fonction réseau,
  aucun déploiement.

### Passerelle Admin : contrôle hors réseau, non déployé

[`scripts/lot5d/5dg_admin_gateway_reference.mjs`](../../scripts/lot5d/5dg_admin_gateway_reference.mjs)

Contrat JavaScript **avec adaptateurs mock uniquement**,
sans `fetch`, client Supabase, HTTP, route Vercel ou fonction Edge :

1. Activation possible seulement en fixture locale `.invalid`.
2. Origine exacte, `POST`, `application/json`, Bearer obligatoire.
3. Vérification Auth **simulée** puis contrôle de session active/non révoquée
   **simulé**, sans se fier à un rôle fourni par le navigateur.
4. Profil `admin` global issu de la base **simulée** ;
   refus `school_admin`, Enseignant, Parent et Apprenant.
5. Limitation de fréquence obligatoirement confirmée par l'adaptateur.
6. Préflight serveur **simulé** : année source courante,
   année cible non peuplée, historiques intègres et décisions complètes.
7. Mapping fixe des fonctions `schoolnet_private`, acteur serveur vérifié,
   opération et confirmation contrôlées ; succès seulement si
   transaction **et audit** confirmés.
8. Réponses minimales, erreurs masquées, refus par défaut.

La recette Node `npm run qa:lot5d:g` contient **20 tests**
et a réussi en CI. **Aucune authentification réelle, vérification
des sessions Supabase ou connexion PG n'a été implémentée.**

### Résultats de la CI

[Run #44342623526](https://github.com/ramon77777/schoolnet/actions/runs/44342623526) :
**6/6 jobs SUCCESS**, dont les anciens jobs A–F, le job PG17 G
et les tests G **20/20** intégrés au job de qualité.
L'introduction du nouveau banc avait révélé deux erreurs **uniquement
dans la fixture de test** : un délimiteur SQL invalide puis l'absence
du privilège SELECT `profiles` dans le modèle RLS.
Ces erreurs ont été corrigées sur la branche ; le run ci-dessus
est celui de la version corrigée. Aucune intervention sur Supabase réel.

## 4. Réserves et futur GO à obtenir

1. **Dossier cible déjà occupé :** 2026–2027 a déjà une inscription
   active d'un élève différent de l'actif 2025–2026. Toujours **bloquant** ;
   décision métier préalable requise.
2. **Archivage Storage** : réviser les politiques et l'ordre
   Storage/métadonnées, et tester sur un bucket sandbox isolé.
3. **Fonctions et écritures** : vérifier les chemins RLS directs,
   les RPC de demandes publiques, les privilèges des comptes
   de service et la compatibilité avec les migrations réellement appliquées.
4. **Lecture Parent/Enseignant** : construire une notion explicite
   de classe de **l'année courante** fondée sur les dossiers validés
   tout en affichant séparément les anciennes classes.
5. **Passerelle privée réelle** : choisir le runtime, utiliser
   une Auth JWT vérifiée côté serveur (`auth:'user'` d'Edge Functions
   ou `getUser` vérifié), revalider la session et le rôle global Admin,
   définir un rôle SQL dédié aux privilèges minimaux, la limitation
   des appels, le journal atomique et une erreur non sensible.
6. **Idempotence et sécurité** : conserver l'identité de l'acteur
   et l'`operation_id` exclusivement de sources vérifiées,
   sans déléguer au navigateur une autorité SQL. Éviter toute
   clé de service dans `VITE_*` ou dans le navigateur.
7. **Recette fidèle et release** : comparer contraintes,
   schémas, RLS, triggers, Storage et RPC complètes sur une
   **copie isolée du réel**, puis obtenir des accords distincts
   pour la future migration canonique, l'installation Supabase,
   la fusion `main` et la publication Vercel.

**Références Supabase actuelles vérifiées :**
[Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
et [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 5. Recette locale du Lot 5D-G — À FAIRE

Dans PowerShell, sur la branche existante, sans toucher au SQL principal :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:g
npm run lint
npm run build
git status --short
```

**Attendu :** 20/20 tests G locaux ; lint zéro erreur avec
l'avertissement React Hook préexistant ; build Vite réussi.
Aucun `supabase db push`, aucun SQL Editor,
aucune suppression de fichiers non suivis, aucun merge ni déploiement.
La réussite locale porterait le cumul A–G à **105/105**,
sans compter les assertions SQL exécutées **séparément** en CI.

**Interdictions maintenues :** le SQL `SANDBOX_ONLY` n'est pas une
migration de production ; aucune activation de bascule annuelle,
aucun nettoyage automatique de l'année cible, aucune modification
Supabase principal, `main` ou Vercel sans nouveaux GO.
