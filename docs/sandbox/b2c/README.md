# SCHOOLNET — Lot 5.C-B.2 / Étape 2.C — Bilan de la migration SANDBOX

**Date : 13 novembre 2026**  
**État : migration créée, appliquée dans la sandbox, tests SQL réussis.**  
**Environnement unique :** `schoolnet-auth-sandbox`, projet Supabase `onqlsvphmrqhelislpry`.  
**Migration Supabase enregistrée :** `20261113085705_schoolnet_student_identity_b2c_private_sandbox`.

> **Ne jamais appliquer automatiquement cette migration au projet principal.** Le script est volontairement stocké dans `docs/sandbox/b2c/`, et non dans `supabase/migrations/`. Aucun merge sur `main` ni déploiement Vercel n'est autorisé par ce bilan.

## 1. Objet et structure

La migration `schoolnet_student_identity_sandbox.sql` crée le schéma privé `schoolnet_student_private` et la table `identities`. Chaque ligne associe exactement un `auth.users.id` à une empreinte de code SCHOOLNET HMAC-SHA256 et à un téléphone familial au format E.164.

Champs : `student_auth_user_id` (PK + FK Auth, suppression RESTRICT), `schoolnet_code_hmac` (hexadécimal 64 caractères, UNIQUE), `family_phone_e164` (E.164, non UNIQUE), `login_status` (pending par défaut, enabled, suspended, revoked), `created_at`, `updated_at`, `activated_at` et `revoked_at`.

- Le code `SN-XXXX-XXXX-XXXX` **n'est jamais conservé en clair**. Le HMAC sera calculé côté serveur avec un secret distinct, non présent dans GitHub ni dans la base. **Aucune vraie empreinte n'a encore été calculée ou enregistrée.**
- Le téléphone familial n'est pas l'identifiant `auth.users.phone` des apprenants : plusieurs enfants peuvent partager ce numéro.
- Le statut initial `pending` n'autorise **pas** la connexion métier. `enabled` ne sera accordé par le backend qu'après la chaîne de preuves validée.
- Le déclencheur `SECURITY INVOKER` empêche de modifier l'ID Auth, le HMAC initial ou les horodatages immuables, de réinitialiser une révocation et d'utiliser des transitions de statut interdites.
- Aucune table publique, aucun profil réel, aucun compte Auth, aucune inscription ni invitation n'ont été modifiés.

## 2. Autorisations vérifiées

| Contrôle | Résultat |
| --- | --- |
| Schéma accessible à `anon` | NON |
| Schéma accessible à `authenticated` | NON |
| Schéma accessible à `service_role` | OUI |
| `anon` / `authenticated` peuvent lire la table | NON / NON |
| `service_role` peut SELECT / INSERT / UPDATE | OUI / OUI / OUI |
| `service_role` peut DELETE | NON |
| RLS activée / forcée | OUI / OUI |
| Policies publiques | 0 (fermeture voulue) |
| Fonction `SECURITY DEFINER` créée | NON |

La table est dans un **schéma non exposé**. Pour l'étape backend, il faudra concevoir un accès serveur explicitement autorisé ; ne pas élargir les droits REST ou RLS pour « faire marcher » le frontend.

## 3. Recette SQL exécutée — aucune donnée de test persistante

Un bloc `DO` PostgreSQL avec sous-transaction annulée à la fin a vérifié :

1. Insertion temporaire de deux comptes Auth B2B fictifs avec **le même téléphone familial**.
2. Absence d'activation implicite : tous deux restent `pending`.
3. Refus d'un second enregistrement pour un même `auth.users.id`.
4. Refus d'un HMAC déjà associé à un autre compte Auth.
5. Refus d'un HMAC de format invalide.
6. Refus d'un numéro non conforme E.164.
7. Refus d'un UUID absent de `auth.users`.
8. Refus d'une activation sans horodatage cohérent.
9. Refus de remplacer l'empreinte de code initiale.
10. Refus de réactiver une identité révoquée.
11. **Annulation complète** des données temporaires : **0 ligne** enregistrée.

Résultat SQL : `PASS` ; après la recette, `identities = 0`, `auth.users = 4`, dont `2` comptes B2B.

## 4. Contrôle du projet principal — lecture seule

Projet `anttmbhaphkhmkoqsofd` :
- 11 comptes Supabase Auth, inchangés.
- 1 invitation Parent activée, inchangée.
- 0 invitation Apprenant créée.
- Schéma `schoolnet_student_private` **absent**.

Yao Thierno reste activé. Aucun compte Apprenant réel ni lien familial n'a été créé pour Yao Tabra.

## 5. Avertissements du Security Advisor

- `rls_enabled_no_policy` **INFO** : attendu pour les tables privées volontairement fermées, y compris la nouvelle table. [Documentation de l'avis](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- `auth_leaked_password_protection` **WARN** : déjà présent avant l'étape 2.C ; non résolu, à traiter avant la mise en production. [Guide](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- `unindexed_foreign_keys` **INFO** concerne une ancienne table de preuves de la sandbox, non la nouvelle table. [Guide](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## 6. Limites et suite

Cette étape valide le **schéma de correspondance protégé**, pas l'authentification `téléphone + code + mot de passe`. Les deux comptes B2B Auth existent, mais la nouvelle table reste vide, par choix de sécurité. La contrainte de rôle `student` n'est pas vérifiable par une FK vers `profiles` dans cette sandbox qui ne contient pas les tables métier : le futur backend devra vérifier cette condition à partir d'une source autorisée.

**Étape 2.D proposée, après validation distincte :** implémenter un service d'enregistrement et de résolution d'identité scolaire avec clé HMAC conservée dans les secrets serveur, contrôle du rôle réel, rate limiting atomique, gestion du mot de passe exclusivement par Supabase Auth, réponses anti-énumération, et journal d'audit sans secret. Le premier rattachement à `Mes enfants` attendra les validations séparées de l'invitation et de la parenté.

## Fichiers de cette étape
- `docs/sandbox/b2c/schoolnet_student_identity_sandbox.sql` — SQL appliqué dans la sandbox.
- `docs/sandbox/b2c/verification_read_only.sql` — requêtes de vérification non mutantes.
