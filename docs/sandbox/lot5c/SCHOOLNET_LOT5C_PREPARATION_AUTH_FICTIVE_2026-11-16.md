# SCHOOLNET — Lot 5.C : préparation Auth fictive dans la sandbox

**Date :** 16 novembre 2026. **Périmètre exclusif :** projet Supabase `schoolnet-auth-sandbox` (`onqlsvphmrqhelislpry`). Aucune intervention sur `schoolnet_2.0`.

## Résultat de la première préparation

La procédure de préparation a été exécutée une seule fois depuis GitHub Actions, à l'aide d'un jeton OIDC GitHub vérifié cryptographiquement par la fonction Edge sandbox. Le contrôle de la signature, de l'émetteur, de l'audience, du dépôt, de la branche et du workflow a été effectué avant toute mutation.

Vérification après exécution :

| Contrôle | Résultat |
|---|---|
| Total Auth sandbox avant / après | 4 / 7 |
| Nouveaux comptes Auth marqués `schoolnet_lot5c_fixture` | 3 (Admin, Parent, Apprenant) |
| Vérifications de connexion Auth avec mots de passe temporaires | Réussies |
| Nouveaux profils `public.profiles` | 3 |
| Demande fictive | 1 : `DEM-L5C-SBX-TEST01` |
| Invitation Parent | 1, statut `prepared` |
| Réservation Apprenant sans e-mail | 1, statut `auth_created` |
| Code scolaire HMAC généré / invitation remise | Non / Non |
| Compte Apprenant activé | 0 |
| Liens Parent–Enfant créés | 0 |
| Éléments `child_ids` dans le Parent | 0 |
| Envoi d'e-mail | Aucun demandé |

Le Parent et l'Apprenant sont des identités entièrement fictives. Les nouveaux comptes ont été créés via `supabase.auth.admin.createUser`, jamais par INSERT direct dans `auth.users`. La recette ne divulgue ni mot de passe ni lien d'activation.

Les deux fonctions SQL `public.schoolnet_no_email_activate_after_password` et `public.schoolnet_no_email_login_enabled` ont été installées uniquement sur la sandbox avec `EXECUTE` réservé à `service_role` ; `anon` et `authenticated` ne peuvent pas les invoquer.

## Désactivation après préparation

La fonction `schoolnet-lot5c-sandbox-prepare-once` a été remplacée par une version **neutralisée** (version 4, HTTP 410, `verify_jwt=true`) après la réussite. Elle ne contient plus de code de création d'utilisateurs et ne réalise aucune opération de base de données.

Exécution GitHub Actions : `43853162076` (succès après correctif d'environnement). Contrôles de qualité : `43853169925` (succès).

Les premières tentatives ont été bloquées avant création : jeton GitHub refusé par la passerelle Supabase puis prérequis de configuration HMAC indisponible. Le parcours a été limité à la réservation `auth_created` au lieu de simuler une invitation déjà remise. Les anciens comptes Auth de la sandbox n'ont pas été modifiés.

## À réaliser ensuite — **non effectué**

1. Préparer l'identifiant SCHOOLNET dans la sandbox avec une clé HMAC dédiée et le parcours d'invitation approprié, sans toucher aux secrets de production.
2. Contrôler la remise déclarée et le passage à `sent_declared`, puis une véritable session Auth Apprenant.
3. Tester la transaction `sent_declared -> enabled` et le lien familial automatique dans `parent_links` / `profiles.child_ids`.
4. Tester les refus (Parent non activé, mauvais dossier, demande rejetée), rollback, double activation et absence de classe scolaire.
5. Tester la visibilité « Mes enfants » sous JWT Parent et les RLS ; ne pas annoncer une recette de bout en bout avant ces validations.

**Sécurité :** les avertissements Supabase existants `rls_enabled_no_policy` (registres fermés), `authenticated_security_definer_function_executable` (fonction `public.is_admin`) et `auth_leaked_password_protection` restent à analyser. Ne pas les corriger par l'assouplissement des RLS.

**Production :** aucune migration, aucun nouveau compte, aucun secret modifié, aucun déploiement et aucune fusion sur `main`.
