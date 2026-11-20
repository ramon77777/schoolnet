# SCHOOLNET V2 — S4-B.3-N : notifications des évaluations officielles

**Date :** 20 novembre 2026  
**Base :** `main` au commit `9dc1b1afb4f804b0ee96746436087ba824bdd9c4`  
**État au 20 novembre 2026 :** migration S4-B.3-N **installée et vérifiée sur Supabase principal** (`20261120130939`) et durcissement des droits de la fonction historique **également installé et vérifié** (`20261120132205`). La PR n°23 reste **en brouillon, non fusionnée** ; **aucune publication frontend Vercel autorisée ou effectuée**.

## Constat vérifié

Lors de la recette S4-B.3-A, l'enseignant Yapi Bernard a rattaché puis publié
`TEST S4-B.3-A — Nombres entiers` pour le Collège Test Code Auto, 6e A.
L'élève de sa classe voyait l'évaluation dans son cours officiel, mais aucune
notification n'avait été enregistrée. Supabase principal indiquait **1 élève
officiel actif, 0 inscription V1 et 0 notification** pour ce quiz.

Avant S4-B.3-N, le trigger `trg_notify_assessment_published` appelait
`public.notify_assessment_published()`, qui recherchait uniquement les
inscriptions V1 (`course_enrollments`, `class_students`). La migration
`20261120130939` a introduit le routage par les affectations officielles
`schoolnet_school_student_class_assignments`, en conservant le comportement
V1 pour les cours libres.

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

- **Migration S4-B.3-N déjà appliquée sur Supabase principal** (ne pas réexécuter) :
  `20261120130939_schoolnet_s4b3n_official_assessment_notifications`.
- Copie Git **strictement identique** au SQL appliqué :
  `supabase/migrations/20261120130939_schoolnet_s4b3n_official_assessment_notifications.sql`.
- Source originale, conservée également :
  `supabase/proposals/s4b3n_school_assessment_notifications.sql`.
  Les mentions initiales « proposition non installée » dans ce SQL restent
  inchangées pour assurer une traçabilité octet pour octet ; **elles
  correspondent à son état avant l'activation**.
- **Durcissement complémentaire déjà installé sur Supabase principal** (ne pas réexécuter) :
  migration `20261120132205_schoolnet_s4b3n_legacy_assessment_notify_permission_hardening`.
- Fichier de migration GitHub **strictement identique** au SQL appliqué :
  `supabase/migrations/20261120132205_schoolnet_s4b3n_legacy_assessment_notify_permission_hardening.sql`.
- Source historique conservée **sans modification** :
  `supabase/proposals/s4b3n_legacy_assessment_notify_permission_hardening.sql`.
  Ses mentions « non appliquée » sont conservées comme état initial du fichier ;
  la migration est bel et bien enregistrée sur Supabase principal.
  Le SQL retire `EXECUTE` direct à `PUBLIC`, `anon` et `authenticated`
  sur `public.notify_assessment_published()` tout en conservant
  `service_role`, le propriétaire et les triggers V1/V2.
- **Rollback complémentaire autonome** (restaure uniquement les GRANT
  préexistants `anon` et `authenticated` ; aucune donnée supprimée) :
  `supabase/verification/s4b3n_legacy_assessment_notify_permission_rollback_manual.sql`.
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
8. Durcissement des permissions V1 sur **Supabase local uniquement**, avec
   maintien de l'envoi d'une notification depuis une évaluation publiée par
   le rôle `authenticated`, puis restauration ciblée des GRANT.
9. Vérification automatique d'identité exacte des **deux** SQL appliqués
   (`20261120130939` et `20261120132205`) avec leurs copies versionnées Git.

**Aucun rattrapage rétroactif** du quiz déjà publié en production n'est
prévu par le SQL. Une opération de rattrapage serait à valider séparément.

## Portes d'autorisation

**GO 1 — Développement/CI :** autorisé ; CI sur branche isolée.  
**GO 2 — Migration SQL S4-B.3-N Supabase principal :** accordé et exécuté avec succès le 20 novembre 2026 (migration `20261120130939`).  
**GO 2 bis — Durcissement des permissions de la fonction V1 historique :** autorisé, installé et vérifié sur Supabase principal le 20 novembre 2026 (`20261120132205`), sans changement de données.  
**GO 3 — Fusion GitHub et publication automatique Vercel :** non autorisé.  
**GO 4 — Recette réelle élève/enseignant :** après autorisation et activation du frontend.

Contrôle post-installation du 20 novembre 2026 : 15 évaluations, 77 notifications,
2 inscriptions V1, 2 progressions V1 et 1 lien officiel actif, sans variation.
Aucun rattrapage rétroactif du quiz déjà publié. Les deux nouvelles fonctions
privées ainsi que le trigger de liaison sont actifs. Les ACL directes de
`public.notify_assessment_published()` ont été durcies : `anon` et
`authenticated` ne peuvent plus l'exécuter directement ; `service_role`
et les deux déclencheurs restent opérationnels.

**Contrôles post-durcissement de production** : 15 évaluations, 77 notifications,
2 inscriptions V1, 2 progressions V1 et 1 lien officiel actif, sans variation.
Les avertissements Supabase associés à l'exécution directe de la fonction
historique ont disparu. Les notifications V1/V2 et les rollbacks ont été
vérifiés sur une base Supabase locale jetable via CI. Le nouveau fichier
versionné correspond au SQL déjà installé, **ne doit pas être réexécuté**,
et reste distinct de la migration S4-B.3-N initiale.

S4-B.3-N complète le calendrier des évaluations officielles (S4-B.3-A).
Les remises et corrections S4-B.3-B ainsi que les notes S4-B.3-C
demeurent hors de cette PR.
