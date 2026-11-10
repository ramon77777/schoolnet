# SCHOOLNET 2.0 — Audit de l'isolation des établissements
## Diagnostic technique, modèle cible et plan de sécurisation

**Date :** 10 novembre 2026  
**Projet :** Supabase `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`)  
**Branche GitHub :** `feature/schoolnet-multi-etablissements` / PR #6 (brouillon, base `feature/schoolnet-notifications`).  
**État :** **AUDIT TERMINÉ ET PREMIER CORRECTIF RLS ACTIVÉ, AUTORISATION UTILISATEUR OBTENUE.** Migration Supabase `20261110141631_school_admin_legacy_read_fence_phase1.sql` appliquée ; validations SQL des cinq rôles réussies. Aucune fusion vers `main`, aucun changement Vercel Production, aucune donnée historique modifiée.

## 1. Décisions métier à respecter

SCHOOLNET couvre simultanément :
- **Établissements scolaires** : administrateur local, enseignants, classes officielles, année scolaire, inscriptions, notes, présences, bulletins.
- **Apprenants libres** : cours et groupes pédagogiques SCHOOLNET indépendants d'une école partenaire.
- **Cours à domicile** : demandes de tutorat, enseignants affectés et séances indépendantes du dossier scolaire officiel.

**Une identité Supabase Auth / un compte utilisateur** est conservé, même quand la personne participe à plusieurs modes d'apprentissage. Le rattachement à une école n'est pas déduit du nom, de la classe, du domaine e-mail ou de l'adresse IP.

**Super Administrateur :** rôle historique `profiles.role='admin'`, droits centraux.  
**Administrateur d'établissement :** `profiles.role='school_admin'`, une appartenance active dans `schoolnet_school_memberships` et une école active sont obligatoires. Il n'hérite d'aucun droit global `admin`.

## 2. État réel de Supabase

L'audit lit exclusivement les métadonnées, droits, comptes agrégés et relations. Aucune donnée personnelle n'est reprise dans ce document.

| Élément audité | Constat |
|---|---|
| Migrations appliquées | **34** (dont `20261110141631`) |
| Tables physiques `public` | **66**, RLS activée sur les 66 |
| Politiques RLS `public` | **194** |
| Vues métier `public` | **5**, toutes avec `security_invoker=true` |
| Fonctions publiques (`prokind=f/p`) | **140** |
| Fonctions `SECURITY DEFINER` appelables par un rôle authentifié | **115** (revue individuelle encore nécessaire) |
| Fonctions `SECURITY DEFINER` dont `anon` possède EXECUTE | **53** (surface à auditer, pas une preuve de faille) |
| Établissements | **2** |
| Appartenances scolaires locales | **1**, active |
| Classes historiques | **2** |
| Inscriptions annuelles historiques | **2** |
| Années scolaires historiques | **3** |
| Cours historiques | **4** |
| Périodes de notation | **1** |
| Salles | **2** |

Source de référence : requêtes SQL de lecture seule auprès de Supabase ; les effectifs ne doivent pas être utilisés comme des constantes dans les migrations futures.

## 3. Risque de lecture directe malgré l'interface verrouillée

**Constat AVANT correctif, confirmé en test SQL contrôlé avec `ROLLBACK` et rôle `authenticated` :**

Avant activation, le compte `school_admin` ne voyait que sa propre école dans `schoolnet_schools` (1 ligne), sans comptes tiers ni affectations. Cependant, la lecture directe des anciennes tables renvoyait :

| Table | Lignes visibles AVANT correction | Cause |
|---|---:|---|
| `classes` | 2 | Policy `classes_select_authenticated` avec `USING (true)` |
| `school_years` | 3 | Policy de lecture générale |
| `grading_periods` | 1 | Policy de lecture générale |
| `rooms` | 2 | Policy de lecture générale |
| `schoolnet_schools` | 1 | **Correct :** appartenance active vérifiée |
| `class_students` | 0 | Filtrage des comptes |
| `class_teachers` | 0 | Filtrage des comptes |
| `courses` | 0 | Filtrage métier existant |
| `profiles` | 1 | Le compte personnel |

**La redirection de `/app/admin/users` protège l'interface, mais elle ne modifie pas les droits de lecture de l'API Supabase.** Le navigateur n'est pas une frontière de sécurité.

