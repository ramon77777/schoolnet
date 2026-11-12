# SCHOOLNET — Lot 5.C-B.2 / B.5.2
## Correctif ciblé du hook Auth et reprise de la recette réelle — 12 novembre 2026

**ÉTAT : CORRECTION SQL APPLIQUÉE DANS LA SANDBOX ; SIMULATIONS RÉUSSIES ; NOUVEAU LOGIN RÉEL POST-CORRECTION ENCORE À EFFECTUER.**

### 1. Autorisation et périmètre

Après une première connexion réussie via `signInWithPassword`, le journal d'observation `schoolnet_auth_observation.token_issue_events` était toujours vide. Les logs Supabase Auth confirmaient pourtant `Hook ran successfully` pour le hook `schoolnet_auth_observation.observe_access_token` et le grant type `password` (12/11/2026, 11:26:27 UTC). L'utilisateur a autorisé un **correctif ciblé de la fonction dans la sandbox** puis un nouveau test B.5.2.

- **SANDBOX UNIQUEMENT** : `schoolnet-auth-sandbox` (`onqlsvphmrqhelislpry`).
- **PRINCIPAL INTERDIT** : `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`).
- Branche GitHub : `feature/schoolnet-multi-etablissements` ; PR #6 toujours en brouillon.

### 2. Diagnostic

La version B.5.1 contenait :
```sql
INSERT INTO schoolnet_auth_observation.token_issue_events
  (user_id, session_id, authentication_method)
VALUES (auth_user_id, auth_session_id, method_name)
ON CONFLICT ON CONSTRAINT b51_unique_user_session_method DO NOTHING;
```

PostgreSQL 17 exige des privilèges `SELECT` pour les colonnes lues dans la cible de `ON CONFLICT`, y compris celles de la contrainte arbitre. Les contrôles de catalogue ont confirmé `INSERT=true` mais `SELECT=false` sur `user_id`, `session_id` et `authentication_method` pour `supabase_auth_admin`. La fonction était `SECURITY INVOKER` et interceptait `WHEN OTHERS`, ce qui permettait à l'Auth de réussir malgré une erreur d'insertion non exposée.

**Qualification : cause fortement étayée par la documentation PostgreSQL et les privilèges réels, mais pas encore démontrée par une nouvelle invocation Auth réussissant à écrire dans la table.** Source : https://www.postgresql.org/docs/17/sql-insert.html

### 3. Correctif appliqué

Script autonome de migration conservé **hors des migrations normales du produit** :
[`docs/sql/lot_5_c_b2_b52_SANDBOX_ONLY_token_hook_no_on_conflict_patch.sql`](./sql/lot_5_c_b2_b52_SANDBOX_ONLY_token_hook_no_on_conflict_patch.sql).

- Remplacement strict de la clause `ON CONFLICT ON CONSTRAINT ... DO NOTHING` par un `INSERT` simple dans un bloc `BEGIN/EXCEPTION WHEN unique_violation` dédié.
- L'exception ignorée n'est admise que pour la contrainte `b51_unique_user_session_method` ; la vérification se fait avec `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME`.
- Les autres exceptions restent absorbées par le bloc externe **fail-open Auth** existant : la connexion de l'utilisateur n'est pas considérée comme activée et aucune preuve n'est inventée si l'observateur échoue.
- La fonction continue de retourner **l'événement et les claims JWT inchangés**.
- **Aucun `GRANT SELECT`, aucune modification RLS, de policy, de table, de compte, d'email, de profil ou d'invitation.**
- Migration dans la sandbox : `schoolnet_auth_sandbox_b52_fix_hook_conflict_no_select`.

Avant application : test de la migration SQL sous `BEGIN/ROLLBACK` réussi. Après application : inspection du corps de fonction, des privilèges et de la RLS. Le corps en production sandbox contient `unique_violation` et `GET STACKED DIAGNOSTICS`, ne contient plus le `ON CONFLICT` ciblé et reste `SECURITY INVOKER` avec `search_path=pg_catalog`.

### 4. Contrôles de sécurité et non-régression

| Contrôle | Résultat |
| --- | --- |
| Sandbox : `auth.users` | **2** comptes fictifs |
| Sandbox : `token_issue_events` | **0** avant nouvelle connexion |
| Sandbox : cas et événements familiaux B.2 | **0 / 0** |
| Sandbox : migrations | **3** après correctif |
| `supabase_auth_admin` : `USAGE` schéma | true |
| `supabase_auth_admin` : `INSERT` journal | true |
| `supabase_auth_admin` : `SELECT` journal | **false**, conservé |
| `supabase_auth_admin` : `EXECUTE` hook | true |
| `anon`, `authenticated`, `service_role` : `USAGE` schéma | false |
| Journal : RLS activée et forcée | true |
| Journal : policy INSERT dédiée | 1 |
| Test historique B.5.1 : événements simulés `password/recovery/token_refresh`, dédoublonnage, pass-through, immutabilité | **Réussi sous transaction ROLLBACK** |
| Principal : Auth / migrations | **10 / 35**, inchangés |
| Principal : invitations / événements | **0 / 0**, inchangés |
| Principal : schéma d'observation | **absent** |
| Supabase Security Advisor | INFO `rls_enabled_no_policy` (fermeture B.2 volontaire) ; WARN `auth_leaked_password_protection` préexistant |

L'impossibilité de `SET ROLE supabase_auth_admin` via le connecteur PostgreSQL subsiste. Les tests SQL ont été effectués avec le rôle maintenance, tandis que les permissions du rôle Auth ont été inspectées via le catalogue. **La validation réelle de l'écriture Auth dépend d'une connexion fictive après la correction.**

### 5. Prochaine action : test Auth réel, sans nouvelle modification serveur

1. Avec le PowerShell local déjà configuré, utiliser la clé secrète et la clé publique de la **sandbox exclusivement** ; ne jamais publier les valeurs.
2. Vérifier que les deux comptes fictifs attendus sont les seuls utilisateurs Auth.
3. Redéfinir un mot de passe aléatoire temporaire **uniquement pour `schoolnet-b3-parent@example.test`** (`auth.admin.updateUserById`) puis ouvrir une session par `signInWithPassword`.
4. Vérifier `auth.getUser(access_token)` sans afficher le token ou le mot de passe.
5. **Lire le journal privé** via connexion de maintenance Supabase : attendre au moins un événement `authentication_method=password`, `observation_state=token_pre_issue_unverified`, lié à une vraie `auth.sessions` du même compte.
6. Si 0 observation persiste, **ARRÊTER** : étudier la structure réelle du payload du hook et la RLS au lieu d'élargir les droits. Aucun `activated`.
7. `recovery` et `token_refresh` seulement après validation de `password`, avec autorisation B.5.2 déjà donnée et contrôles ciblés.

### 6. Limitations et retour arrière

La migration de correction est versionnée ; aucune commande de retour arrière destructif n'a été exécutée. En cas d'erreur de connexion Auth, désactiver immédiatement le Custom Access Token Hook **dans la sandbox seulement** via Supabase Authentication → Auth Hooks. Réexaminer ensuite le SQL avec une autorisation explicite avant tout autre changement.

Les observations du hook sont des **événements pré-émission non vérifiés** : même après un test réussi, elles ne suffiront **jamais** à elles seules à confirmer une activation familiale. Le mécanisme `activated` du SCHOOLNET principal reste fermé. Aucun déploiement Vercel ni fusion de PR n'est autorisé.

**POINT DE REPRISE : correctif et tests SQL validés, prochaine connexion Parent fictif puis vérification du journal d'observation.**
