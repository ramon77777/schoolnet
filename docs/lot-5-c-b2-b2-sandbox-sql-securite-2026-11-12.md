> **Suite du 12/11/2026 — B.3 AUTH RÉELLE EN SANDBOX RÉUSSIE.** Après GO distinct B.3, deux comptes fictifs Parent/Apprenant ont été créés avec succès dans `onqlsvphmrqhelislpry` et utilisés pour tester connexion, récupération, changement de mot de passe et rejeu de token ; aucun email d'invitation n'a été demandé. **Les deux tables privées B.2 demeurent à 0 cas et 0 événement**, sans confirmation d'activation. L'orchestrateur Edge temporaire a été neutralisé (v2, `verify_jwt=true`). Voir [rapport B.3](./lot-5-c-b2-b3-sandbox-auth-first-login-2026-11-12.md). Principal inchangé ; B.2 reste correctement isolée et fermée.

# SCHOOLNET — Lot 5.C-B.2 / Phase B.2
## Recette du schéma SQL privé de la sandbox Auth — 12 novembre 2026

**ÉTAT : PHASE B.2 EXÉCUTÉE ET VALIDÉE DANS LA SANDBOX UNIQUEMENT.**
**Autorisation reçue :** créer les premières tables de test, leurs protections RLS et exécuter une recette annulée par `ROLLBACK` ; sans créer de compte Auth, d'e-mail ou de lien.

### 1. Cible contrôlée

| Périmètre | Référence projet | Opérations réalisées |
| --- | --- | --- |
| **Sandbox** `schoolnet-auth-sandbox` | **`onqlsvphmrqhelislpry`** | Création d'un schéma privé, 2 tables, 1 trigger d'immutabilité, contrôles SQL |
| **Principal** `schoolnet_2.0` | **`anttmbhaphkhmkoqsofd`** | **Lectures de contrôle uniquement. AUCUNE écriture.** |

Avant la migration, la sandbox était `ACTIVE_HEALTHY` avec 0 compte Auth, 0 table publique et 0 migration. La migration cible un identifiant **explicite**, distinct du projet principal. Le SQL contient en plus une garde : il échoue si `public.profiles` ou `public.schoolnet_family_invitation_records` est présent, ou si le schéma de recette existe déjà.

### 2. Livraison SQL versionnée, non auto-déployable en production

- **Schéma exact :** [`docs/sql/lot_5_c_b2_b2_SANDBOX_ONLY_private_schema.sql`](./sql/lot_5_c_b2_b2_SANDBOX_ONLY_private_schema.sql)
- **Tests transactionnels exacts :** [`docs/sql/lot_5_c_b2_b2_SANDBOX_ONLY_rollback_tests.sql`](./sql/lot_5_c_b2_b2_SANDBOX_ONLY_rollback_tests.sql)
- Les fichiers sont volontairement dans **`docs/sql` et NON dans `supabase/migrations`** du produit. Ainsi, un déploiement futur normal de SCHOOLNET ne peut pas les appliquer implicitement au projet principal.
- Appliqué au projet sandbox via la migration distante nommée `schoolnet_auth_sandbox_b2_private_evidence`.
- Historique distant sandbox : **version `20261112085040`**, seule migration dans ce projet au contrôle final.

### 3. Objet des deux tables

| Table privée | Utilité et protections |
| --- | --- |
| `schoolnet_auth_sandbox.invitation_cases` | Dossiers fictifs de transmission Parent/Apprenant, `request_id`, `recipient`, `generation_count`, `expected_auth_user_id` synthétique, `case_status` (uniquement `prepared`, `sent_declared`, `requires_review`). Aucune FK à `auth.users` : aucun compte Auth créé. |
| `schoolnet_auth_sandbox.activation_evidence_events` | Événements fictifs `delivery_declared`, `password_changed`, `password_login` ; provenance obligatoire `synthetic_*`, preuve `proof_verified=false` contrainte en base, clé composite vers le dossier/génération/utilisateur, identifiant source unique et cohérence temporelle. |

**AUCUN état `activated` n'est autorisé dans cette version B.2.** Les événements ne sont pas de vrais événements Auth et ne peuvent pas prouver l'activation d'une famille.

### 4. Sécurité des privilèges

Contrôles de catalogue PostgreSQL après installation :

