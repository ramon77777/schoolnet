# SCHOOLNET V2 — S4-B.3-B.3 : suivi et corrections des évaluations officielles

> **Point de situation — 24 novembre 2026**
>
> **Supabase principal :** les migrations B.3 `20261123125725` (`schoolnet_s4b3b3_official_teacher_grading`) et B.3-N `20261123143017` (`schoolnet_s4b3b3n_official_teacher_submission_notifications`) sont installées et vérifiées. Leurs SQL correspondent exactement à `supabase/proposals/s4b3b3_official_teacher_grading.sql` et `supabase/proposals/s4b3b3n_official_teacher_submission_notifications.sql`, respectivement.
>
> **Autorisation actuelle :** l’utilisateur a autorisé la fusion dans `main` et la publication sur le site officiel SCHOOLNET. L’intégration cumulative des PR #27 à #30 est suivie dans la [PR #30](https://github.com/ramon77777/schoolnet/pull/30). L’achèvement du déploiement reste à constater.
>
> Les mentions antérieures « non installé », « non autorisé » ou équivalentes ci-dessous décrivent l’étape de préparation ; elles sont conservées comme historique.

**Date de préparation :** 23 novembre 2026  
**Branche :** `feature/schoolnet-s4b3b3-official-teacher-corrections-20261123`  
**Base :** PR n°27 (S4-B.3-B.2) — non fusionnée dans `main`.  
**État :** conception / développement GitHub ; test PostgreSQL CI et validation Windows à effectuer avant installation et publication.

**AUCUNE migration B.3 n'est appliquée sur Supabase principal à ce stade.**
Le SQL S4-B.3-B.2 y est déjà installé et la copie de test a été
soumise une fois avec la réponse `48`. Cette copie ne sera ni notée ni
publiée par nos tests automatisés : les tests SQL utilisent exclusivement
une base PostgreSQL locale éphémère dans GitHub Actions.

## Fonctionnalités

1. Enseignant propriétaire du cours officiel : accès à une page
   `/app/teacher/assessments/:id/official-corrections`.
2. Suivi de la classe : effectif, non commencées, en cours, remises,
   corrigées et publiées ; liste limitée aux 250 copies récentes.
3. Copie en cours : **statut visible sans réponses**. Après remise,
   questions, réponses et éventuels bons choix sont consultables
   uniquement par le professeur habilité.
4. Correction **manuelle**, sans auto-correction, par note globale sur
   le barème maximal et appréciation non vide (max. 4 000 caractères).
   Une note reste confidentielle à l'étape `graded`.
5. Publication distincte : demande de confirmation, passage atomique à
   `published`, interdiction de modifier/publier une deuxième fois,
   notification unique de l'élève vers sa route scolaire officielle.
6. Résultat élève affiché **après publication seulement** sur son écran
   de remise. Aucun résultat n'est exposé via la RPC tant que le statut
   est `submitted` ou `graded`.
7. Correctif d'interface : après remise, le chronomètre indique
   « Évaluation terminée » au lieu de continuer à décompter.

## Sécurité, isolation et compatibilité

- Établissement A/B : vérification du rôle réel `teacher`, de
  `auth.uid()`, de la propriété du cours et de l'évaluation, de
  l'affectation active à la matière/classe/année, de l'adhésion active
  à l'établissement, des liens scolaires `active`, et de l'appartenance
  actuelle des élèves à cette classe.
- Réponses non remises jamais lisibles depuis la RPC de correction.
- `schoolnet_teacher_official_copies`,
  `schoolnet_teacher_official_grade` et
  `schoolnet_student_official_published_result` : proxys publics
  `SECURITY INVOKER` exécutables uniquement par `authenticated`,
  fonctions privées `SECURITY DEFINER` avec `search_path=pg_catalog`
  et droits vérifiés en base.
- Aucun accès direct frontend aux tables `assessment_submissions`,
  `submission_answers`, `quiz_choices` ou `submission_question_grades`
  depuis la nouvelle page : les 8 politiques restrictives RLS B.0
  restent actives.
- Le déclencheur historique V1
  `notify_assessment_correction_published` est conservé pour les
  évaluations non officielles et ne s'exécute pas pour les évaluations
  rattachées : les anciennes routes élève/parent ne doivent pas être
  proposées dans le nouveau parcours.
- Publication : une seule notification
  `school:assessment:result:published` par élève/copie, avec
  `action_url` pointant sur le cours officiel ; la contrainte unique
  `(user_id,event_key,related_id)` interdit les doublons.
- Le parent et les évaluations nécessitant un dépôt de fichier
  restent hors périmètre B.3.
- Correction détaillée question par question et calcul automatique :
  **non inclus** dans cette première version ; l'enseignant attribue
  manuellement une note globale et écrit une appréciation.

## Fichiers

- SQL **proposition uniquement** :
  `supabase/proposals/s4b3b3_official_teacher_grading.sql`
- Rollback **manuel** :
  `supabase/verification/s4b3b3_official_teacher_grading_rollback_manual.sql`
- Frontend : `TeacherOfficialCorrections.tsx`,
  `officialTeacherGradingModel.ts`, `officialTeacherGradingApi.ts`,
  `StudentSchoolAssessmentTake.tsx`, `TeacherAssessmentDetail.tsx`,
  `router.tsx`.
- QA locale :
  `npm run qa:s4b3b3` puis
  `npm run qa:s4b3b2`, `npm run qa:s4b3b1:richtext`,
  `npm run lint`, `npm run build`.
- GitHub Actions : `schoolnet-s4b3b3-grading-ci.yml`
  avec PostgreSQL éphémère A/B, contrôle confidentialité,
  score, publication, notification et rollback.

## Suite après CI

Synchroniser le Worktree existant `D:\Bakary\10 autres\schoolnet-tests`
sur la branche B.3 ; tests Windows sans Docker ; autorisation
distincte nécessaire **avant toute installation du SQL B.3 sur Supabase
principal** et avant la fusion dans `main` / publication Vercel.

La copie de test officielle déjà remise ne doit pas être retouchée
automatiquement ; toute correction et publication réelle devra être
effectuée avec le compte enseignant, après validation explicite.

## Navigation et notifications des copies officielles (23/11/2026)

- La liste **Évaluations → Corrections** résout maintenant le lien officiel
  avec `schoolnet_teacher_school_assessment_context`, en conservant V1 pour
  les évaluations non rattachées.
- Les anciens liens ciblés `/app/teacher/grading?assessmentId=...`
  redirigent vers B.3 après vérification des droits. L'ancien menu
  **Corrections** conserve V1 et un lien explicite vers les évaluations.
- Le déclencheur historique B.2 bloquait intentionnellement les notifications
  de remise officielle pour éviter les liens V1 inaccessibles.
  La nouvelle **proposition non installée sur Supabase principal**
  `supabase/proposals/s4b3b3n_official_teacher_submission_notifications.sql`
  prévoit un événement unique lors des prochaines remises, destiné au
  professeur réellement affecté à la classe/année/établissement, avec
  une redirection vers `/official-corrections`.
- Aucun backfill automatique : la copie déjà remise avant l'activation
  de cette proposition ne recevra pas rétroactivement de notification.
  Activation sur Supabase principal et éventuel rattrapage de cette
  notification **soumis à autorisation distincte**.
- Scénarios PostgreSQL A/B jetable pour vérifier la notification au bon
  enseignant, l'absence de fuite vers l'établissement B, le bon lien
  officiel, le dédoublonnage et le retour arrière V1.
