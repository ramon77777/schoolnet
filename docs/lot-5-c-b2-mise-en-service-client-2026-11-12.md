# SCHOOLNET — Lot 5.C-B.2 — Mise en service pour tests clients
## Reprise prioritaire — 12 novembre 2026

**OBJECTIF UTILISATEUR : terminer le parcours Parent/Apprenant (compte → lien → mot de passe → activation), puis fusionner les changements sur `main` et publier via la liaison GitHub → Vercel.**
**STATUT : EN COURS ; aucune fusion ni publication finale autorisée avant recette.**

### 1. Audit GitHub et Vercel
- Dépôt : `ramon77777/schoolnet`, branche principale **`main`**.
- Branche fonctionnelle : `feature/schoolnet-multi-etablissements`.
- PR #6 encore **brouillon**, cible **`feature/schoolnet-notifications`**, pas `main` ; nécessité d'intégrer les branches sans perdre les fonctionnalités cumulées.
- Depuis `main`, branche fonctionnelle initialement **341 commits en avance, 0 en retard** au contrôle du 12/11/2026 (à revérifier avant fusion).
- Commit audité `2ef3e64412f097d0fa6bc88118220708429ce5f5` : workflow GitHub `43228699612` **success** (ESLint, TypeScript/Vite, Deno check et tests simulés). Check GitHub Vercel **success**, preuve d'une intégration sur le commit ; **ne prouve pas que la production a été publiée**.
- Compte Vercel connecté par l'outil : équipe `ramon77777s-projects`, **0 projets accessibles** par l'API malgré le statut GitHub Vercel indiquant un projet `schoolnet`. Le projet GitHub associé à `schoolnet-snowy.vercel.app` n'a donc **pas pu être inspecté** par l'accès Vercel actuel. Vérifier l'équipe/autorisation avant d'annoncer un déploiement.

### 2. État du code fonctionnel
- `supabase/functions/schoolnet-family-invitation/index.ts` prépare `inspect/prepare/resume/renew/declare_sent/confirm_activation/flag_review` : le code de la branche est **`READ_ONLY_DEPLOYMENT=false`**, mais la fonction **distante principale version 2 est encore `READ_ONLY_DEPLOYMENT=true`**.
- Origine officielle de mutations dans le code : `https://schoolnet-snowy.vercel.app` ; interdiction depuis `localhost` et les previews.
- Garde de projet Supabase, garde de rôle `profiles.role=admin`, contrôles de demande/destinataire, note de vérification et anti-doublon, lien `generateLink(type=invite)` sans e-mail automatique.
- UI `AdminFamilyInvitationManager` dispose des boutons de création, suivi, remise manuelle et activation, derrière vérifications administratives.
- `src/features/auth/pages/ResetPasswordPage.tsx` contient le parcours de changement de mot de passe et le marqueur `app_metadata.schoolnet_family_invitation`, mais le contrôle préalable de session et le lien de récupération doivent être validés en conditions réelles.
- **Attention : transmission des liens actuellement MANUELLE par un administrateur, non envoi automatique par e-mail.** Ne pas promettre de livraison par mail tant qu'aucun service d'expédition n'est configuré.

### 3. Migration production effectuée avec autorisation utilisateur

Supabase principal : `schoolnet_2.0`, ID **`anttmbhaphkhmkoqsofd`**.

- Une simulation du script `supabase/proposals/20261112_family_password_auth_hook_proof.sql` sous `BEGIN ... ROLLBACK` a réussi.
- Migration **`schoolnet_family_password_auth_hook_proof_20261112`** appliquée sur le principal et vérifiée.
- Schéma privé `schoolnet_family_auth_proof`, hook `observe_family_access_token(jsonb)` (**non sélectionné encore dans Auth Dashboard**), journal append-only `token_issue_observations` et RPC `public.schoolnet_family_password_session_proof(uuid,timestamptz)`.
- RLS de la table activée et forcée ; `anon/authenticated/service_role` n'ont pas `USAGE` sur le schéma ; `supabase_auth_admin` a `USAGE` et `INSERT`, pas de `SELECT`. La RPC est `EXECUTE` pour `service_role` uniquement. `schoolnet_family_password_session_proof(NULL,NULL)` renvoie `false`.
- **Après migration : 10 comptes Auth, 36 migrations, 0 invitation, 0 événement, 0 observation**. Aucun compte, mot de passe ou lien réel modifié par cette opération.
- **Blocage opérationnel** : le hook n'est pas activé dans Authentication → Auth Hooks. Le connecteur Supabase ne permet pas de configurer ce paramètre. Une action manuelle dans le Dashboard principal est indispensable, en sélectionnant **Postgres** → schéma `schoolnet_family_auth_proof` → fonction `observe_family_access_token`.
- En cas d'erreur de connexion Auth, désactiver le hook dans le Dashboard avant tout autre changement. Cette fonction est non-modificatrice (renvoie exactement l'événement).

### 4. Ordre de livraison obligatoire

1. Configurer manuellement le hook dans Supabase **principal**, vérifier par capture.
2. Valider que le chemin de redirection `https://schoolnet-snowy.vercel.app/auth/reset-password?mode=family-invite` est bien autorisé dans Supabase Auth > URL Configuration.
3. Contrôler les permissions réelles, les échecs de session, les liens expirés et la gestion des comptes déjà existants.
4. Préparer/mettre en service le backend Edge fonctionnel, en conservant `verify_jwt=true`, le verrou d'origine, le rôle Super Admin, et un arrêt d'urgence. Ne pas l'activer aux comptes réels avant recette ciblée.
5. Confirmer le parcours complet sur un **véritable compte de test autorisé**, sans envoi de lien à un tiers involontaire : création, registre, lien manuel, mot de passe, connexion, preuve en SQL, déclaration de transmission, activation et anti-doublon.
6. Exécuter lint, build, vérification Deno, tests de sécurité et contrôle métier Parent/Apprenant.
7. Vérifier branchage GitHub/Vercel, protections et base cible de PR #6 ; fusionner **sur `main` seulement après recette**.
8. Confirmer le déploiement Git automatique et l'URL publique cible par des tests réels ; ne pas utiliser le résultat d'un ancien check de preview comme preuve de production.

### 5. Prochaine interaction

**Action externe nécessaire :** utilisateur dans Dashboard Supabase principal `https://supabase.com/dashboard/project/anttmbhaphkhmkoqsofd/auth/hooks` → Add hook → Customize Access Token (JWT) Claims → Postgres → schéma `schoolnet_family_auth_proof` → fonction `observe_family_access_token` → Create Hook. Fournir capture de la ligne **ENABLED**. Ne pas créer le hook dans la sandbox par erreur ; celui de sandbox reste distinct.

Ne jamais partager de clé secrète, mot de passe, token ou lien d'invitation dans la conversation ou GitHub.
