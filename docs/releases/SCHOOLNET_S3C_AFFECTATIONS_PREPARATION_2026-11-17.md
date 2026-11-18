# SCHOOLNET 2.0 — S3-C | Affectations scolaires par établissement

## ACTUALISATION OFFICIELLE — S3-C INSTALLE LE 18 NOVEMBRE 2026

Cette section décrit **l'état actuel**. Les mentions « NON installé » dans
l'historique de préparation conservé plus bas ne sont plus d'actualité.

- **Projet :** Supabase principal `schoolnet_2.0` (ACTIVE_HEALTHY).
- **Version appliquée :**
  `20261118083254_schoolnet_s3c_class_assignments`, enregistrée
  **une seule fois** dans `supabase_migrations.schema_migrations`.
- **Migration canonique :**
  `supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql`.
  Ce fichier versionne la proposition déjà appliquée :
  **ne pas la rejouer** sur la base principale et ne pas utiliser
  `supabase db push`.
- **Périmètre installé :** 3 tables isolées
  (`schoolnet_school_student_class_assignments`,
  `schoolnet_school_teacher_subject_assignments`,
  `schoolnet_school_assignment_events`) ; 5 façades publiques
  `SECURITY INVOKER` ; helpers privés de contrôle d'accès,
  triggers de validation des affiliations et actions de journalisation.
- **Droits confirmés après installation :** RLS active sur les 3 tables ;
  aucune table accessible directement en SELECT/INSERT par
  `authenticated` ; aucune des 5 RPC exécutable par `anon` ;
  accès RPC `authenticated` soumis aux contrôles serveur
  (`auth.uid()`, rôle `school_admin`, établissement actif).
- **Recette SQL post-installation :** PASS avec
  `BEGIN … ROLLBACK`, script
  `supabase/verification/20261117_s3c_class_assignments_rollback.sql`.
  Les scénarios école A/B, identité, matières, unicité par année,
  révocation/réactivation, changement de classe, Preview/Origin,
  suspension d'affiliation, administrateur révoqué, permissions
  directes et journal des 11 mouvements ont réussi.
- **Contrôle après ROLLBACK :** toujours 0 classe officielle,
  0 affectation officielle élève, 0 affectation officielle enseignant,
  0 mouvement en journal S3-C, 1 seule affiliation administrative,
  2 classes legacy, 2 `class_students`, 2 `class_teachers`,
  2 `student_enrollments` et 5 événements d'audit historiques.
  Aucune donnée test n'a été conservée.
- **Conseillers de sécurité Supabase :** relevé après migration ;
  les 3 nouveaux avis INFO `rls_enabled_no_policy` correspondent
  volontairement aux 3 nouvelles tables sans politiques directes :
  RLS activée, droits SQL directs retirés et lecture/écriture par RPC
  privées uniquement. Les autres catégories d'avis existaient déjà
  avant l'installation ; elles seront suivies dans une phase d'audit.
- **Validation locale avant installation :** capture de la page S3-C,
  15/15 tests `npm run qa:s3c`, et compilation précédemment réussie.
- **Validation locale après installation : à réaliser.** Page, tableau
  de bord et test n°14 mis à jour pour la migration réelle ; nouveau
  contrôle sur Windows nécessaire avant clôture finale de la recette UI.
- **Sauvegardes :** aucune sauvegarde intégrale récente ni
  restauration complète ne peut être attestée via les accès disponibles.
  La sauvegarde applicative antérieure conservée sur le PC utilisateur
  ne constitue pas une sauvegarde de reprise actuelle. La migration
  additive s'est déroulée transactionnellement, avec recette réversible,
  sans remplacer un PRA.
- **GitHub :** PR #14 maintenue ouverte en brouillon ; aucun merge,
  aucune promotion Vercel Production lancée. Des déploiements Preview
  automatiques peuvent exister, sans autoriser les mutations locales.

### Reprise Windows — vérification post-installation S3-C

```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s3c
npm run lint
npm run build
npm run dev
```

Ouvrir `http://localhost:5173/app/school/assignments` en tant
qu'administrateur d'établissement. Attendu : menu **Affectations**,
école `SCH-000001`, bandeau bleu lecture seule ; **disparition du
bandeau jaune « Activation du module en attente »** et catalogue
chargé (0 classe officielle actuellement). Les écritures restent
bloquées sur localhost / Previews Vercel.

