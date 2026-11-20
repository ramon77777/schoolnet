# SCHOOLNET V2 — S4-B.3-B.0 · Sécurité préalable des évaluations

**Date de préparation :** 20 novembre 2026  
**Branche isolée :** `feature/schoolnet-s4b3b0-assessment-security-20261120`  
**Base de départ :** `main` au commit `c2176076415add709607f782a719fb36318e7a28`  
**État :** projet SQL et QA, **sans autorisation d'activation**.

## 1. Audit de l'existant (lectures seules, données agrégées)

S4-B.3-A affiche le calendrier des évaluations officielles. S4-B.3-N gère déjà
leur notification. En revanche, les pages V1 d'exécution et de correction
consomment `assessments`, `quiz_questions`, `quiz_choices`,
`assessment_submissions`, `homework_submissions`, `submission_answers` et
`submission_question_grades` avec des RLS et fonctions historiques.

Le SQL principal, au moment de l'audit, contient 15 évaluations,
9 soumissions en ligne, 4 devoirs déposés, 16 réponses et 11 corrections.
Les 2 inscriptions V1 et les progressions associées ne doivent pas être
modifiées par cette étape. La table historique `submissions` existe,
mais son compteur observé est de 0.

Les vulnérabilités identifiées concernent :
- l'accès direct au champ `is_correct` des choix lorsque `can_access_course`
  autorise l'élève V1 ;
- les politiques RLS `ALL` sur les propres lignes de soumission, qui ne
  protègent pas en elles-mêmes `score`, `graded_by` ou `status` ;
- les RPC anciennes de publication/correction peu ou pas authentifiées :
  une proposition `20261109140104_harden_assessment_legacy_rpcs.sql`
  existait dans GitHub, mais la version contrôlée en production n'en
  présentait pas les restrictions et l'historique des migrations n'en
  indiquait pas l'application ;
- les effets indirects : notifications de correction aux parents et
  `student_progress` V1 ;
- le bucket de devoirs V1 `homework-submissions`, actuellement **public** ;
- les délais calculés côté navigateur et la remise composée de plusieurs
  requêtes non atomiques.

## 2. Protection proposée par B.0

Le fichier `supabase/proposals/s4b3b0_official_assessment_security_foundation.sql`
définit trois classifications booléennes privées :
`schoolnet_private.s4b3b0_is_official_assessment`,
`schoolnet_private.s4b3b0_is_official_question` et
`schoolnet_private.s4b3b0_is_official_submission`. Elles utilisent
`auth.uid()`, `SECURITY DEFINER`, un `search_path` figé et le
référentiel `schoolnet_private.school_assessment_links` ; un lien révoqué
ne rend jamais l'évaluation à nouveau exécutable par la voie V1.

Huit politiques **RESTRICTIVE** supplémentaires sont proposées sur les
évaluations, questions, choix, remises en ligne, devoirs avec fichiers,
soumissions historiques, réponses et détails de notes. Elles agissent par
intersection avec les RLS permissives : elles n'ajoutent aucun droit V1.
Les enseignants propriétaires conservent l'accès aux évaluations et aux
questions nécessaires à leur préparation. **Toute lecture ou écriture directe
d'une copie officielle (remise, réponse, note) est bloquée pour les rôles
applicatifs, y compris l'enseignant propriétaire** : les futures opérations V2
passeront exclusivement par des RPC contrôlées côté serveur (B.2/B.4).

Deux triggers préservent l'interface V1 mais empêchent un **élève** de
s'auto-attribuer un score, une correction, une date de publication ou un
statut `graded/published` sur ses propres rendus. Les migrations V1
existantes et les règles de l'enseignant sont conservées.

Six RPC historiques de correction/publication sont renforcées :
l'utilisateur doit être propriétaire de l'évaluation, et l'évaluation
**ne doit pas être officiellement rattachée** ; B.4 introduira les
opérations officielles dédiées. Le recalcul manuel du score est retiré
de l'API `authenticated` et reste disponible pour les triggers internes.

**Point important :** ce sous-bloc prépare la sécurité en attendant
S4-B.3-B.1/B.2 ; **aucun bouton « Commencer », aucun accès aux questions
officielles et aucune remise officielle ne sont activés par B.0**.

## 3. Isolation et tests

Fichiers :
- SQL préparatoire **non installé** :
  `supabase/proposals/s4b3b0_official_assessment_security_foundation.sql`
- Rollback manuel conservant les signatures et corps d'origine :
  `supabase/verification/s4b3b0_official_assessment_security_rollback_manual.sql`
- Modèle de base de données synthétique :
  `tests/s4b3b0-tenant-ci/fixtures/submission-core.sql`
- Scénarios A/B, refus, compatibilité V1, anti-fraude :
  `tests/s4b3b0-tenant-ci/fixtures/security-a-b.sql`
- Contrats Node : `scripts/test-schoolnet-s4b3b0-security.mjs`
- CI locale isolée : `.github/workflows/schoolnet-s4b3b0-security-ci.yml`

La CI exécute également la non-régression S4-B.3-A/N et S4-B.2,
le lint et le build. Elle n'utilise **aucune connexion Supabase hébergée**.

Le rollback réinstalle les RPC telles qu'elles ont été relues sur la base
principale avant le développement ; sa réutilisation future requiert une
nouvelle décision, notamment parce qu'elle restaure les droits historiques.

## 4. Risques et limites explicitement reportés

1. Le quiz **libre V1** conserve son accès historique aux choix, y compris
   le champ `is_correct` pour un élève inscrit ; éviter de revendiquer
   la correction globale de ce risque tant que l'interface V1 et les
   autorisations de lecture de réponses n'ont pas été refondues.
2. Le bucket V1 `homework-submissions` reste public. B.3 devra créer
   un espace **privé** pour les fichiers officiels et des URL signées,
   sans casser les fichiers déjà remis en V1.
3. Les RPC de participation officielle et la transaction atomique
   réponses+statut/échéance seront conçues en B.1/B.2.
4. Les mécanismes de progression et les notifications aux parents
   doivent être explicitement écartés des rendus officiels tant que
   les fonctions B.4 / résultats S4-B.3-C ne sont pas autorisés.
5. Les comptes et rôles doivent encore subir des tests de recette réelle
   à l'activation SQL après validation de la CI.

## 5. Portes de validation

- **GO développement/CI branche isolée :** autorisé.
- **GO migration SQL Supabase principal :** NON autorisé.
- **GO fusion `main` / déploiement Vercel :** NON autorisé.
- **GO exécution réelle par un élève :** NON autorisé (hors périmètre B.0).

Aucun `supabase/migrations/*.sql` n'est créé à ce stade : un éventuel
fichier d'installation versionné doit correspondre exactement au SQL
ultérieurement autorisé et installé.
