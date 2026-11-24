# SCHOOLNET V2 — S4-C.3-A — Périodes et coefficients officiels (G1 validé)

Date : 24 novembre 2026. Branche : `feature/schoolnet-s4c3a-official-periods-coefficients-20261124`.
Base figée : `main@892bc2cf19981f6723b6c68996aa74ee0e27d249`.
Statut au 24 novembre 2026 : **SQL C.3-A installé sur Supabase principal**, interface validée en lecture sur localhost ; **PR n°32 toujours en brouillon**, branche `main` et production Vercel inchangées.
Les autorisations ont été distinctes : développement sur branche, puis installation SQL. **Aucun GO de fusion `main` ni de publication Vercel n'a été accordé.**

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

## Scénarios de sécurité retenus
A positif et B refusé (lecture/écriture par ID falsifié), anonymat refusé, rôle global non autorisé, école suspendue, révocation membre et enseignant, année sans classe, chevauchement de périodes, dates hors année, doublons, coefficient négatif/hors borne, impossibilité de modifier une période verrouillée, relecture sans données des autres écoles, aucune altération des notes ou bulletins V1.

**G2 SQL / G7 installation** : `supabase/proposals/s4c3a_official_periods_coefficients.sql` a été appliqué au projet Supabase principal le 24 novembre 2026, après GO distinct, sous la migration `20261124133104_schoolnet_s4c3a_official_periods_coefficients_20261124`. Le SQL source reste dans `supabase/proposals` ; il **ne doit pas être rejoué** sur le principal (installation non idempotente). Le rollback ciblé `supabase/verification/s4c3a_official_periods_coefficients_rollback_manual.sql` est préparé et testé sur base jetable, mais **non exécuté sur le principal**.

## Workflow
G1 validé → G2/G3 tests SQL isolés réussis → G4/G5 interface en lecture et CI validées → G7 installation SQL principale terminée → **pré-fusion PR n°32 (en cours)** → **GO fusion/publication distinct requis** → après publication, recette des écritures sur domaine autorisé et contrôle G8. La fusion GitHub sur `main` déclenche automatiquement un déploiement Vercel de production.

## Vérification G2 CI réalisée
Le [workflow C.3-A n°45385985761](https://github.com/ramon77777/schoolnet/actions/runs/45385985761) a réussi. La CI construit une base Supabase **PostgreSQL jetable**, y applique uniquement le SQL propositionnel, exécute une matrice A/B fictive dans une transaction `ROLLBACK`, puis retire ses propres fonctions/tables avec un rollback gardé. Aucun identifiant du projet hébergé ni aucune clé de production n'est transmis à cette CI. Ces tests ne constituent pas une restauration de la sauvegarde du principal.

## Contrôle post-installation et préparation de publication (24 novembre 2026)
- Trois tables privées et dix fonctions C.3-A installées ; RLS activée, aucun droit de lecture/écriture direct pour `anon` ou `authenticated`, et aucun droit d'exécution `anon` sur les RPC. Les opérations passent par des fonctions authentifiées et contrôlées par établissement.
- Tables de configuration C.3-A vides après installation : **0 période, 0 coefficient**. Données V1 témoin inchangées : **15 évaluations, 10 soumissions, 79 notifications, 1 période V1, 1 bulletin V1**.
- Sauvegarde locale `D:\SCHOOLNET_BACKUPS_PRIVES\SCHOOLNET_AVANT_C3A_20261124_132419.dump` : archive lisible avec `pg_restore --list` et `pg_restore --file=NUL`. **Aucun test de restauration complet n'a été effectué**, car le serveur PostgreSQL local ne répond pas sur `127.0.0.1:5432`. Le dump sélectionne les schémas `public`, `schoolnet_private`, `auth` et `storage`, sans sauvegarder les objets binaires des buckets Storage.
- Interface `http://localhost:5173/app/school/grading-settings` contrôlée par capture : établissement autorisé, année 2026-2027, écran « Créer une période », 0 période. Les écritures sont volontairement refusées depuis localhost par la protection d'origine existante ; recette d'écriture uniquement sur le domaine de production autorisé après GO distinct.
- GitHub : PR n°32 en brouillon, **4 commits d'avance / 0 de retard**, sans conflit au contrôle de pré-fusion ; `main` ne dispose actuellement d'aucune protection obligatoire de branche. La CI doit être vérifiée à nouveau après toute correction. Aucun déploiement de production autorisé à ce stade.