Ces tables ne contiennent pas nécessairement des données sensibles dans leurs colonnes actuelles ; le risque critique est que les futurs établissements et leurs données seraient visibles à d'autres établissements si nous réutilisions ces politiques générales sans les adapter.

## 4. Politique RLS de transition — phase 1 APPLIQUÉE et testée

**Migration appliquée :** `supabase/migrations/20261110141631_school_admin_legacy_read_fence_phase1.sql` (copie SQL exacte de la proposition initiale `supabase/proposals/school_admin_legacy_read_fence_phase1.sql`).

Il durcit exactement **8 politiques SELECT**, sur **7 tables** :
1. `classes` : deux policies, dont celle des classes d'enseignants liées aux évaluations.
2. `school_years`.
3. `grading_periods`.
4. `rooms`.
5. `class_subject_settings`.
6. `course_subjects`.
7. `assessment_average_settings`.

Règle transitoire : la lecture historique reste autorisée à `admin`, `teacher`, `student` et `parent` selon les politiques déjà en place, mais est **refusée au rôle `school_admin`** tant que ces lignes ne sont pas identifiées comme appartenant à une école. Les règles d'écriture globales existantes sont inchangées.

**Aucune table n'est vidée, aucun compte réattribué, aucun cours ni groupe libre reclassé.** Les sources globales réellement partagées (`levels`, `academic_subjects`, `platform_settings` et configuration du site public) ne sont pas fermées dans cette première étape.

Le SQL a vérifié que les huit politiques d'origine correspondaient exactement à l'audit. Après autorisation explicite, Supabase a appliqué la migration `school_admin_legacy_read_fence_phase1` sous la version réelle `20261110141631`. La source GitHub reprend exactement les instructions SQL exécutées.

**Tests réels :** préactivation `BEGIN … ROLLBACK` : **OK** pour les cinq rôles. Puis, **après activation persistante de la migration**, recette SQL sous transaction de lecture seule, terminée par `ROLLBACK` : **OK** pour les cinq rôles. Le compte local ne lit plus les données historiques des sept tables protégées, et le Super Administrateur ainsi que les rôles `teacher`, `student` et `parent` conservent leur visibilité historique. **Seules les 8 expressions RLS ciblées ont été modifiées durablement.**

Fichier de recette : `supabase/verification/20261110_school_admin_legacy_fence_assertions.sql`.

> Attention : ce correctif empêche une exposition **legacy au nouveau rôle local**, mais **n'est pas une politique multi-tenant générale**. Les enseignants, apprenants et parents futurs nécessitent eux aussi des droits dépendant de l'établissement et de leur relation réelle avec les cours. Ne pas considérer la sécurisation complète comme terminée après cette phase.

### Contrôle post-activation du 10 novembre 2026

- **34 migrations Supabase** ; version exacte `20261110141631`.
- **8 politiques RLS sur 7 tables** durcies ; nombre de politiques inchangé (**194**).
- **5 rôles testés sur la base active**, sans écriture : `admin`, `school_admin`, `teacher`, `student`, `parent`. Résultat : **PASS**.
- **2 écoles, 1 administrateur local, 1 invitation, 2 classes et 2 inscriptions historiques** conservés.
- **Aucune modification Vercel**, de bucket Storage ou des migrations 5.D / sécurité des évaluations.
- Le Supabase Security Advisor ne signale aucune nouvelle catégorie d'avertissement ; les anciens avis sur les fonctions `SECURITY DEFINER`, la configuration des chemins de recherche et la protection contre les mots de passe divulgués demeurent.

## 5. Modèle de données cible, sans duplication

### 5.1. Référentiels communs, comptes et relations familiales

- `auth.users` / `profiles` restent **globaux**. Un utilisateur ne possède pas un compte par école.
- `parent_links` reste la relation parent-enfant vérifiée, **indépendante d'une école**, mais la visibilité du dossier scolaire doit dépendre de l'enfant, du rattachement et des autorisations.
- `levels`, `academic_subjects`, catalogue public et plateforme peuvent rester référentiels globaux.
- `schoolnet_schools` représente le tenant ; `schoolnet_school_memberships` lie un utilisateur à une école avec un rôle local.

