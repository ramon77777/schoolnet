> **ACTUALISATION B.5.1 — 12/11/2026, 10:04 UTC — ACTIVATION DASHBOARD CONFIRMÉE PAR CAPTURE UTILISATEUR.** Dans **`schoolnet-auth-sandbox`** (`onqlsvphmrqhelislpry`), page `Authentication → Auth Hooks`, le hook **`Customize Access Token (JWT) Claims`** est affiché **ENABLED**, type **Postgres function**, schéma `schoolnet_auth_observation`, fonction `observe_access_token`. L'utilisateur a sauvegardé la configuration depuis le Dashboard ; l'écran liste le hook actif. **Ne pas confondre : cette preuve UI confirme l'activation de la configuration, MAIS PAS encore une invocation réelle de la fonction Auth ou la collecte d'une observation.** Contrôles SQL read-only immédiatement après capture : sandbox **2 Auth, 0 dossiers B.2, 0 événements B.2, 0 observations B.5.1, 2 migrations, 1 policy du journal d'observation** ; principal **10 Auth, 35 migrations, 0 invitation, 0 événement, demande `DEM-3CF7B169BAD9` `new`**. Aucun nouveau compte, e-mail, lien, test de connexion, migration ou déploiement effectué lors de cette validation visuelle. **Phase B.5.1 : installation SQL + activation UI confirmées ; recette d'invocation Auth effective NON EFFECTUÉE, GO B.5.2 requis.** En cas d'échec Auth à la prochaine étape, désactiver uniquement le hook de la sandbox dans Dashboard → Auth Hooks, puis vérifier les connexions.

---

# SCHOOLNET — Lot 5.C-B.2 / Étape B.5.1
## Custom Access Token Hook : préparation sécurisée en sandbox — 12 novembre 2026

**STATUT : MIGRATION SQL INSTALLÉE ET RECETTE SQL SIMULÉE VALIDÉE ; ACTIVATION DU HOOK DANS AUTH NON EFFECTUÉE.**

### 1. Autorisation et environnement

L'utilisateur a autorisé le **Custom Access Token Hook en observation dans la sandbox**, avec protections, contrôle des claims et un retour arrière maîtrisé.

- **Sandbox exclusive :** `schoolnet-auth-sandbox` — `onqlsvphmrqhelislpry`, offre Free, région `eu-west-1`.
- **SCHOOLNET principal :** `schoolnet_2.0` — `anttmbhaphkhmkoqsofd` — aucune opération SQL/Auth/Vercel.
- Branche GitHub : `feature/schoolnet-multi-etablissements` ; PR #6 en brouillon, non fusionnée.
- **Aucun compte Auth, lien, e-mail, invitation familiale ou demande métier créé ni modifié pendant B.5.1.**
- Les deux comptes fictifs B.3 dans la sandbox sont conservés ; la fonction temporaire B.3 demeure neutralisée en v2, `verify_jwt=true`.

### 2. Migration et fichiers traçables

- [SQL sandbox uniquement — schéma et observateur](./sql/lot_5_c_b2_b51_SANDBOX_ONLY_custom_access_token_observer.sql).
- [Recette SQL avec ROLLBACK](./sql/lot_5_c_b2_b51_SANDBOX_ONLY_observer_rollback_tests.sql).
- Migration exécutée **exclusivement sur `onqlsvphmrqhelislpry`** : version **`20261112094548`**, nom `schoolnet_auth_sandbox_b51_token_observer`.
- Un contrôle **dry-run** de la migration a réussi sous `BEGIN / ROLLBACK` avant application ; le schéma était absent et les compteurs inchangés.
- Ces fichiers sont dans `docs/sql/` et **pas** dans les migrations automatisées du produit principal.

### 3. Schéma privé et protection des données

La migration crée :
- `schoolnet_auth_observation.token_issue_events`, une table **privée** des observations de pré-émission de jeton contenant uniquement `user_id`, `session_id`, `authentication_method`, source constante, état `token_pre_issue_unverified`, indicateur `synthetic_only=true` et horodatage serveur ;
- `schoolnet_auth_observation.observe_access_token(event jsonb)`, fonction **SECURITY INVOKER** qui renvoie `event` **inchangé** ;
- `schoolnet_auth_observation.reject_observation_mutation()` et trigger append-only, interdisant UPDATE / DELETE ;
- RLS **ENABLE + FORCE**, une policy strictement `FOR INSERT TO supabase_auth_admin`, avec contraintes empêchant tout statut de preuve certifiée ;
- `GRANT USAGE` du schéma, `GRANT EXECUTE` du hook et `GRANT INSERT` du journal **uniquement à `supabase_auth_admin`**, après révocation de `PUBLIC`, `anon`, `authenticated`, `service_role`, `authenticator`.

**Contrôles de catalogue réussis** : rôles `anon`, `authenticated`, `service_role` incapables de lire/injecter des observations ou d'appeler le hook ; le rôle `supabase_auth_admin` peut exécuter la fonction et insérer dans la table mais **ne dispose pas de SELECT sur le journal**. La policy correspond au rôle Auth. La fonction ne peut pas signaler `activated` ni `verified`.

**Prévention des faux positifs :**
- seules les méthodes `password`, `recovery`, `token_refresh`, `magiclink`, `otp`, `invite` sont des **observations candidates** ;
- les événements dépourvus du marqueur administrateur `claims.app_metadata.schoolnet_sandbox=true` sont ignorés ;
- `user_id` et `claims.sub` doivent correspondre ; les IDs des sessions doivent être UUID ;
- doublons `(user_id, session_id, authentication_method)` ignorés ;
- tout échec d'insertion est traité sans altérer les claims ni tenter d'ouvrir les droits Auth ; dans ce cas, **aucune preuve ne peut être considérée disponible** ;
- le hook intervient **avant** l'émission du jeton : même une vraie observation ne prouvera pas à elle seule une connexion réussie.

