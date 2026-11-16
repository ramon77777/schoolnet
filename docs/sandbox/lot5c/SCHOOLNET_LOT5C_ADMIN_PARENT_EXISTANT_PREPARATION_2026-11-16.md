# SCHOOLNET — Lot 5.C : approbation administrative « Parent existant »

**Date :** 16 novembre 2026  
**État :** CODE ET TESTS STATIQUES VALIDÉS — **PAS ENCORE DÉPLOYÉ NI TESTÉ EN BOUT EN BOUT**  
**Branche :** `feature/schoolnet-lot5c-fiche-compacte-finalisation`, PR n° 12 (brouillon).

## 1. Ce qui a été intégré

- `supabase/functions/schoolnet-student-no-email-admin/index.ts` : nouvelle action `approve_parent_reuse` pour un **nouvel enfant** d'un Parent déjà activé.
- `src/features/enrollments/lib/adminStudentNoEmailApi.ts` : champs de réponse `parent_reuse_available` et `parent_reuse_approved`, action typée.
- `src/features/enrollments/components/AdminStudentNoEmailPanel.tsx` : indication du Parent existant, contrôle de l'autorité parentale, note de vérification de 10 à 1000 caractères, bouton d'approbation spécifique et confirmation.
- `scripts/test-schoolnet-lot5c-admin-parent-reuse.mjs` : tests hors ligne d'autorisation, d'identité, de preuve administrative, de protection du navigateur et de prévisualisation.

Les trois fichiers applicatifs sont dans la PR uniquement, pas sur `main`, et **aucune Edge Function de production n'a été déployée**.

## 2. Garanties du nouveau chemin

1. Vérification du jeton Supabase Auth de l'agent et de son profil `admin`.
2. Vérification de l'origine exacte et du projet Supabase autorisé ; le mode prévisualisation reste en lecture seule.
3. Recherche par le serveur de l'invitation Parent **préexistante** correspondant exactement à l'adresse du responsable ; le navigateur ne fournit ni `parent_id` ni privilège.
4. Contrôle de l'état `activated`, du rôle Parent, du marqueur Auth serveur, de la vérification de l'adresse et d'au moins un lien familial existant.
5. Contrôle que la demande antérieure n'est pas rejetée et que le nouveau dossier est admissible.
6. Vérification individuelle de la relation Parent–Enfant et justification écrite par l'agent ; la protection PostgreSQL revalide l'Admin, le dossier, le Parent et l'invitation avant d'accepter une preuve.
7. La preuve est **unique par nouveau dossier et immuable** (table `schoolnet_sibling_parent_approvals`, RLS + FORCE RLS, contrôle par trigger, accès serveur).
8. Tant que la nouvelle approbation n'existe pas, la fonction refuse de préparer un compte Apprenant et interdit tout doublon de réservation.
9. Une invitation Parent supplémentaire n'est **jamais créée** par ce parcours ; l'identité Auth du Parent n'est ni recréée ni modifiée.
10. L'activation du nouvel enfant demeure confiée à PostgreSQL, qui crée le lien familial uniquement après une authentification réelle et la vérification du compte Apprenant.

## 3. Contrôles réellement exécutés

GitHub Actions `43859531383` : **SUCCESS** sur le commit `128b1b362966bd57735b4d9b077bcccc15204f45`.

Contrôles réussis : ESLint, compilation TypeScript/Vite, `deno check` des Edge Functions, scénarios de non-régression et nouveaux tests de sécurité du parcours Admin.

Contrôle Supabase **en lecture seule** après ces commits : sandbox = **22 comptes Auth fictifs, 4 Apprenants activés, 4 liens familiaux et 1 approbation individuelle** (issus des recettes précédentes). Aucune donnée n'a été modifiée dans la sandbox pendant l'intégration du parcours Admin.

**Attention :** ces tests ne remplacent pas la recette HTTP réelle de la fonction administrative avec un JWT Admin sandbox, ni les vérifications ergonomiques sur une interface reliée à la sandbox.

## 4. Prérequis pour une recette HTTP réelle

- Edge Function `schoolnet-student-no-email-admin` déployée **sur sandbox uniquement**, avec origine sandbox exacte et configuration explicite. La fonction actuelle n'a **pas** été déployée.
- Nouveau dossier de test avec un Parent déjà activé, un lien familial préexistant et une demande distincte.
- Compte Admin fictif de sandbox, JWT valide, activation de cohorte exclusivement pour ce dossier et recette contrôlée de l'action `approve_parent_reuse`.
- Prévisualisation frontend connectée exclusivement à la sandbox ; ne jamais utiliser le preview actuel pointant vers le projet principal pour des mutations.
- Le projet principal ne doit subir aucune migration, changement de secret, création de compte ou modification des flags de release.

## 5. Obstacles encore présents pour le parcours complet de connexion scolaire

Lecture SQL vérifiée : la sandbox possède `schoolnet_no_email_activate_after_password` et `schoolnet_no_email_login_enabled`, **mais pas** `schoolnet_no_email_login_gate` ni `schoolnet_no_email_login_audit`. La fonction de connexion complète exige ces deux RPC ainsi que les tables de journal et de limitation.

Le code frontend `studentSchoolnetAuth.ts` pointe actuellement le mode `sandbox` vers l'ancienne fonction `schoolnet-student-login`, alors que le mode `production` appelle `schoolnet-student-login-release` avec CAPTCHA. Il faut choisir et valider un **parcours sandbox de même niveau de sécurité**, Turnstile inclus, avant de parler de recette complète.

Autres dépendances : clé HMAC dédiée à la sandbox, configuration de Turnstile propre à son hostname, flags d'activation explicites, identifiants scolaires synthétiques cohérents, frontend distinct et vérification responsive de « Mes enfants ».

**Étape suivante :** préparer sans écriture de production une migration sandbox des RPC de rate limiting / audit, l'accès Turnstile, puis une session Admin et des dossiers fictifs permettant une recette réelle du nouvel endpoint. Ne pas publier en production avant cette recette.