**Limite actuelle :** `schoolnet_school_memberships` a une unicité sur `(school_id,user_id)` avec un seul `member_role`. `profiles.role` est aussi unique par compte. Le cas d'un enseignant qui est également parent dans la même école devra être traité dans une future évolution d'habilitations multi-rôles, sans changer silencieusement le rôle d'un compte existant.

### 5.2. Tables à attacher explicitement à une école

| Racine métier | Tables dépendantes à sécuriser ensemble | Règle |
|---|---|---|
| Classes officielles | `classes`, `class_students`, `class_teachers`, `class_subject_settings` | Chaque classe scolaire a une école ; affectations cohérentes avec cette école |
| Inscriptions scolaires | `student_enrollments`, `student_enrollment_events`, `student_enrollment_documents` | École déduite d'un lien explicite à la classe, jamais du nom de l'élève |
| Année scolaire | `school_years`, `grading_periods` | Séparer le calendrier/référentiel commun de l'état de l'année propre à chaque école |
| Pédagogie d'école | `courses`, `course_sections`, `course_teachers`, `course_subjects`, `course_enrollments`, `resources` | L'établissement d'un cours scolaire doit correspondre à celui de sa classe |
| Présences | `attendance_sessions`, `attendance_records`, `attendance_justifications` | Lire/écrire seulement pour une classe autorisée |
| Planning | `rooms`, `timetable_slots`, `live_sessions` | Salles, créneaux et séances doivent appartenir au bon contexte |
| Évaluations | `assessments`, `assessment_submissions`, `submissions`, `submission_answers`, `homework_submissions`, `submission_files`, `submission_question_grades`, `assessment_average_settings` | Hériter des droits de la classe/du cours, sans divulguer les travaux d'autrui |
| Bulletins / notes | `report_cards`, `report_card_subjects` et vues de moyennes | Contrôle classe + année + élève + publication |
| Communication | `class_posts`, `class_post_reads`, chat, `notifications` | Respecter les destinataires et éviter toute recherche d'un membre d'une autre école |

Les tables `classes`, `courses` et `student_enrollments` ne possèdent pas encore de colonne `school_id`. Les inscriptions ont un `class_id`, et les cours peuvent être sans classe ; **ne pas en déduire automatiquement qu'un cours sans classe est libre**.

### 5.3. Préserver les apprenants libres et les cours à domicile

**Interdiction de rattacher les anciennes classes à « École Test SCHOOLNET » ou à « Collège Test Code Auto » sans vérification.**

Pour l'évolution :
- prévoir un **contexte explicite** pour une classe ou un cours (`school`, `free`, `home_tutoring`, `legacy_unclassified`) ;
- distinguer **classe officielle** et **groupe pédagogique libre**, sans réécrire le passé ;
- un cours à domicile pourra être ajouté à l'emploi du temps de l'apprenant sans devenir un dossier d'inscription officielle ;
- documenter les contraintes de compatibilité classe → cours → inscription, pour refuser tout rattachement à une autre école.

La migration réelle des données historiques doit être précédée d'un inventaire et d'une décision métier, pas d'une mise à jour massive par défaut.

## 6. Risque spécifique — Stockage des fichiers

| Bucket | Visibilité actuelle | Objets (audit) | Action avant production multi-écoles |
|---|---|---:|---|
| `homework-submissions` | **Public** | 4 | Étudier migration vers stockage privé, vérifier l'identité du propriétaire et les destinataires |
| `assessment-instructions` | **Public** | 13 | Protéger les consignes et documents qui ne sont pas destinés au public |
| `course-resources` | **Public** | 3 | Distinguer ressources libres/publiques et contenus réservés à une classe |
| `student-enrollment-documents` | Privé | 0 | Conserver les règles restrictives et les étendre à l'école autorisée |
| `schoolnet-profile-avatars` | Privé | 1 | Conserver l'accès nominatif existant |
| `public-library` | Public | 2 | Visibilité volontairement publique |

**Attention :** une policy RLS restrictive sur `storage.objects` ne privatise pas un bucket déjà public. Un lien public connu peut accéder au fichier sans authentification. La protection exige un bucket privé, un chemin / une policy adaptés, et éventuellement des **URLs signées à durée limitée**. Ne pas rendre un bucket existant privé avant d'avoir adapté les fonctionnalités qui utilisent ses URLs.

## 7. Fonctions, vues et autres points d'entrée