Aucun mot de passe, lien, hash, e-mail, JWT, jeton d'accès, refresh token, donnée familiale réelle ou donnée scolaire n'est stocké dans le journal.

### 4. Résultats des contrôles SQL et tests transactionnels

**Après installation (lectures vérifiées)** :
- **2 comptes Auth fictifs**, **0** cas B.2, **0** événement B.2 ;
- **0** événement d'observation B.5.1 laissé en base ;
- **2** migrations sandbox (`20261112085040` B.2 et `20261112094548` B.5.1) ;
- le hook `observe_access_token` est `SECURITY INVOKER` (`security_definer=false`) et accessible uniquement au rôle Auth ;
- `token_issue_events` avec RLS activée et forcée, **1 policy d'insertion restreinte**.

La recette transactionnelle a couvert **3 modes simulés**, pass-through exact des claims, rejet des événements non marqués sandbox et des méthodes inconnues, refus d'identité invalide, non-duplication, rejet UPDATE/DELETE et absence de toute « preuve vérifiée ». Tous les scénarios ont réussi sous `BEGIN; ... ROLLBACK;`, sans données conservées.

**Limite de l'outil connecté** : une tentative de `SET LOCAL ROLE supabase_auth_admin` depuis le contexte SQL a été refusée par Postgres (`42501 permission denied to set role`). La recette a été corrigée pour ne **pas** contourner cette séparation des rôles : les privileges/policies ont été vérifiés dans le catalogue, et le comportement de la fonction simulé sous le rôle SQL de maintenance dans une transaction annulée. **Cela n'est pas équivalent à une invocation réelle par Supabase Auth.**

### 5. Ce qui RESTE à faire avant une recette Auth effective

**Le hook n'est PAS encore activé dans la configuration Auth de la sandbox.** La création de la fonction PostgreSQL ne suffit pas à la sélectionner comme Custom Access Token Hook. Le connecteur Supabase actuellement disponible permet le SQL mais **ne fournit pas d'action pour modifier Authentication > Hooks**. Ne pas essayer de modifier des tables de configuration internes pour contourner cette limite.

**Geste manuel requis dans le Dashboard, avec vérification visuelle de la cible sandbox :**
1. Ouvrir [Supabase — sandbox / Authentication / Hooks](https://supabase.com/dashboard/project/onqlsvphmrqhelislpry/auth/hooks).
2. Sélectionner **Custom Access Token** ; choisir **Postgres function**.
3. Choisir `schoolnet_auth_observation.observe_access_token` si la fonction est proposée. **Si la fonction du schéma privé n'apparaît pas, ne pas en inventer une dans `public` ni ouvrir des privilèges ; signaler ce blocage pour revoir la configuration.**
4. Vérifier l'ID projet `onqlsvphmrqhelislpry` et que **le projet principal n'est pas sélectionné**, puis activer et enregistrer **uniquement pour la sandbox**.
5. Contrôler si un message de validation d'Auth apparaît. En cas d'incident de connexion, **désactiver immédiatement le hook dans Authentication > Hooks** et revenir au fonctionnement standard.

**La mise en place SQL et la configuration réelle du hook sont deux opérations différentes**. L'autorisation B.5.1 couvre la préparation ; les essais réels de nouvelle connexion/refresh avec les comptes fictifs relèvent du GO **B.5.2**, distinct.

### 6. Conditions de sécurité et de retour arrière

- Si le hook provoque des erreurs Auth, première action : **désactiver le Custom Access Token Hook dans le Dashboard de la SANDBOX** (ne pas supprimer immédiatement la fonction en cours d'utilisation).
- Vérifier que les connexions normales reviennent à l'état précédent, puis analyser les logs sans lire ni publier de secrets.
- Les migrations et observations B.5.1 sont conservées jusqu'à autorisation spécifique d'une suppression SQL **sandbox uniquement**. Aucune commande DROP n'est exécutée dans B.5.1.
- Les comptes B.3 et les tables B.2 ne sont pas supprimés ni modifiés.
- Les observations de pré-émission ne sont **pas une preuve suffisante de connexion** : la validation ultérieure exige la session réelle, la preuve indépendante du changement du mot de passe, l'identité, la génération d'invitation et un audit immuable.
- Les causes connues de refus restent fail-closed pour l'activation. L'absence d'observation ne doit pas interrompre ou supprimer des comptes.

### 7. Suite et points non validés

B.5.1 a réussi sur la **migration et les tests SQL simulés**. **Ne pas déclarer « hook activé et opérationnel dans Supabase Auth »** tant que l'utilisateur n'a pas confirmé son activation dans le Dashboard et qu'aucune preuve d'invocation réelle n'a été observée.

**Étape immédiate :** sélectionner le hook dans le Dashboard sandbox, vérifier la configuration et envoyer une capture. **Étape B.5.2 (GO distinct) :** tests Auth réels de `password`, `recovery`, `token_refresh` et vérification indépendante des sessions, sans aucun `activated`.

### 8. Références officielles

- https://supabase.com/docs/guides/auth/auth-hooks
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/database/postgres/row-level-security

**SCHOOLNET principal intact ; PR #6 en brouillon ; pas de fusion, pas de Vercel.**
