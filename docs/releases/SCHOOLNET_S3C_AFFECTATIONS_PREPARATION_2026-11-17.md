# SCHOOLNET 2.0 — S3-C | Affectations scolaires par établissement

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
