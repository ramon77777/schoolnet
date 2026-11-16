# SCHOOLNET — Lot 5.C : recette Auth et rattachement automatique en sandbox

**Date :** 16 novembre 2026  
**Statut :** RECETTE PARTIELLE RÉUSSIE EN SANDBOX — NE PAS DÉPLOYER EN PRODUCTION  
**Projet :** `schoolnet-auth-sandbox` — `onqlsvphmrqhelislpry`  
**GitHub :** PR n° 12 — `feature/schoolnet-lot5c-fiche-compacte-finalisation` (brouillon)

## 1. Périmètre réel

Le test a utilisé exclusivement le dossier **entièrement fictif** `DEM-L5C-SBX-TEST01`, avec trois identités Auth créées lors de la préparation précédente (Admin, Parent, Apprenant). Les quatre comptes Auth de tests antérieurs ont été préservés.

La recette a été exécutée par un workflow GitHub Actions protégé par un jeton OIDC, cryptographiquement vérifié côté fonction Edge. L'audience, le dépôt, le workflow et la branche étaient verrouillés à des valeurs précises. L'URL Supabase de la fonction de test correspondait obligatoirement à `onqlsvphmrqhelislpry`.

Workflow de recette : https://github.com/ramon77777/schoolnet/actions/runs/43854459233  
Résultat GitHub : **SUCCÈS**.

## 2. Tests réellement exécutés

| Test | Résultat |
|---|---|
| Appel anonyme de la fonction temporaire | Refus HTTP 401 |
| Auth Admin / Parent / Apprenant et données déjà créées | Prérequis vérifiés |
| Mise à jour de mots de passe strictement fictifs via Auth Admin | Réussie |
| Connexion Apprenant avec un mot de passe incorrect | Refusée |
| Connexions Parent et Apprenant avec mot de passe correct | Réussies |
| Contrôle des JWT retournés via `auth.getUser(token)` | Identités confirmées |
| Passage `auth_created → prepared → sent_declared` côté registre Apprenant | Réussi (déclaration de remise **simulée**, aucun message envoyé) |
| Tentative `sent_declared → enabled` alors que l'invitation Parent n'était pas encore activée | Refusée par `SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED` |
| Vérification après refus : statut encore `sent_declared`, aucun lien et aucun `child_ids` ajouté | Rollback confirmé |
| Passage simulé de l'invitation Parent `prepared → sent_declared → activated`, après connexion Auth vérifiée | Réussi |
| Tentative d'activation avec HMAC de code incorrect | Refusée, sans changement de statut |
| Activation du compte Apprenant via RPC serveur | Réussie |
| Création atomique par trigger `parent_links` + `profiles.child_ids` | Exactement un lien et une référence dans `child_ids` |
| Nouvelle invocation de la RPC d'activation | Aucun changement, aucun doublon |
| Accès au profil de l'enfant avec un JWT Parent réel, soumis à RLS | Réussi |
| Présence d'un dossier annuel ou d'une classe scolaire | Aucun prérequis requis : la table d'inscription annuelle n'existe pas dans cette sandbox |
| Relance du test complet | Refus HTTP 409 après changement d'état ; aucune création supplémentaire |

Aucune insertion SQL manuelle n'a été nécessaire pour créer `parent_links` ni pour ajouter l'enfant dans `child_ids`.

## 3. Vérifications finales en lecture seule

| Objet | État constaté |
|---|---|
| `auth.users` total dans la sandbox | 7 |
| Nouveaux comptes fictifs identifiés Lot 5.C | 3 |
| `public.profiles` | 3 |
| Demandes publiques | 1 |
| Registre invitation Parent | 1, statut `activated` |
| Registre Apprenant sans e-mail | 1, statut `enabled` |
| `public.parent_links` | 1 |
| Nombre d'enfants dans `profiles.child_ids` du Parent | 1 |
| Événements d'invitation Parent | 3 |
| Activation par `anon` ou `authenticated` | Interdite |
| Lecture du registre privé par `anon` ou `authenticated` | Interdite |
| Déclencheur de rattachement automatique | Installé, activé **sur sandbox uniquement** |
| Statut administratif de la demande publique | `new` (indépendant de l'accès Auth et du lien familial) |

## 4. Neutralisation de l'outil temporaire

La fonction `schoolnet-lot5c-autolink-sandbox-once` a été redéployée **immédiatement après réussite** en version 2, qui ne contient que la réponse inerte HTTP 410 et n'utilise ni Auth, ni base de données, ni secrets. `verify_jwt=true`.

Le code de test demeure uniquement dans la PR GitHub pour l'audit. Ne jamais republier ce code sans nouvelle revue et accord explicite.

## 5. Limites de cette recette

**Ce test est une validation transactionnelle du rattachement familial, pas une validation du parcours public complet.**

- La remise d'invitation a été **simulée** sans SMS, e-mail ni remise physique.
- Le code scolaire a servi uniquement à fabriquer un HMAC de test avec une clé temporaire en mémoire. **Le flux complet de connexion « code SCHOOLNET + téléphone + mot de passe + Turnstile » n'a pas encore été validé** dans cette sandbox. La clé temporaire n'a pas été conservée.
- L'affichage réel dans la page React « Mes enfants » n'a pas encore été testé sur un frontend branché exclusivement à la sandbox. Seule la lecture du profil et du lien familial via un JWT Parent avec les politiques RLS a été vérifiée.
- L'absence de classe a été vérifiée côté base/relations. Le parcours administratif d'affectation dans l'interface reste à tester.
- Les scénarios « mauvais Parent », « demande refusée », « métadonnées Auth altérées », « deux activations vraiment simultanées », « révocation » et les plans de récupération doivent faire l'objet de **nouvelles données de test isolées**, sans réutiliser ou altérer le dossier positif réussi.
- Les avertissements de sécurité Supabase sur `public.is_admin()` et la protection contre les mots de passe compromis demeurent à traiter avant toute proposition de mise en production.

## 6. Suite recommandée

Préparer une deuxième cohorte fictive sandbox pour les scénarios négatifs et de concurrence, puis une interface sandbox distincte avec ses propres paramètres Supabase. Préparer la vraie chaîne de connexion scolaire et la recette fonctionnelle sur téléphone ; aucun lien ni secret du projet principal ne doit être réutilisé.

**Production SCHOOLNET inchangée :** aucune migration, aucune Edge Function déployée, aucun compte modifié, aucun commit fusionné dans `main`.
