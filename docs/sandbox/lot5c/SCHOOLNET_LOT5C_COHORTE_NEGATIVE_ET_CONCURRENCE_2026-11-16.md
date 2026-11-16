# SCHOOLNET — Lot 5.C : recette négative et appels concurrents

**Date :** 16 novembre 2026  
**Périmètre :** `schoolnet-auth-sandbox` uniquement (`onqlsvphmrqhelislpry`).  
**Statut :** VALIDÉ POUR LES CAS TESTÉS EN SANDBOX, PAS POUR LA PRODUCTION.  
**Dépôt :** PR GitHub n° 12, branche `feature/schoolnet-lot5c-fiche-compacte-finalisation` (brouillon).

## 1. Exécution et contrôles

- CI TypeScript/Vite, ESLint, contrôles existants, Deno TypeScript : **succès**, GitHub Actions `43856109240`.
- Exécution des scénarios : **succès**, GitHub Actions `43856456425`.
- Edge Function d'essai `schoolnet-lot5c-negative-sandbox-once`, accès GitHub OIDC vérifié (issuer, audience, dépôt, branche, workflow, jeton RS256 à vie courte).
- Après le test, la fonction a été **neutralisée**, version 2 : réponse HTTP 410, aucun code Auth/SQL/secrets, `verify_jwt=true`. Vérification de la version et du contenu de la fonction effectuée.
- Aucun appel non signé autorisé ; refus anonyme HTTP 401 confirmé avant le test.
- Les créations Auth ont été effectuées uniquement via `auth.admin.createUser` sur la sandbox, avec comptes fictifs et e-mails `.invalid`, sans notification réelle.
- Les secrets et mots de passe générés n'ont pas été consignés ou retournés par les API de test.

## 2. Cas testés sur six nouveaux dossiers

| Référence | Objet | Résultat |
|---|---|---|
| `DEM-L5C-NG-01` | Invitation Parent non activée | `SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED`, rollback |
| `DEM-L5C-NG-02` | Adresse du responsable du dossier différente de l'e-mail Auth Parent | `SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED`, rollback |
| `DEM-L5C-NG-03` | Demande administrative rejetée | `SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED`, rollback |
| `DEM-L5C-NG-04` | `user_metadata` indique le bon dossier, mais `app_metadata.schoolnet_no_email_request_id` est incorrect | Refus, `user_metadata` non fiable, rollback |
| `DEM-L5C-NG-05` | Enfant temporairement présent dans `child_ids` d'un autre parent | `SCHOOLNET_AUTOLINK_FAMILY_CONFLICT`, rollback ; élément de conflit synthétique retiré après vérification |
| `DEM-L5C-NG-06` | Deux appels RPC lancés ensemble pour l'activation | Un appel retourne `true`, l'autre `false`, exactement un lien et une occurrence dans `child_ids` |

Pour chacun des cinq refus, le registre est resté en `sent_declared` avec `activated_at IS NULL`. Aucun rattachement parasite au Parent attendu. Les erreurs PostgreSQL ont été vérifiées avec SQLSTATE `23514`.

La concurrence a été exercée par deux appels PostgREST envoyés via `Promise.all` ; cette recette vérifie l'idempotence sous appels concomitants, mais **ne prouve pas formellement que les deux transactions se sont chevauchées en base**. Un test de charge/concurrence instrumenté reste possible avant mise en production.

Avant cette activation, le programme a également confirmé :
- Un appel RPC non authentifié ne peut exécuter `schoolnet_no_email_activate_after_password`.
- La connexion Auth réelle de l'apprenant fictif est valide et son JWT correspond bien au compte attendu.
- Le Parent authentifié peut lire son enfant via les politiques RLS, tandis qu'un Parent sans rattachement ne le peut pas.
- Aucune inscription scolaire annuelle n'a été requise.

## 3. Résultat post-recette en lecture seule

| Mesure | État |
|---|---:|
| Total `auth.users` sandbox | 19 |
| Nouveaux comptes fictifs de cette cohorte | 12 (6 parents, 6 apprenants) |
| `public.profiles` | 15 |
| Demandes publiques fictives | 7 |
| Registres d'invitation Parent | 7 |
| Registres Apprenant sans e-mail | 7 |
| Comptes Apprenant au statut `enabled` | 2 |
| Liens `public.parent_links` | 2 |
| Événements d'invitation | 9 |
| Dossiers négatifs encore en `sent_declared` | 5 |
| Nouveaux liens sur les cinq dossiers négatifs | 0 |

Le premier dossier positif `DEM-L5C-SBX-TEST01` conserve son compte `enabled` et **un seul** lien Parent–Enfant. Le dossier `DEM-L5C-NG-06` présente également `enabled`, exactement un lien et une référence dans `profiles.child_ids`.

Les registres privés restent inaccessibles en lecture à `anon` et `authenticated`. La RPC d'activation reste exécutable uniquement par `service_role` et le trigger d'auto-rattachement reste activé dans la sandbox.

## 4. Limites explicites

- Les invitations de la cohorte sont **des preuves synthétiques de test**, non des invitations réellement remises par un agent ou envoyées par e-mail/SMS.
- Ces tests sont centrés sur PostgreSQL, RLS et Auth. Ils ne valident pas encore la connexion complète `code SCHOOLNET + téléphone familial + mot de passe + Turnstile` via la fonction Edge définitive.
- Le cas **deux demandes / deux enfants pour un même Parent** nécessite une recette spécifique : la contrainte `UNIQUE(lower(email))` sur `schoolnet_family_invitation_records` limite les invitations par e-mail. Ne pas déduire sans test que le parcours applicatif gère deux inscriptions sœurs ; vérifier la réutilisation du compte Parent sans recréer une invitation.
- Le cas d'un conflit via un `parent_links` préexistant n'a pas été exécuté ici ; le conflit a été testé sur la branche `child_ids` du déclencheur.
- Révocation, récupération d'invitation, rejet en cours de traitement, véritable course SQL instrumentée, ouverture générale et tests de l'interface « Mes enfants » restent à valider.
- Les avertissements Supabase existants `public.is_admin()` exécutable en SECURITY DEFINER et protection contre les mots de passe compromis désactivée doivent être revus avant une proposition de promotion.

## 5. Protection du principal

**Aucune intervention sur le Supabase principal, aucune publication Vercel principale, aucune fusion GitHub dans `main`, aucun compte réel modifié.** Seule la sandbox d'authentification et la branche de la PR n° 12 ont été utilisées.

**Prochaine étape recommandée :** audit et recette d'un Parent avec deux enfants, puis création d'un frontend sandbox entièrement séparé et test complet de connexion scolaire.
