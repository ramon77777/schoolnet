# SCHOOLNET — Lot 5D-D : compatibilité réelle, concurrence et passerelle Admin

**Date :** 18 novembre 2026  
**Statut :** AUDIT TECHNIQUE EN LECTURE SEULE + BANC DE TEST ISOLÉ (non déployé)  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**.  
**Limite :** aucune écriture vers Supabase principal, aucune installation de migration, aucun changement Auth, Storage, `main` ou Vercel.

## 1. Vérification du schéma réel (via SELECT sur Supabase principal)

Les vérifications ont lu `information_schema.columns`, `pg_constraint`,
`pg_trigger`, `pg_proc`, `pg_policies`, `pg_indexes` et les définitions
des fonctions. **Aucune donnée personnelle** n'est reproduite ici.

| Objet réel | Contrat observé | Incidence sur 5D |
| --- | --- | --- |
| `school_years` | `id uuid`, `name text`, `starts_on`, `ends_on`, `is_current`, index unique partiel de l'année courante, trigger `set_updated_at` | Garder une seule année courante, éviter la RPC directe |
| `student_enrollments` | `id uuid`, `student_id`, `school_year_id`, `class_id`, `status public.student_enrollment_status`, `enrollment_number text NOT NULL` sans défaut SQL | **Le trigger `prepare_student_enrollment` crée le numéro** ; il doit rester opérationnel pour les nouvelles inscriptions |
| `student_enrollments_student_year_key` | Unicité `(student_id,school_year_id)` | Interdire tout second dossier cible, même brouillon ; ne pas tenter d'upsert caché |
| `trg_prepare_student_enrollment` | Vérifie rôle étudiant, cohérence classe/année et génère `INS-YYYY-xxxxxx` via séquence | Le finaliseur appelle ce trigger lors de l'INSERT cible |
| `trg_log_student_enrollment_event` | Événements `created`, `class_changed`, `status_changed` | La clôture source et l'inscription cible génèrent deux événements, sans les supprimer |
| `classes` | `level_id bigint`, `school_year text`, `school_year_id uuid?`, `learning_context`, `school_id uuid?` | Classes officielles `school` séparées du contexte `legacy_unclassified` |
| `class_students` | Clé unique `(class_id,student_id)`, triggers de rôle étudiant et de **classe unique par année** | Préserver l'ancienne classe (année précédente), vérifier que la nouvelle n'est pas doublonnée pour l'année cible |
| `ensure_student_single_class_per_school_year` | Compare `classes.school_year` (texte) pour les autres liens de l'élève | Une divergence entre les années `school_year` et `school_year_id` est un risque bloquant à contrôler |
| `profiles` | `role public.user_role`, `class_name`, `child_ids`, déclencheur de protection des champs sensibles | Ne changer que `class_name` dans le contexte legacy et conserver `child_ids` |
| `schoolnet_school_*_assignments` | Tables officielles avec `school_year_id`, `school_id`, triggers d'intégrité et RLS | Pas de changement automatique des affectations officielles S3-C |
| `admin_set_current_school_year(uuid)` | `SECURITY DEFINER`, `authenticated` possède EXECUTE, et la RPC **n'impose pas la clôture des dossiers** | Encore accessible côté SQL tant que le garde 5D n'est pas installé ; pas d'appel en production |
| `get_admin_student_enrollments` | Jointures sur `student_enrollments`, `classes`, `school_years`, filtre par année | Historique d'inscription conservé indépendamment des liens de classe |
| `class_students` RLS | Les enseignants voient les élèves selon leurs classes ; les parents selon leur lien vérifié | L'ancien lien conservé pourra rester visible pour les anciennes classes : recette UX métier nécessaire |

État technique toujours observé lors de l'audit : **43 migrations**, une année
courante 2025–2026, un dossier actif en source, **un dossier cible déjà présent**
en 2026–2027 concernant un autre apprenant, aucune table `school_year_rollover_runs`
installée. **Aucun changement de données**.

### Risques identifiés

**C1 — Historique de classes** : le finaliseur conserve `class_students`
pour l'année source et ajoute un nouveau lien pour la destination. C'est
cohérent avec le trigger « une classe par année » (qui compare
`classes.school_year`), **mais pas une garantie que tous les écrans
ne présenteront que la classe active**. Les pages Parent et Enseignant
sont à contrôler en particulier. La page Parent `Mes enfants` utilise
`class_students.created_at` pour montrer une **dernière classe enregistrée**,
et non une inscription annuelle vérifiée. Le libellé doit rester explicite.