- **RLS = true, FORCE RLS = true** sur les deux tables.
- **0 politique RLS**, donc refus volontaire pour les rôles ordinaires ; il ne faut PAS ajouter de politique `USING(true)`.
- `anon`, `authenticated`, `service_role`, `authenticator` et `PUBLIC` n'ont aucun accès explicite au schéma.
- `has_table_privilege(..., 'SELECT') = false` pour `anon`, `authenticated`, `service_role`. `service_role` n'a pas davantage `INSERT` ou `UPDATE` sur les tables.
- La fonction privée `reject_evidence_mutation()` est **`SECURITY INVOKER`**, non `SECURITY DEFINER`, et ne peut pas être exécutée directement par les rôles ci-dessus.
- Trigger `b2_evidence_append_only` : `UPDATE` et `DELETE` refusés pour le journal de preuves, même lors du test privilégié.
- Aucune table en `public`, aucun accès REST/RPC ajouté, aucun secret, lien, mot de passe, email ou JWT conservé.

**Résultat Security Advisor :** un seul avis **`rls_enabled_no_policy` de niveau INFO**. Il est **attendu et intentionnel** pour deux tables privées complètement fermées. Pas de règle publique ouverte ni de privilège additionnel autorisé. Les futurs besoins d'accès exigeront une revue distincte.

### 5. Neuf scénarios transactionnels exécutés avec ROLLBACK

Une première exécution a arrêté le scénario de mauvaise identité : le test utilisait une paire dossier/génération/type d'événement déjà occupée, déclenchant l'unicité avant la clé étrangère. L'exécution s'est annulée et le contrôle suivant a trouvé **0 ligne restante**. Le test a été corrigé en ajoutant un deuxième dossier synthétique distinct, sans événement. **La seconde exécution a réussi intégralement.**

| N° | Cas contrôlé | Résultat |
| --- | --- | --- |
| 1 | Deux dossiers avec même demande / destinataire / génération | Refus doublon |
| 2 | Preuve liée à un `auth_user_id` différent | Refus clé étrangère composite |
| 3 | Passage de dossier au statut `activated` | Refus CHECK |
| 4 | Preuve déclarée `proof_verified=true` | Refus CHECK |
| 5 | Type de preuve et source non cohérents | Refus CHECK |
| 6 | Date d'événement excessive dans le futur | Refus CHECK |
| 7 | Modification d'un événement enregistré | Refus trigger |
| 8 | Suppression d'un événement enregistré | Refus trigger |
| 9 | Deux mêmes types de preuves sur le même dossier/génération | Refus unicité |

La transaction insère temporairement **2 dossiers et 3 événements synthétiques**, exécute et valide les 9 protections puis **`ROLLBACK`**. Le contrôle indépendant suivant confirme que les lignes ont bien disparu.

### 6. État final vérifié après les tests

| Contrôle | Sandbox | Principal |
| --- | --- | --- |
| Comptes Auth | **0** | **10** |
| Dossiers synthétiques | **0** | Sans objet |
| Événements synthétiques | **0** | Sans objet |
| Tables publiques ajoutées | **0** | Aucun ajout |
| Migrations | **1** (B.2) | **35** (inchangé) |
| Invitations familiales réelles | Aucune | **0** |
| Événements d'invitation réels | Aucune | **0** |
| Fonction familiale | Aucune Edge Function ajoutée | **v2**, `ACTIVE`, `verify_jwt=true` |
| Demande fictive `DEM-3CF7B169BAD9` | Absente | Statut `new`, inchangé |

Le schéma et les protections restent installés dans la sandbox, **mais toutes les données synthétiques du test ont été annulées**. Aucun compte Auth ni lien n'a jamais été créé par B.2.

### 7. Retour arrière et étapes suivantes

**Rollback des données de test : effectué** par `ROLLBACK`, vérifié par comptages à zéro.

**Rollback du schéma : non effectué et non autorisé implicitement.** S'il devenait nécessaire, il faudrait approuver une nouvelle opération ciblée sur le seul projet `onqlsvphmrqhelislpry`, examiner les dépendances, gérer l'historique de migration et procéder en toute sécurité. Ne pas supprimer de tables de manière automatique.

**B.3 nécessitera une autorisation distincte** pour des comptes Auth fictifs, des e-mails de test réellement contrôlés, la création de liens et les essais de récupération/connexion dans la sandbox. Avant ce GO : déterminer une source de preuves compatible Supabase Free, conserver l'interdiction de déclarer `activated` sans preuve réelle et revoir le flux `family-invite`.

**Aucune modification du frontend, aucune synchronisation locale obligatoire, aucune migration sur SCHOOLNET principal, aucune fusion de la PR #6 ni aucun déploiement Vercel n'a été effectué pour B.2.**
