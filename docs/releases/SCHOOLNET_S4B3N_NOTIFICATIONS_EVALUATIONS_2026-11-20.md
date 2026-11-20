# SCHOOLNET V2 — S4-B.3-N : notifications des évaluations officielles

**Date :** 20 novembre 2026  
**Base :** `main` au commit `9dc1b1afb4f804b0ee96746436087ba824bdd9c4`  
**État :** développement en branche isolée et PR brouillon. **Aucune migration Supabase principal, fusion ni publication de production autorisée.**

## Constat vérifié

Lors de la recette S4-B.3-A, l'enseignant Yapi Bernard a rattaché puis publié
`TEST S4-B.3-A — Nombres entiers` pour le Collège Test Code Auto, 6e A.
L'élève de sa classe voyait l'évaluation dans son cours officiel, mais aucune
notification n'avait été enregistrée. Supabase principal indiquait **1 élève
officiel actif, 0 inscription V1 et 0 notification** pour ce quiz.

Le trigger `trg_notify_assessment_published` appelle actuellement
`public.notify_assessment_published()`, qui recherche les destinataires dans
`course_enrollments` et `class_students`. Il ignore les affectations
`schoolnet_school_student_class_assignments` de SCHOOLNET V2.

## Choix d'implémentation

Nous **réutilisons** la table `public.notifications`, son index d'unicité
`(user_id,event_key,related_id)`, son affichage Realtime dans la cloche et
le centre de notifications ; aucune seconde table ni système de notes.

- Pour un cours libre V1, `notify_assessment_published()` conserve exactement
  les destinataires, textes, clés d'événement et routes préexistants.
- Pour un cours portant un lien scolaire dans `school_course_links`, le
  diffuseur V1 **n'envoie plus de notification** à partir de `class_students`
  ou `course_enrollments`, même si le lien est ensuite révoqué.
- Seul un rattachement d'évaluation **explicite et actif** permet de notifier
  lors d'une transition de l'évaluation vers `published`.
- Quand l'enseignant a publié **avant** le rattachement, l'insertion ou la
  réactivation du lien déclenche la notification si elle est toujours publiée.
- Un brouillon n'envoie rien. Un changement sans transition de statut et un
  rattachement répété n'envoient pas de doublon.
- Une dépublication ou une révocation du lien peut générer une information
  de retrait, mais uniquement pour les destinataires encore autorisés qui
  avaient reçu la notification scolaire de publication.
- Les notifications de publication utilisent la clé historique
  `assessment_published`. Les retraits utilisent `assessment_withdrawn`.
  Toutes deux sont présentées dans « Devoirs et évaluations ».
- La route unique est `/app/student/school-courses/<course_id>`, protégée
  par les contrôles de cours officiels S4-B.2. Il n'y a **pas** de lien
  vers une remise, une correction ou un résultat V1.
- Le texte contient uniquement le titre de l'évaluation (limité à 180
  caractères), sa matière et une invitation à consulter le cours.
  **Aucune copie, question, note, identité ni donnée médicale.**

## Sécurité

La fonction privée `schoolnet_private.emit_official_assessment_notification`
révalide à l'envoi l'établissement, la classe, l'année, le statut du cours,
l'identité et l'affectation active de l'enseignant, la matière, l'affectation
et l'appartenance active de l'élève, et son rôle `student`. Aucun droit
`EXECUTE` pour `anon` et `authenticated`. Les fonctions utilisent
`search_path=pg_catalog`.

Les anciens triggers de notification V1 ne sont ni supprimés ni dupliqués.
Le corps historique de `public.notify_assessment_published()` est conservé
sous une garde de routage qui n'agit que pour les cours du référentiel V2.

**Important :** le retrait d'une affectation d'élève après l'envoi n'efface
pas automatiquement l'historique privé de notifications ; le lien cible
refuse l'accès au cours après révocation. Cette décision privilégie la
traçabilité et évite les suppressions automatiques de données.

## Fichiers livrés

- Proposition SQL **non installée** :
  `supabase/proposals/s4b3n_school_assessment_notifications.sql`.
- Rollback manuel conservant les notifications existantes et restaurateur
  de la fonction V1 d'origine :
  `supabase/verification/s4b3n_school_assessment_notifications_rollback_manual.sql`.
- Filtre du centre de notifications :
  `src/features/notifications/pages/NotificationsPage.tsx`.
- QA Node : `scripts/test-schoolnet-s4b3n-notifications.mjs`.
- Suite SQL A/B : `tests/s4b3n-tenant-ci/fixtures/`.
- GitHub Actions : `.github/workflows/schoolnet-s4b3n-notification-ci.yml`.

## Tests et non-régression

Le workflow CI doit reconstruire une **base Supabase locale jetable**, sans
connexion à la base principale, puis vérifier :

1. Publications avant/après rattachement, brouillons, retraits et répétitions.
2. Isolation A/B malgré une ancienne `class_students` incorrecte.
3. Adhésion et affectations révoquées (élève et enseignant), école suspendue.
4. Aucune exécution RPC directe des fonctions privées.
5. Index anti-doublons, RLS des notifications, destination de la cloche.
6. Non-régression V1, S4-B.3-A et S4-B.2, lint et compilation.
7. Rollback SQL conservant l'historique et les fonctions S4-B.3-A.

**Aucun rattrapage rétroactif** du quiz déjà publié en production n'est
prévu par le SQL. Une opération de rattrapage serait à valider séparément.

## Portes d'autorisation

**GO 1 — Développement/CI :** présentement autorisé.  
**GO 2 — Migration SQL Supabase principal :** non autorisé.  
**GO 3 — Fusion GitHub et publication automatique Vercel :** non autorisé.  
**GO 4 — Recette réelle élève/enseignant :** après activation distincte.

S4-B.3-N complète le calendrier des évaluations officielles (S4-B.3-A).
Les remises et corrections S4-B.3-B ainsi que les notes S4-B.3-C
demeurent hors de cette PR.