**C2 — Différence de fixtures** : le banc SQL initial imitait les tables,
mais pas les triggers `class_students` du projet réel. Le schéma fictif
est renforcé avec une version synthétique de ces contrôles.
Les tests restent **une validation partielle** : ne pas affirmer une parfaite
compatibilité au schéma réel sans banc fidèle de migrations.

**C3 — Anciennes fonctions** : `admin_upsert_student_enrollment` et
`admin_set_student_enrollment_status` peuvent modifier les liens
`class_students` et `profiles.class_name`. Une concurrence entre ces
fonctions et le futur finaliseur doit être évaluée avant tout GO SQL.
La proposition 5D-A+B n'utilise pas ces RPC.

**C4 — Droits et exposition** : les nouvelles fonctions SQL sont dans
`schoolnet_private` et n'ont pas de `GRANT EXECUTE` vers
`anon`, `authenticated` ou `service_role`. Le client React ne peut
donc pas simplement appeler `supabase.rpc(...)` pour ces fonctions.
La future passerelle doit être un composant **serveur distinct**.

**C5 — Métier non résolu** : 2026–2027 possède déjà un dossier actif.
Conformément à la règle 5D-A+B v1, **tous** les dossiers cible,
indépendamment de leur statut, doivent bloquer le changement d'année.
Aucun « nettoyage » ni régularisation automatique n'est autorisé.

## 2. Recette supplémentaire en PostgreSQL 17 isolé

Scripts de la PR #15 :

- `scripts/lot5d/schema_compatibility_postgresql17.sql` :
  classe unique par année, rôle étudiant et conservation du lien historique.
- `scripts/lot5d/concurrency_prepare.sql` puis
  `concurrency_session_a.sql` et `concurrency_session_b.sql` :
  **deux connexions PostgreSQL réelles**. La session A finalise et garde
  la transaction ouverte ; la session B doit échouer avec `lock timeout`.
- `scripts/lot5d/concurrency_postcheck.sql` :
  une seule exécution validée, une seule inscription cible, un journal unique,
  aucune perte d'historique, **rejeu idempotent** et refus d'une autre clé.
- `scripts/lot5d/authorization_postgresql17.sql` :
  rôle étudiant : aucun journal visible et fonction privée inexécutable ;
  rôle Admin vérifié : journal visible, changement direct d'année toujours
  impossible ; anonyme : accès à la fonction privée refusé.
- `scripts/lot5d/run_concurrency_postgresql17.sh` :
  **uniquement** base CI `schoolnet_lot5d_ci` sur `127.0.0.1` et rôle
  PostgreSQL `postgres`; arrêt si des variables de connexion production sont
  détectées. Un deuxième job ne doit pas copier de données Supabase réelles.

Le test de concurrence exploite une pause volontaire dans une transaction,
puis confirme qu'une seconde connexion est bloquée par les verrous de table
jusqu'au délai prévu. Ce résultat ne prouve **pas encore** l'absence de
deadlocks avec **toutes** les anciennes RPC et opérations d'école.

