# SCHOOLNET V2 — S4-B.3-B.1 · Consultation sécurisée des évaluations officielles

**Date :** 20 novembre 2026  
**Branche isolée :** `feature/schoolnet-s4b3b1-official-assessment-preview-20261120`  
**Base :** `main` au commit `b845c3326d7a696b4a945e6b77aa09f4198bdde4`  
**État :** développement et tests CI sur GitHub uniquement. **Aucune activation sur Supabase principal ni fusion de code autorisée.**

## 1. Objectif et périmètre

L'élève officiellement affecté à une classe ouvre l'évaluation publiée de
son cours officiel depuis le bouton **« Voir l'évaluation »**. Cette étape
affiche le titre, les consignes, l'échéance, la durée, le barème maximal et
les questions avec leurs choix possibles. Les réponses attendues, les
corrections, les notes, les copies et les identités d'autres utilisateurs
ne sont jamais transmises.

**Pas de « Commencer », pas de réponse, pas d'enregistrement, pas de remise,
pas de correction, pas de notification supplémentaire.** Les moteurs V1
Quiz, Devoirs, Examens, les tableaux enseignants et les parents restent
inchangés.

Un examen/devoir utilisant un sujet fichier peut afficher seulement le
**nom du fichier**, sans transmettre l'URL. Le téléchargement privé et
les remises de fichiers nécessitent S4-B.3-B.3.

## 2. Architecture SQL

Proposition non installée :
`supabase/proposals/s4b3b1_student_official_assessment_preview.sql`.

- `public.schoolnet_student_school_assessment_preview(p_course_id,p_assessment_id)` :
  RPC exposée, **SECURITY INVOKER**, exécution réservée à `authenticated`.
- `schoolnet_private.student_school_assessment_preview(p_course_id,p_assessment_id)` :
  SQL **SECURITY DEFINER**, `search_path=pg_catalog`, aucun accès direct pour
  `anon`. L'appel requiert `auth.uid()`, le rôle réel `student`, la
  vérification `student_school_course_access(p_course_id)` et une évaluation
  publiée avec un rattachement officiel et une liaison de cours actifs.
- Le contrôle des classes, de l'établissement, de l'affectation enseignant,
  de l'affectation élève et de l'année scolaire réutilise **la fonction
  S4-B.2 déjà en production**, sans créer d'inscription `course_enrollments`.
- Le contenu est projeté avec `jsonb_build_object` et les seuls champs
  explicitement autorisés. Les choix renvoient `id`, `text`,
  `orderIndex` ; **jamais `is_correct`**.
- Le verrou B.0 reste actif sur les tables V1 et empêche toute lecture
  directe des questions/copies officielles hors de cette RPC.
- Toutes les erreurs de droits et d'évaluations retirées utilisent un refus
  uniforme `42501`, sans divulguer l'existence d'un objet inaccessible.

**Point pédagogique à valider :** dès qu'une évaluation est publiée et
rattachée, ses questions sont consultables par les élèves autorisés,
même si la remise B.2 n'est pas encore activée. Une politique de
« question visible seulement à l'ouverture de l'examen » constitue une
évolution distincte si elle est souhaitée.

## 3. Contrat du frontend

- Nouvelle route : `/app/student/school-courses/:courseId/assessments/:assessmentId`
  **à l'intérieur du RoleGate étudiant**.
- Nouveau composant :
  `src/features/student/pages/StudentSchoolAssessmentPreview.tsx`.
- Nouveau modèle de données :
  `src/features/student/lib/studentSchoolAssessmentPreviewModel.ts`,
  validation **exacte** des champs et types, y compris au niveau des choix.
- Nouvelle API :
  `src/features/student/lib/studentSchoolAssessmentPreviewApi.ts`,
  un unique `supabase.rpc` et aucune lecture directe des tables V1.
- Le catalogue officiel existant ajoute le lien « Voir l'évaluation »
  vers cette route V2, jamais vers `/app/student/assessments/:id`.
- La page fonctionne sur mobile, conserve un retour au cours, propose
  « Actualiser » et masque les données d'un compte précédent si la session
  ou l'URL change. Tout le contenu est affiché **en texte React échappé**.
- Si le SQL n'est pas encore installé, un message explicite indique
  l'activation en attente. Il n'y a pas de repli vers un chemin V1.

## 4. Tests

`npm run qa:s4b3b1` vérifie le contrat TypeScript à l'exécution, refuse
les champs inconnus tels que `isCorrect`, `score`, `correctAnswer`
et les identifiants incohérents, et vérifie le câblage du parcours.

La CI `.github/workflows/schoolnet-s4b3b1-preview-ci.yml`
reconstruit **une base Supabase locale jetable** et applique les SQL V2
prérequis ainsi que B.0 et B.1 **uniquement sur cette base**. Elle teste
les identités synthétiques :
- élève A autorisé dans son cours A ;
- élève B autorisé dans son cours B mais refusé dans A, même avec une
  inscription V1 fictive ;
- enseignant A, parent et élève non affecté refusés ;
- évaluations brouillon, non rattachée, mauvais cours, dépubliée et
  lien révoqué refusés ;
- refus de toute fuite de `isCorrect`, note, copie ou réponse attendue ;
- absence de soumission, progression ou inscription créée par la consultation ;
- rollback local retirant uniquement les deux fonctions B.1.

Le lint, le build et les tests de non-régression S4-B.1/B.2/B.3-A/B.3-N
et B.0 sont également exécutés.

Rollback **à réserver à une autorisation distincte** :
`supabase/verification/s4b3b1_student_official_assessment_preview_rollback_manual.sql`.

## 5. Portes de validation

- **GO développement GitHub branche isolée :** accordé.
- **GO migration SQL B.1 sur Supabase principal : NON accordé.**
- **GO publication GitHub `main` et Vercel production : NON accordé.**
- **GO exécution/remise réelle par un élève : NON accordé ; reste B.2.**

Aucun fichier `supabase/migrations/*.sql` n'est créé pour B.1 avant
l'autorisation de déployer la migration. Si ce SQL est ensuite autorisé
et installé, son fichier de traçabilité devra être **identique à la source
SQL réellement exécutée**, sans réapplication.
