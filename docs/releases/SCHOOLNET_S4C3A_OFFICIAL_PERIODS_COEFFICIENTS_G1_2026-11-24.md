# SCHOOLNET V2 — S4-C.3-A — Périodes et coefficients officiels (G1 validé)

Date : 24 novembre 2026. Branche : `feature/schoolnet-s4c3a-official-periods-coefficients-20261124`.
Base figée : `main@892bc2cf19981f6723b6c68996aa74ee0e27d249`.
Statut : **développement isolé** ; aucune migration SQL installée sur SCHOOLNET principal, aucune fusion main ou publication.
Le GO utilisateur concerne le développement sur branche, **PAS** l'installation SQL ni la mise en production.

## Pourquoi une configuration locale dédiée est indispensable
La table V1 `public.grading_periods` n'a pas de `school_id` et impose `UNIQUE(school_year_id,code)` ; elle ne peut pas représenter deux calendriers d'écoles indépendants avec les mêmes codes. `public.assessment_average_settings` s'appuie sur des cours V1 et `public.class_subject_settings` ne porte pas la période. La vue V1 `student_assessment_average_entries` dépend de `courses.class_id` et `course_subjects` ; l'évaluation officielle B.3 publiée n'y entre pas. **Ne pas modifier ni réinterpréter rétroactivement V1.**

L'administrateur d'établissement doit pouvoir créer une période dans l'année où il possède des classes, définir les coefficients par classe/matière et par évaluation officiellement liée, puis verrouiller la période. Le calcul des moyennes, les classements et la publication ne font pas partie de C.3-A.

## Contrat proposé
- `schoolnet_private.school_grading_periods` : périodes distinctes par école et année ; code, dates comprises dans l'année, pas de chevauchement entre périodes de la même école/année, verrouillage irréversible dans C.3-A.
- `schoolnet_private.school_period_subject_coefficients` : coefficient sur une période, une classe et une matière **dont l'affectation scolaire est active**.
- `schoolnet_private.school_official_assessment_coefficients` : rattachement de l'évaluation officielle à **une seule période**, coefficient et choix explicite `include_in_average` (par défaut false). Jamais de note ni de copie dans ces tables.
- RPC `schoolnet_school_grading_configuration` : projection sans identité ni résultat d'élève ; y compris années, classes/matières, évaluations officielles actives et réglages.
- RPC de mutation `schoolnet_school_upsert_grading_period`, `schoolnet_school_lock_grading_period`, `schoolnet_school_set_subject_coefficient`, `schoolnet_school_set_assessment_coefficient`.
- Chaque RPC exige le rôle **school_admin**, l'appartenance locale active et l'école demandée via `schoolnet_private.assert_s3c_access`. Les écritures utilisent également sa protection d'origine existante ; l'origine seule ne constitue pas une autorisation.
- Tables dans un schéma privé, RLS activée, aucun accès direct `anon/authenticated` ; seules les RPC exposent les champs nécessaires.
- Une période verrouillée n'accepte aucune modification. Déplacer une évaluation depuis une ancienne période verrouillée est refusé.
- **Aucune** publication ni moyenne calculée ici. La future C.3-B ne devra utiliser que les notes officielles publiées et les affiliations encore autorisées.

## Scénarios à prouver avant GO SQL principal
A positif et B refusé (lecture/écriture par ID falsifié), anonymat refusé, rôle global non autorisé, école suspendue, révocation membre et enseignant, année sans classe, chevauchement de périodes, dates hors année, doublons, coefficient négatif/hors borne, impossibilité de modifier une période verrouillée, relecture sans données des autres écoles, aucune altération des notes ou bulletins V1.

**G2 SQL** : `supabase/proposals/s4c3a_official_periods_coefficients.sql` ; pas de migration dans `supabase/migrations` avant consentement distinct et preuve de restauration. Aucun test destructif sur le principal. Préparer un rollback ciblé des nouvelles fonctions/tables avant installation.

## Workflow
G1 validé → G2/G3 SQL et tests isolés → G4 UI avec états vide/erreur/attente → G5 CI et recette Windows dans `schoolnet-tests` → GO SQL principal distinct → GO fusion/main/Vercel distinct → contrôle prod G8.

## Vérification G2 prévue
La CI nouvelle construit une base Supabase **PostgreSQL jetable**, applique uniquement le SQL propositionnel, exécute une matrice A/B fictive dans une transaction `ROLLBACK`, puis retire ses propres fonctions/tables avec un rollback gardé. Aucun lien ni identifiant du projet hébergé n'est transmis à cette CI. Les résultats réels de cette CI priment sur les tests de contrat statiques.
