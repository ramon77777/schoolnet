# SCHOOLNET — Revue de sécurité Lot 5.C-B.2 (13 novembre 2026)

**Branche de travail :** `feature/schoolnet-student-sans-email`. **SQL :** `supabase/proposals/20261113_student_no_email_release_REVIEW_ONLY.sql`.

> **Note de statut ultérieure (13 novembre 2026)** : ce rapport décrit l'état **avant** application. La migration a ensuite été appliquée sur Supabase principal et vérifiée. Le rapport faisant foi est [`SECURITY_APPLIED_PRODUCTION_2026-11-13.md`](SECURITY_APPLIED_PRODUCTION_2026-11-13.md). Les composants Edge restent désactivés.

## État et périmètre
Migration renforcée et testée en simulation PostgreSQL sur la **sandbox**, **non appliquée en production**. Pas de nouveaux comptes, de liens familiaux, de déploiement Edge/Vercel ou de fusion vers `main`.

## Risques et corrections
1. La base principale accorde actuellement des privilèges SQL `UPDATE` trop larges à `anon` et `authenticated` sur `public.profiles`. Le déclencheur EXISTANT `trg_protect_profile_sensitive_fields` interdit déjà la modification de `role` et `child_ids` par leur propriétaire ; la migration ajoute une protection au niveau des **privilèges de colonnes** et conserve la modification des seuls `full_name`, `phone`, `avatar_url`.
2. La RPC existante `admin_finalize_public_enrollment_request` ajoute d'abord une ligne à `parent_links`, puis `profiles.child_ids`, avant d'ajouter la résolution finale. Un déclencheur de contrôle uniquement sur la résolution laisserait d'autres chemins d'écriture Admin sans protection. Trois déclencheurs sont maintenant prévus : **résolution**, **parent_links** et **child_ids** ; ils exigent l'activation préalable pour les identités du nouveau registre.
3. Les données d'identité scolaire restent dans un registre à RLS forcée accessible **uniquement au rôle serveur**. Les codes scolaires ne sont conservés qu'en HMAC.
4. Limites SQL `lock_timeout=5s` et `statement_timeout=30s` prévues pour l'opération de production future.

## Recette sandbox — exécutée
Simulation de la migration SQL réelle en remplaçant, **dans la transaction de test uniquement**, le nom du schéma privé par `schoolnet_student_security_lab`, pour éviter toute collision avec l'ancienne expérimentation B2B. Création de tables publiques fictives, contrôles, puis `ROLLBACK`.

Résultat **PASS** : privilèges de colonnes, refus des trois rattachements avant activation, validation des trois rattachements après activation, refus du remplacement du parent dans le même dossier. Vérification postérieure : **0** schéma lab, **0** table fictive, les **4** comptes Auth sandbox conservés.

Cette simulation ne prouve pas encore la recette complète de Supabase Auth avec un véritable JWT d'apprenant ni la sécurité de tous les endpoints métiers.

## Contrôles et points bloquants avant production
- 12 tests statiques dans `scripts/test-student-no-email-db-security.mjs` ; le fichier SQL est conservé dans `supabase/proposals` pour éviter l'auto-déploiement.
- Revue RLS avec un **jeton d'apprenant pending** : les contrôles `AuthProvider` côté React ne remplacent pas l'autorisation côté base. Vérifier directement les données scolaires accessibles par les politiques `authenticated`.
- Domaine e-mail technique vérifié et contrôlé, secret HMAC privé durable, CAPTCHA Turnstile, en-tête IP de proxy fiable, protection brute-force, vérification du parcours de récupération et révocation.
- Sauvegarde et autorisation **distincte** avant toute nouvelle modification de la base principale ; déploiements Edge et Vercel distincts et ultérieurs.
- Supabase signale déjà l'avertissement `auth_leaked_password_protection` : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Tests locaux (Windows)
```powershell
git status
git fetch origin
git switch feature/schoolnet-student-sans-email
git pull --ff-only origin feature/schoolnet-student-sans-email
node --test scripts/test-student-no-email-db-security.mjs
npm run build
```
Ne jamais exécuter manuellement le fichier `REVIEW_ONLY.sql` dans la base principale sans nouvelle validation et autorisation.