Les mutations réelles doivent être testées sur le domaine officiel
uniquement après publication autorisée, sans dégrader les données
historiques. Aucune affectation ne se crée automatiquement par l'installation.

---

## HISTORIQUE DE PRÉPARATION S3-C — 17 NOVEMBRE 2026

**Date : 17 novembre 2026**  
**Statut : GitHub (code React + proposition SQL + recette transactionnelle).**
**S3-C NON installé définitivement sur Supabase, aucune publication Vercel Production, PR n°14 toujours draft.**

## 1. Fondations et audit

Les briques S2-A/S2-B/S3-A/S3-B sont déjà installées et leurs recettes locales
validées. Le relevé Supabase avant S3-C est le suivant :

| Donnée | Effectif |
|---|---:|
| Établissements actifs | 2 |
| Classes officielles (`learning_context='school'`) | 0 |
| Affiliations enseignants locales actives | 0 |
| Affiliations élèves locales actives | 0 |
| Classes legacy | 2 |
| Lignes `class_students` legacy | 2 |
| Lignes `class_teachers` legacy | 2 |
| Inscriptions `student_enrollments` legacy | 2 |
| Matières `academic_subjects` actives | 1 |
| Années scolaires en catalogue | 3 |
| Événements d'audit | 5 |

**Point d'attention :** l'année marquée `is_current` est 2025-2026
dans l'état actuel de la base, même si une année 2026-2027 est présente.
S3-C utilise systématiquement l'`school_year_id` de la classe officielle
choisie, et ne présume PAS que `is_current` est correct. La correction
éventuelle du calendrier fera l'objet d'une décision distincte.

## 2. Décision d'architecture S3-C

Nous ne réutilisons **pas** les tables `class_students`, `class_teachers`,
`student_enrollments`, `class_subject_settings` ni les rattachements de cours.
Ces données servent des modules historiques non encore entièrement isolés
par établissement. Il ne faut ni modifier leur RLS ni migrer implicitement
leurs enregistrements.

La proposition introduit TROIS nouvelles tables isolées :

1. `public.schoolnet_school_student_class_assignments` : école, classe
   officielle, année, élève affilié, état actif/révoqué et opérateur.
   Un seul rattachement de classe **actif** par élève, école et année.
   La même personne peut être affectée dans deux écoles distinctes.
   Une affectation révoquée se **réactive**, elle ne se recrée pas.
2. `public.schoolnet_school_teacher_subject_assignments` : école, classe
   officielle, année, enseignant affilié, matière du catalogue académique,
   état et opérateur. Plusieurs enseignants peuvent intervenir dans
   une même matière mais un couple exact classe/enseignant/matière
   ne peut être enregistré deux fois.
3. `public.schoolnet_school_assignment_events` : journal privé append-only
   des mouvements (création, révocation, réactivation), avec classe,
   année, utilisateur concerné, matière éventuelle et auteur. Aucun e-mail
   technique, aucune donnée familiale ou bulletin stocké.

Les nouvelles tables ont RLS activée et **aucun accès direct**
`anon` ou `authenticated`. Les cinq RPCs publiques `SECURITY INVOKER`
appellent des helpers `schoolnet_private` à recherche de schémas fixe.
Chaque opération vérifie `auth.uid()`, le rôle local `school_admin`,
l'affiliation active de l'admin et l'école cible. Pour écrire, le domaine
officiel exact est vérifié côté serveur **en complément**, jamais
comme preuve d'authentification.

Les triggers internes imposent classe officielle, école/année cohérentes
et rôle/affiliation du membre actifs lors de l'ajout ou réactivation.
Une affiliation révoquée rend l'affectation **effectivement suspendue**
dans la lecture ; cela ne supprime pas l'historique et ne modifie pas
les cours/notes.

## 3. Fonctionnalités React préparées

La route `/app/school/assignments`, sous le rôle `school_admin`,
contient :

- Sélecteur d'établissement actif et de classe officielle avec niveau
  et année scolaire clairement affichés.
