# SCHOOLNET Lot 5.C — Isolation backend et recette sandbox

**Statut : PREPARATION CODE UNIQUEMENT — aucun déploiement ni migration autorisés par ce document.**
**Branche :** `feature/schoolnet-lot5c-fiche-compacte-finalisation` (PR 12, brouillon).

## 1. Environnements immuables

| Rôle | Supabase URL | Frontend |
|---|---|---|
| Principal | `https://anttmbhaphkhmkoqsofd.supabase.co` | `https://schoolnet-snowy.vercel.app` |
| Sandbox | `https://onqlsvphmrqhelislpry.supabase.co` | Origine de recette exacte à configurer et vérifier |

Le backend passe par `schoolnetStudentAllowedOrigin()`. Une URL d'origine (CORS) ne constitue **jamais** une preuve d'authentification : l'administration exige un JWT valide et le rôle Admin ; l'identifiant scolaire exige toujours mot de passe Auth, CAPTCHA, preuves SQL et limites de tentatives.

- Production : l'URL Supabase et l'origine doivent correspondre **exactement** aux valeurs officielles. `SCHOOLNET_STUDENT_EXECUTION_MODE` absent ou égal à `production`. Le mode sandbox, même avec ses secrets, ne permet pas de fonctionner sur le projet principal.
- Sandbox : `SCHOOLNET_STUDENT_EXECUTION_MODE=sandbox`, `SCHOOLNET_STUDENT_SANDBOX_ENABLED=true`, projet Supabase exactement celui de la sandbox et `SCHOOLNET_STUDENT_SANDBOX_ORIGIN` égal à l'origine autorisée. La valeur doit être un aperçu SCHOOLNET HTTPS sur `*.vercel.app` ou `http://localhost:5173` (développement exclusivement).
- Les secrets doivent être configurés **séparément** par projet. Ne jamais copier les clés JWT, Service Role, CAPTCHA ou `SCHOOLNET_STUDENT_CODE_PEPPER` de production.
- **Obligation de séparation frontend** : l'origine de la sandbox doit servir une version dédiée du frontend où `VITE_SUPABASE_URL` pointe vers **la sandbox**, jamais vers le principal. La prévisualisation actuelle de la PR (branchée sur le projet principal) ne doit pas être réutilisée pour activer une invitation sandbox. Vérifier explicitement cette association avant toute recette.
- Le panneau Admin de la PR reste volontairement en lecture seule sur une prévisualisation. Les essais complets nécessiteront une interface sandbox dédiée et un compte Admin **sandbox**, ou un client de test isolé muni d'une session sandbox vérifiée ; ils ne peuvent pas partir du panneau actuel.
- Turnstile devra accepter le **hostname exact** de la sandbox et être configuré avec une clé de test distincte. Ne jamais court-circuiter le captcha pour faciliter la recette.
- `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED` et `SCHOOLNET_STUDENT_LOGIN_ENABLED` restent à `false` par défaut dans la sandbox et sont activés uniquement pendant une recette expressément autorisée.
- `SCHOOLNET_STUDENT_GENERAL_RELEASE_ENABLED=false` durant toutes les recettes de la cohorte pilote/canary. `SCHOOLNET_STUDENT_PILOT_REQUEST_ID` et `SCHOOLNET_STUDENT_CANARY_REQUEST_ID` visent uniquement des demandes synthétiques.
- **Point de compatibilité incontournable avant tout futur déploiement prod** : la nouvelle version exige expressément `SCHOOLNET_STUDENT_LOGIN_ENABLED=true`, alors que l'ancienne version acceptait l'absence de variable. Contrôler et consigner la valeur dans le projet principal **sans afficher le secret**, puis valider un plan de déploiement et de repli. Sinon le pilote actuel serait bloqué. Ne pas corriger cela en revenant au défaut ouvert.

## 2. Schéma de recette à préparer (non appliqué)

L'ancienne sandbox Auth possède `schoolnet_student_private.identities` mais pas encore les tables publiques complètes du Lot 5.C. Il faut préparer un schéma issu des **migrations versionnées** de SCHOOLNET : mêmes colonnes, types, contraintes, triggers, fonctions et privilèges, sans recopier les lignes du principal.