- Les **5 vues de calcul** utilisent `security_invoker=true` : favorable, mais leur exposition reste liée aux RLS des tables de données sources.
- Environ **115 fonctions `SECURITY DEFINER`** sont exécutables par `authenticated` et **53** le sont également par `anon`. Ce sont des périmètres à **examiner individuellement** : une permission d'exécution à elle seule ne démontre pas une faille si la fonction vérifie explicitement l'identité et les droits.
- Tous les RPC administratifs historiques (`admin_...`, inscription annuelle, calculs, publication, présence, messagerie) doivent être vérifiés avant de donner de nouveaux droits à `school_admin`.
- Conserver le principe **refus par défaut**. Ne jamais accorder globalement `is_admin() = true` à `school_admin`.
- Les Edge Functions qui emploient `service_role` doivent vérifier rôle, établissement, ressource ciblée et autorisation côté serveur.

## 8. Feuille de route technique (proposée)

### Lot S1 — Protection immédiate des données historiques
Préparer, tester et, **après autorisation**, appliquer le correctif RLS limité au rôle `school_admin`. Vérifier les cinq rôles et l'absence de régression sur les parcours historiques.

### Lot S2 — Ancrage des classes et des affectations
Introduire un rattachement explicite d'école pour les nouvelles classes officielles, sans reclasser automatiquement les classes historiques ; faire respecter toutes les relations et les écritures par des RPC et des contraintes cohérentes. Ouvrir en premier **Classes** pour l'admin local, sans permettre encore l'accès aux notes ou aux dossiers.

### Lot S3 — Utilisateurs et inscriptions par école
Permettre l'invitation assistée des enseignants, élèves et parents, puis la gestion des inscriptions annuelles, en préservant le compte unique et les `parent_links` vérifiés.

### Lot S4 — Notes, présences, salles, horaires, communication
Étendre l'isolation à toute la chaîne de données et aux appels RPC ; réaliser les tests à deux établissements (A/B), dont essais d'accès direct via l'API. Chaque module est ouvert seulement après sa recette ciblée.

### Lot S5 — Stockage privé, ressources et modes libres / domicile
Protéger les fichiers personnels, distinguer ressources publiques et privées, finaliser les groupes libres et les séances à domicile. Éviter toute régression des téléchargements existants.

## 9. Matrice de recette obligatoire

| Cas | Super Admin | Admin école A | Admin école B | Enseignant / Élève / Parent |
|---|---|---|---|---|
| Liste des écoles | Toutes | A seulement | B seulement | Selon appartenance |
| Créer une classe de A | Autorisé | Autorisé à terme | **Refusé** | Refusé sauf fonction explicitement déléguée |
| Lire les élèves de A | Selon droit central | A seulement | **Refusé** | Selon affectation et lien vérifié |
| Modifier une inscription de B | Selon droit central | **Refusé** | B seulement | Refusé par défaut |
| Notes / bulletins A | Selon autorisation | A seulement, après activation | **Refusé** | Uniquement les données autorisées |
| Cours et groupes libres | Selon fonction centrale | Pas d'accès global par défaut | Pas d'accès global par défaut | Selon inscription libre réelle |
| Documents personnels | Selon autorisation | École et dossier autorisés | **Refusé** | Propriétaire / responsable / enseignant habilité |

Tests d'attaque à prévoir : URL directe, requête REST avec UUID d'une autre école, changement du `school_id` dans le corps d'une requête, plusieurs écoles pour le même compte, révoquer l'appartenance, inviter un compte existant, contourner la validation des parents et lire un fichier par lien public.

## 10. Restrictions opérationnelles

**La migration RLS ciblée a été appliquée après l'audit sur autorisation.** Aucune ligne de données, aucun compte et aucune inscription historique n'ont été modifiés ; l'intégrité a été vérifiée après activation : 34 migrations, 2 établissements, 1 rattachement local, 1 invitation et 2 classes historiques. Les autres protections de l'architecture cible restent à développer.

Ne pas lancer `supabase db push --remote` global : les migrations distinctes du Lot 5.D et du durcissement des évaluations ne sont pas encore autorisées. Ne pas fusionner la PR #6 ni modifier Vercel Production sans validation explicite.

Sources techniques : [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) ; [Supabase — Secure API](https://supabase.com/docs/guides/api/securing-your-api) ; [Supabase — Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