- Affectation des seuls élèves affiliés actifs à cette école ;
  évite dans le formulaire les doublons et les élèves déjà actifs
  dans une autre classe de la même année scolaire.
- Affectation d'un enseignant affilié actif à une matière active.
- Consultation des affectations actives/révoquées/suspendues,
  révocation et réactivation contrôlées par confirmation.
- Journal de mouvements de la classe, limité aux 100 derniers
  événements de l'établissement pour préserver les performances.
- Messages d'aide quand aucune classe, aucun élève, aucun enseignant
  ou aucune matière n'est encore disponible.
- Bandeau bleu `Prévisualisation SCHOOLNET — lecture seule` pour
  localhost/Preview et bandeau ambre
  `S3-C — Activation du module en attente` tant que le SQL est absent.
- Aucune possibilité de modifier les données pédagogiques historiques.

Fichiers :
- `src/features/schools/pages/LocalSchoolAssignments.tsx`
- `src/features/schools/lib/schoolAssignmentsApi.ts`
- `src/features/schools/lib/schoolAssignmentWritePolicy.ts`
- `src/routes/router.tsx`
- `src/layouts/DashboardLayout.tsx`
- `src/features/schools/pages/LocalSchoolDashboard.tsx`

## 4. SQL et tests sous ROLLBACK

**Proposition SQL :**
`supabase/proposals/s3c_school_class_assignments.sql`

**Vérification transactionnelle :**
`supabase/verification/20261117_s3c_class_assignments_rollback.sql`

Les deux scripts ont été exécutés ensemble avec
`BEGIN; ... ROLLBACK;` sur le Supabase principal **sans migration persistante**.

**Résultat PASS :**
`S3C_ASSIGNMENTS_ROLES_TENANT_YEAR_SUBJECT_PREVIEW_HISTORY_ROLLBACK_PASS`.

Cas contrôlés : création de classes officielles temporaires dans deux
écoles, affiliations temporaires des profils élèves/enseignants existants,
accès hors école interdit, consultation limitée, statut admin révoqué,
doublons de classe/enseignant-matière, une classe active par
élève/école/année, même élève dans deux écoles différentes, transfert
contrôlé de classe, rattachement erroné d'un rôle, Origin absente,
Preview et sous-domaine usurpé, historique des 11 changements et
révocation d'une affiliation élève.

**Contrôle après ROLLBACK :** 0 classe officielle, 1 membership total,
2 classes legacy, 2 `class_students`, 2 `class_teachers`, 2 inscriptions
legacy et 5 audits inchangés. Les trois nouvelles tables S3-C ainsi que
les RPCs S3-C sont ABSENTES de la base principale.

## 5. Tests frontend, CI et étapes suivantes

`scripts/test-schoolnet-s3c-preview-guard.mjs` contient
**15 tests automatiques** de non-régression (politiques Preview,
route/rôle, validations RPC, isolation, matières, année, audit, ancien
périmètre et journal privé). Commande : `npm run qa:s3c`.

La GitHub Action de la branche exécute S2-B, S3-A, S3-B, S3-C,
ESLint et TypeScript/Vite, sans installer Supabase ni déployer
manuellement en production. Les tests S3-C **doivent encore être
confirmés sur le poste Windows** ; une erreur CI Vercel de limite
de fréquence ne vaut pas verdict de compilation.

### Prochaine recette locale

```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s3c
npm run lint
npm run build
npm run dev
```

Ouvrir `http://localhost:5173/app/school/assignments` avec le compte
administrateur local. Attendu : menu **Affectations** visible,
école autorisée, bandeaux bleu (lecture seule) et ambre
(activation S3-C en attente), aucune classe officielle, aucune
mutation possible. Ne pas ajouter de données réelles pendant le test.

**Ne pas** placer la proposition dans `supabase/migrations` ni lancer
`supabase db push`. Ne pas supprimer les fichiers locaux non suivis
ou `supabase/proposals/staged/`. Aucun merge de la PR #14, aucune
publication/promotion Vercel Production sans autorisation explicite.

Après capture et validation locale : audit et sauvegarde de sécurité
adaptés, puis demande d'autorisation distincte avant toute installation
permanente S3-C.
