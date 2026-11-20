# SCHOOLNET V2 — S4-B.3-A : rattachement des évaluations officielles

**Date : 20 novembre 2026**  
**Base de développement :** `main` `dc55920b2d35841c45937acf432eab1637299f53`  
**Statut :** migration SQL S4-B.3-A installée et vérifiée sur Supabase principal
le 20 novembre 2026. Code sur la branche de la PR #22 (brouillon) ; aucune
fusion GitHub ni publication du frontend sur Vercel officiel.

## Décision produit

SCHOOLNET dispose déjà de `assessments`, `quiz_questions`,
`assessment_submissions`, `homework_submissions`, des corrections et
des résultats V1. **Aucune de ces fonctionnalités n'est recréée.**

En V1, l'élève identifie ses évaluations via `course_enrollments`.
En V2, il appartient à une classe officielle au moyen de
`schoolnet_school_student_class_assignments` et des memberships
des établissements, sans inscription à un cours libre.

Ce raccordement se réalise par étapes pour éviter de livrer des
soumissions ou des notes avec un contrôle d'accès V1 insuffisant.

## S4-B.3-A — Rattachement et calendrier officiel (présente PR)

- Depuis la fiche d'une évaluation existante, l'enseignant peut
  **choisir explicitement** de la rattacher à son cours officiel.
- Les évaluations historiques déjà publiées ne sont **jamais importées
  automatiquement** dans un établissement.
- La fiche de l'élève d'un cours officiel indique **uniquement**
  les titres, types et échéances des évaluations :
  `status=published`, lien officiel `active`, établissement/classe/
  affectation et memberships actifs.
- Les brouillons, évaluations clôturées, documents de consignes,
  questions, réponses, notes, soumissions et identités d'élèves ne
  sont **pas** transmis par ce nouveau catalogue.
- Cette version est **consultative pour l'élève**. Aucun bouton de
  démarrage ou de remise d'évaluation V1 n'est proposé.
- Une déliaison retire aussitôt l'évaluation du catalogue scolaire,
  sans supprimer son objet `assessments` V1.

## Données et permissions

**Migration appliquée sur Supabase principal** (ne pas réexécuter) :
`20261120112312_schoolnet_s4b3a_official_assessment_links`.

- Fichier de migration versionné :
  `supabase/migrations/20261120112312_schoolnet_s4b3a_official_assessment_links.sql`.
- Source SQL appliquée et conservée sans modification :
  `supabase/proposals/s4b3a_school_assessment_links.sql`.
- Le fichier versionné reproduit exactement le SQL déjà appliqué ;
  il sert à la traçabilité Git et **ne doit pas être rejoué sur cette base**.

- Table `schoolnet_private.school_assessment_links` :
  une seule association par évaluation, historisée par
  `active/revoked`, RLS activée, aucun accès direct `anon`
  ou `authenticated`.
- Quatre fonctions privées `SECURITY DEFINER`, sous
  `search_path=pg_catalog`, avec vérification de `auth.uid()`
  et du rôle du profil ; quatre façades publiques
  `SECURITY INVOKER`.
- Les contrôles existants `student_school_course_access` et
  `teacher_course_class_summary` sont réutilisés. Ils valident
  les affiliations, classes, matières, cours et affectations actives.
- Les deux écritures de rattachement exigent en outre l'origine
  officielle SCHOOLNET et le compte propriétaire enseignant.
  Cette origine est une **barrière contre les écritures accidentelles
  des previews**, pas une preuve d'identité : l'autorisation effective
  s'appuie sur `auth.uid()` et les données métier.
- La lecture par l'élève retourne au maximum
  `{courseId, assessments:[{assessmentId,title,type,dueAt}]}`.
- Aucun changement des tables `assessments`, `course_enrollments`,
  `student_progress`, `assessment_submissions`, `submissions`,
  `homework_submissions`, `grades` ou des RLS historiques.

## Vérifications

- 20 tests frontend/contrats SQL : `npm run qa:s4b3a`.
- Non-régression : `qa:s4b2`, `qa:s4b2-ui`, `qa:s4b2-r`.
- Compilation TypeScript/Vite et lint.
- CI Supabase jetable distinct (Postgres `54342`) :
  enseignants A/B, élèves A/B, cours V1, opt-in explicite, refus des
  brouillons non publiés et évaluations non liées, rôle non autorisé,
  origine Preview refusée, révocation d'une affiliation et d'un lien.
- Rollback manuel ciblé testé sans retirer les RPC S4-B.
- Pas de comptes ni de données de test ajoutés sur Supabase principal.
- Contrôles post-migration sur Supabase principal : table privée créée avec RLS,
  accès direct `anon`/`authenticated` refusé ; huit fonctions présentes avec
  permissions conformes et `search_path` figé. Aucun rattachement automatique
  (`school_assessment_links` = 0) ; `assessments` = 14,
  `course_enrollments` = 2, `student_progress` = 2, sans variation.
- La recette utilisateur avec des comptes autorisés et l'isolation A/B réelle
  restent à homologuer ; les tests en CI isolée ne valent pas recette métier.
- Preview Vercel du commit initial `68ea3801` : READY, lecture seule.
  Le frontend n'est pas encore intégré au site officiel.

## Étapes suivantes

**S4-B.3-B :** ouvrir l'exécution/remise officielle de manière sûre
(quiz, devoirs et examens selon leur mode), avec contrôles SQL
sur chaque lecture/écriture des soumissions et avec réutilisation
de la correction V1 lorsque compatible. Aucun contournement de
`course_enrollments` par simple condition frontend.

**S4-B.3-C :** notes publiées, suivi enseignant et accès élève/
parent/administration d'établissement, avec protection de toutes
les données personnelles et sans fuite entre établissements.

**Important :** la présente PR prépare S4-B.3-A et n'achève
pas à elle seule tout S4-B.3. Le GO SQL a été accordé et la migration
est déjà appliquée. Les GO de fusion dans `main` et de publication
Vercel restent distincts et ne sont pas accordés. Le rollback manuel
reste une procédure ciblée à ne pas exécuter sans décision dédiée.