**Résultat vérifié :** les deux jobs GitHub Actions sont **SUCCESS**
(run [#44322527431](https://github.com/ramon77777/schoolnet/actions/runs/44322527431),
commit `dd3bc707`). Le job PostgreSQL 17 a testé les 18 cas précédents,
les protections classes/années, les **deux sessions concurrentes**,
l'idempotence après conflit, et les permissions simulées
`anon` / élève / Admin. Le job qualité a réussi avec
`qa:lot5d:d` (15 tests statiques), lint, build et tests existants.

**Recette locale D de l'utilisateur : réussie (15/15)**, lint 0 erreur (1 warning historique), build Vite réussi et fast-forward Git sans conflit. Les fichiers locaux hors suivi sont préservés.
Le succès sur fixtures synthétiques **n'établit pas** la compatibilité
exhaustive avec le vrai schéma SQL.

## 3. Passerelle Admin : architecture à préparer, sans endpoint actif

```text
Navigateur SCHOOLNET (Super Admin authentifié)
  | POST /api/school-year-rollover/...  (non créé)
  | Bearer token, origine officielle exacte, JSON strict, UUID d'opération
  v
Backend Admin 5D (NON DÉPLOYÉ)
  | Auth : vérifier réellement le JWT avec Supabase Auth (getUser)
  | Autorisation : contrôler profil.role=admin DANS LA BASE
  | Vérifier origine officielle, méthode, corps de requête, rate limit
  | Rejeter preview/localhost, rôles non admins et session non vérifiée
  | Créer une connexion SQL avec IDENTITÉ SERVEUR dédiée et privilèges minimaux
  | BEGIN; SET LOCAL request.jwt.claim.sub = UUID utilisateur VERIFIÉ
  | Appeler UNIQUEMENT la fonction privée / contrôler le résultat; COMMIT
  v
PostgreSQL privé schoolnet_private (NON INSTALLÉ)
  | save_lot5d_legacy_decision / finalize_lot5d_legacy_year
  | verrous, rôles, contraintes, journal, idempotence, rollback intégral
  v
Tables legacy / année globale / audit
```

L'API n'existe **pas encore**. Le projet fourni ne reçoit **aucun** nouveau
endpoint `/api` fonctionnel, aucune variable de connexion SQL, aucune
clé `service_role` dans le navigateur et aucune migration de rôle SQL.

### Règles strictes du futur backend

1. **Identité côté serveur** : confirmer le token auprès de Supabase Auth,
   et s'assurer que `sub` est un utilisateur actif. Ne jamais se fier aux
   champs `role`, `actor_id`, `is_admin` envoyés dans le JSON ou au
   JWT `user_metadata` modifiable par le client.
2. **Session et permissions** : confirmer le rôle Admin global depuis
   `profiles` sous contexte vérifié, éventuellement vérifier `session_id`
   actif pour opération critique. Les `school_admin` d'établissement
   ne gèrent **pas** automatiquement le calendrier global.
3. **Origine et requête** : uniquement l'URL de production canonique,
   POST, `application/json`, schéma strict, identifiant d'opération UUID
   fourni par le serveur ou durablement contrôlé, confirmation exacte
   du nom d'année et limite de débit. Un simple CORS n'est pas une authentification.
4. **Exécution SQL** : connexion dédiée à privilèges minimaux, secret
   seulement dans l'hébergement serveur, rôle exécuteur SQL autorisé
   **uniquement après migration approuvée**. Ne pas attribuer les
   permissions privées à `anon`, `authenticated` ou `service_role`.
   La variable de session `auth.uid()` doit provenir **exclusivement**
   de l'utilisateur vérifié côté serveur dans une transaction dédiée.
5. **Réponse** : retourner uniquement l'état d'opération autorisée,
   sans données familiales sensibles ni détails de fonctions SQL.
   Audit complet stocké en base avec idempotence.
6. **Bascule de sécurité** : par défaut l'opération est **fermée**,
   et le serveur doit refuser même si un flag client est fabriqué.
   Aucun test Preview, local ou sandbox ne doit ouvrir la production.
7. **Échec complet** : erreur ou perte de connexion = transaction
   annulée, pas d'état partiel. Le retry doit utiliser le **même**
   identifiant d'opération après vérification de l'état du journal.

### Points non tranchés à valider séparément

- Hébergement et mode de connexion privée de cette future passerelle.
- Définition d'un rôle SQL exécuteur et preuve des privilèges minimaux.
- Compatibilité réelle avec tous les triggers, RLS, vues et anciennes RPC,
  puis scénarios de concurrence croisée.
- Politique métier pour dossiers cible déjà ouverts et calendrier des écoles.
- Recette UX complète des liens historiques, bulletins et profils Parent.

## 4. Séquence de validation et statuts

| Étape | Statut |
| --- | --- |
| QA locale A 9/9, B 17/17, C 12/12 | **Validé par l'utilisateur le 18/11/2026** |
| Première intégration SQL fictive 18/18 (CI) | **Réussie**, run #44317583860 |
| Audit de compatibilité avec vrai schéma (SELECT uniquement) | **Effectué** |
| Nouvelle CI avec 2 sessions, rôles et garde classe | **Réussie**, run #44322527431, schéma fictif |
| Contrat mock Admin : 15 tests statiques | **Réussi en CI**, non déployé |
| Recette locale `qa:lot5d:d` de l'utilisateur | **Validée 15/15**, 18/11/2026 ; lint 0 erreur, build réussi |
| Revue métier et dossier actif dans année cible | **À faire** |
| Passerelle backend Admin, migration canonique et tests proches du réel | **Non implémentés / prochain GO distinct** |
| Installation Supabase principal, merge main, Vercel | **Interdits sans autorisation spécifique** |

**Conservation des sauvegardes :** ne pas effacer les fichiers locaux non
suivis ni `tsconfig.app.tsbuildinfo`; garder la PR #15 en brouillon.