Objets indispensables dans la sandbox (ne pas exécuter sur le principal) :
- `public.profiles` avec `role`, `full_name`, `child_ids uuid[]`, et contrainte de référence à `auth.users`.
- `public.public_enrollment_requests` avec `id`, `request_type`, `status`, `guardian_relationship`, `guardian_email`, `guardian_phone`, `student_email`, `student_full_name`.
- `public.schoolnet_family_invitation_records` avec `request_id`, `recipient`, `expected_role`, `status`, `email`, `user_id`.
- `public.schoolnet_student_no_email_requests` avec `request_id`, `parent_id`, `student_auth_user_id`, `technical_email`, `status`, `sent_at`, `activated_at`, `student_code_hmac`, `family_phone_e164`, preuves d'administration et contraintes d'unicité.
- `public.parent_links` avec `parent_id`, `student_id`, `relation_type`, et `UNIQUE(parent_id,student_id)`.
- `schoolnet_student_private.guard_no_email_record`, `guard_no_email_parent_links`, `guard_no_email_child_ids`, ainsi que `schoolnet_no_email_activate_after_password`, `schoolnet_no_email_login_enabled` et `schoolnet_no_email_login_gate` reproduits à partir de leurs migrations.
- RLS / FORCE RLS et permissions d'exécution identiques au principal lorsque requis. Contrôler les droits des rôles `anon`, `authenticated` et `service_role`.

L'importation du schéma devra avoir une revue de sécurité. **Ne pas insérer directement dans `auth.users` par SQL** : créer des comptes uniquement via les API Auth de la sandbox, avec noms fictifs et domaines d'e-mail de test détenus ou contrôlés. Éviter tout mail sortant réel.

## 3. Scénarios de recette transactionnelle

Chaque scénario commence par une demande fictive distincte et un état de base documenté. Seule la sandbox pourra être modifiée après nouvelle autorisation.

| # | Cas | Résultat impératif |
|---|---|---|
| 01 | Parent activé, apprenant avec invitation remise, mot de passe correct | Passage `sent_declared → enabled`, insertion d'un seul `parent_links`, un seul `child_ids` |
| 02 | Seconde connexion et nouvel essai de même activation | Aucun nouveau lien ni doublon, identité initiale conservée |
| 03 | Mot de passe incorrect ou session JWT absente | Aucun passage à `enabled`, aucun lien |
| 04 | Parent inactif, invitation absente/non activée | Transaction annulée ; statut initial conservé |
| 05 | Demande rejetée ou parent différent du dossier | Transaction annulée ; pas de lien |
| 06 | Marqueur `app_metadata.schoolnet_no_email_request_id` falsifié ou différent | Transaction annulée ; pas de lien |
| 07 | Un autre parent déjà lié au même apprenant | Conflit détecté ; rollback atomique |
| 08 | Aucun dossier de classe/inscription annuelle | Lien familial créé et visible dans « Mes enfants » |
| 09 | Deux appels simultanés sur la même demande | Un seul compte et un seul lien ; aucune création silencieuse répétée |
| 10 | Accès depuis une origine non autorisée / un faux projet | Refus avant service ou mutation |
| 11 | Compte non membre de la cohorte canary | Création / connexion scolaire refusées |
| 12 | Arrêt d'urgence des flags création/connexion | Refus des mutations et de l'authentification scolaire |

Les tests SQL doivent valider **l'état après rollback**, pas seulement le message d'erreur. Toute erreur ambiguë impose un état `requires_review` et une vérification humaine, jamais une relance de création.

## 4. Preflight lecture seule avant installation sandbox

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'profiles', 'parent_links', 'public_enrollment_requests',
  'schoolnet_family_invitation_records', 'schoolnet_student_no_email_requests'
)
ORDER BY table_name;

SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid=t.tgrelid
JOIN pg_namespace AS n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('parent_links','profiles','schoolnet_student_no_email_requests')
  AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;
```

## 5. Validations et interdictions

- CI : `node --experimental-strip-types --test scripts/test-schoolnet-student-runtime-gate.mjs scripts/test-schoolnet-student-rollout-guard.mjs`.
- CI : `node --test scripts/test-schoolnet-no-email-auto-family-link.mjs scripts/test-schoolnet-student-login-production-release.mjs`.
- CI : `deno check --node-modules-dir=auto` sur les deux Edge Functions.
- Ces contrôles sont **statiques et unitaires**, pas une preuve d'exécution transactionnelle PostgreSQL.
- Ne pas déployer les nouvelles fonctions, appliquer le fichier `supabase/proposals/20261116_schoolnet_no_email_auto_family_link_REVIEW_ONLY.sql`, créer un compte Auth ni modifier les secrets sans une **nouvelle validation explicite**.
- Le dossier pilote du principal, ses comptes, ses liens et ses données restent inchangés.
