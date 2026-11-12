> **SCHOOLNET — 12/11/2026 — LOT 5.C-B.2 / B.5.2 : CORRECTIF SQL DU HOOK APPLIQUÉ DANS LA SANDBOX, ESSAI AUTH DE REPRISE EN ATTENTE.** Après une connexion Parent fictif `signInWithPassword` réussie avec une session valide, l'observateur B.5.1 indiquait **0 observation** ; Supabase Auth a néanmoins confirmé `Hook ran successfully` avec `grant_type=password`. Cause technique fortement étayée : `ON CONFLICT ON CONSTRAINT b51_unique_user_session_method DO NOTHING` demande une permission `SELECT` sur les colonnes de l'arbitre selon PostgreSQL 17, alors que `supabase_auth_admin` n'a volontairement que `INSERT`. **Autorisation utilisateur reçue pour correction ciblée** dans `schoolnet-auth-sandbox` (`onqlsvphmrqhelislpry`). Script de migration sous `docs/sql/lot_5_c_b2_b52_SANDBOX_ONLY_token_hook_no_on_conflict_patch.sql` : remplacement strict par un `INSERT` et une exception `unique_violation` ne masquant que la contrainte attendue, **aucun nouveau GRANT / aucune RLS modifiée / aucun claim modifié / aucune activation**. Dry-run SQL en transaction ROLLBACK puis migration `schoolnet_auth_sandbox_b52_fix_hook_conflict_no_select` appliqués avec succès. Vérification post-migration : `SECURITY INVOKER`, `search_path=pg_catalog`, corps du hook corrigé, RLS forcée, INSERT Auth autorisé, SELECT Auth refusé, 1 policy INSERT, aucun USAGE des rôles clients, **2 comptes Auth sandbox / 0 observation / 3 migrations**. Recette SQL B.5.1 simulée (pass-through, méthodes, doublons, immutabilité) **réussie sous ROLLBACK**. Principal `anttmbhaphkhmkoqsofd` inchangé : **10 Auth / 35 migrations / 0 invitations / 0 événements**. **ATTENTION : la correction n'est pas encore vérifiée par une NOUVELLE connexion Auth post-patch**. Prochaine action : le test local Parent fictif `password` (sans afficher les clés), puis lecture de `schoolnet_auth_observation.token_issue_events` pour confirmer une observation corrélée à `auth.sessions`. Si 0 persiste, s'arrêter avant toute ouverture de privilège et analyser les autres conditions du hook. PR #6 toujours brouillon, sans fusion/Vercel. [Rapport correctif B.5.2](./lot-5-c-b2-b52-correction-hook-insert-2026-11-12.md).

---

> **POINT DE REPRISE SCHOOLNET — 12/11/2026, 10:04 UTC — B.5.1 HOOK AUTH ACTIVÉ DANS LA SANDBOX, PAS ENCORE TESTÉ EN CONDITIONS RÉELLES.** L'utilisateur a sélectionné le projet `schoolnet-auth-sandbox` (`onqlsvphmrqhelislpry`) et enregistré dans Authentication → Auth Hooks le hook **Customize Access Token (JWT) Claims** (Postgres, `schoolnet_auth_observation.observe_access_token`) ; capture montre **ENABLED**. Les SQL et tests de B.5.1 étaient déjà validés par simulation/ROLLBACK, avec contrôle des privilèges ; **aucun login Auth réel n'a encore déclenché le hook depuis son activation**, et le journal des observations reste **0 ligne**. Vérification SQL non mutatrice après capture : sandbox **2 comptes Auth fictifs / 0 dossiers B.2 / 0 événements B.2 / 0 observations B.5.1 / 2 migrations**. Principal `anttmbhaphkhmkoqsofd` **10 Auth / 35 migrations / 0 invitation / 0 événement / demande fictive `new`**, inchangé. Aucune activation familiale `activated`, aucun déploiement Vercel, aucune fusion PR #6 (brouillon). **Étape suivante à soumettre au GO B.5.2 distinct** : essai d'invocation réelle du hook en sandbox avec les comptes fictifs, mesurer les observations `password`, `recovery`, `token_refresh` et corréler à `auth.sessions` ; pas d'écriture au principal. Consigne rollback : désactiver le hook dans le Dashboard sandbox si une erreur Auth apparaît. Voir [rapport B.5.1](./lot-5-c-b2-b51-custom-access-token-hook-sandbox-2026-11-12.md).

---

> **SCHOOLNET — 12/11/2026 — LOT 5.C-B.2 / B.5.1 : OBSERVATEUR TOKEN SQL INSTALLÉ ET TESTÉ DANS LA SANDBOX ; HOOK AUTH PAS ENCORE ACTIVÉ.** Accord utilisateur pour installation en observation et retour arrière contrôlé, cible exclusive Supabase `onqlsvphmrqhelislpry` ; principal `anttmbhaphkhmkoqsofd` intact. Migration SQL sandbox **`20261112094548_schoolnet_auth_sandbox_b51_token_observer`**, script auditable `docs/sql/lot_5_c_b2_b51_SANDBOX_ONLY_custom_access_token_observer.sql`, séparé des migrations du produit. Nouveau schéma privé `schoolnet_auth_observation`, table `token_issue_events`, hook SQL `observe_access_token(jsonb)` `SECURITY INVOKER` retournant l'événement **strictement inchangé**, statut fixé `token_pre_issue_unverified`, aucun statut `verified/activated`, aucune donnée sensible. `RLS ENABLE+FORCE`, policy INSERT restreinte à `supabase_auth_admin`, uniquement EXECUTE/INSERT sous ce rôle et aucun SELECT, accès `anon/authenticated/service_role` refusé ; journal append-only et dédoublonnage. Test DDL préalable sous ROLLBACK réussi ; recette SQL `docs/sql/lot_5_c_b2_b51_SANDBOX_ONLY_observer_rollback_tests.sql` passée sous ROLLBACK : modes `password/recovery/token_refresh` simulés, claims conservés, filtrage des non-sandbox, doublons refusés, append-only. **Attention** : le connecteur SQL a refusé `SET LOCAL ROLE supabase_auth_admin` (`42501`) ; pas de contournement, tests fonctionnels exécutés en simulation sous rôle maintenance, privilèges et RLS vérifiés par catalogue. Sandbox à contrôler : **2 comptes Auth fictifs, 0 événement B.2/B.5.1, 2 migrations**. **L'activation dans Supabase Authentication > Hooks n'a pas été effectuée**, car le connecteur ne fournit pas cette action : l'utilisateur doit sélectionner manuellement `schoolnet_auth_observation.observe_access_token` sur la sandbox ; si non visible, interrompre. **Ne pas déclarer le hook activé** avant confirmation UI puis tests réels B.5.2 sous GO séparé. La fonction B.3 v2 reste neutralisée ; aucune action Auth réelle, migration ni déploiement du principal, aucune fusion PR #6 ni Vercel. Rapport : [B.5.1 — SQL et contrôles](./lot-5-c-b2-b51-custom-access-token-hook-sandbox-2026-11-12.md).

---

> **SCHOOLNET — 12/11/2026 — LOT 5.C-B.2 / B.4 : ÉTUDE DE PREUVES AUTH DURABLES TERMINÉE EN LECTURE SEULE.** Accord utilisateur limité à la **conception et aux contrôles, sans écriture SQL/Auth, nouveau hook ou déploiement**. Rapport : [B.4 — architecture compatible Supabase Free](./lot-5-c-b2-b4-architecture-preuves-auth-free-2026-11-12.md). **Découverte confirmée dans la documentation officielle :** `Custom Access Token Hook` est accessible **Free/Pro** et reçoit une valeur serveur `authentication_method` (`password`, `recovery`, `magiclink`, `otp`, `token_refresh`), avec `user_id` et `claims.session_id`. Le `Password Verification Attempt Hook` reste **Team/Enterprise uniquement** et ne doit pas être considéré comme une dépendance Free. Contrôles réels sandbox `onqlsvphmrqhelislpry` : **2 comptes Auth fictifs**, **3 sessions `aal1`**, **0 trace `auth.audit_log_entries`**, **0 dossier/preuve B.2**, **1 migration**, **aucune fonction custom hook**, aucun droit `USAGE`/`INSERT` de `supabase_auth_admin` dans le schéma privé B.2. Logs externes Auth B.3 : **9 événements audit** dont `login` 4, `user_updated_password` 1 ; `provider=email` ne prouve **pas** la méthode `password`, pas de champ `authentication_method` dans les métadonnées visibles. Fonction temporaire B.3 **v2 neutre**, fonction familiale du principal **v2 verrouillée**. Principal inchangé : **10 Auth, 35 migrations, 0 invitation/événement, demande `DEM-3CF7B169BAD9` `new`**. **ARCHITECTURE NON IMPLÉMENTÉE :** preuve de changement de mot de passe indépendante et fiable + observation Auth de la méthode via le hook Free + vérification post-émission de session + lien génération/dossier + transition CAS/audit seulement après GO. Un événement de hook intervient **avant** l'émission du jeton et ne vaut donc pas preuve de connexion terminée sans vérification. **Ne pas toucher aux tables B.2 `synthetic_only`** ; nouvelle migration uniquement sous GO. Aucune modification SQL, compte, lien, hook, Edge, frontend, Vercel ni fusion PR #6. **Prochaine autorisation distincte à solliciter : B.5.1, observation du Custom Access Token Hook UNIQUEMENT sur la sandbox, initialement `claims` inchangés et sans activation.**

---

> **SCHOOLNET — 12/11/2026 — LOT 5.C-B.2 / PHASE B.3 : RECETTE AUTH EN SANDBOX RÉUSSIE, FONCTION TEMPORAIRE NEUTRALISÉE.** Autorisation utilisateur pour comptes fictifs et tests Auth uniquement dans `onqlsvphmrqhelislpry`. Source de test archivée sous `docs/sandbox/b3/edge/index.ts`, fonction de recette sandbox déployée **v1** avec authentification **GitHub OIDC signée** (pas de clé `service_role` dans GitHub) ; workflow unique [`schoolnet-auth-sandbox-b3-once.yml`](../.github/workflows/schoolnet-auth-sandbox-b3-once.yml), **run GitHub `43190361763` success**. Résultats : anonyme **401**, préflight OIDC **200**, création **2 comptes fictifs** Parent/Apprenant `@example.test`, mauvais mot de passe refusé, bonnes connexions, `generateLink(recovery)` sans email, `verifyOtp`, `updateUser(password)`, rejouage token refusé, ancien mot de passe refusé, connexion avec nouveau mot de passe réussie ; second appel **409** sans doublon. L'audit externe Supabase sandbox montre **1 `user_updated_password`** et des événements login, mais **pas encore une preuve métier durable de méthode de connexion** ; table `auth.audit_log_entries` vide. Contrôle DB : sandbox **2 Auth, 0 cas/événement privé B.2, 1 migration, 0 table publique**. La fonction temporaire a été immédiatement **redéployée en v2 neutre (`verify_jwt=true`, réponse prévue HTTP 410, aucun code de création/lien)**. Principal `anttmbhaphkhmkoqsofd` inchangé : **10 Auth, 35 migrations, 0 invitations/événements, demande `DEM-3CF7B169BAD9` toujours `new`**. Aucun envoi d'invitation ou email de récupération n'a été demandé par le code, aucune activation réelle, aucun Vercel et aucune fusion PR #6. Rapport complet : [B.3 — tests Auth réels sandbox](./lot-5-c-b2-b3-sandbox-auth-first-login-2026-11-12.md). **Suite : étudier sous GO distinct les preuves serveur durables compatibles Free, sans déverrouiller la fonction familiale principale.**

---

> **SCHOOLNET — 12/11/2026 — Lot 5.C-B.2, ÉTAPE B.2 VALIDÉE DANS LA SANDBOX UNIQUEMENT.** Autorisation explicite reçue pour les premières tables privées de tests et une recette annulée par `ROLLBACK`. Cible exclusive Supabase `schoolnet-auth-sandbox` (**`onqlsvphmrqhelislpry`**), distincte du principal **`anttmbhaphkhmkoqsofd`**. Migration sandbox **`20261112085040_schoolnet_auth_sandbox_b2_private_evidence`**, SQL strictement archivé sous `docs/sql/` (**pas `supabase/migrations` du projet principal**). Schéma privé `schoolnet_auth_sandbox` : deux tables `invitation_cases` et `activation_evidence_events`, RLS **ENABLE + FORCE**, aucun accès `anon`/`authenticated`/`service_role`, aucune policy (fermeture volontaire), fonction `SECURITY INVOKER` et trigger empêchant UPDATE/DELETE du journal. Types de preuves **uniquement synthétiques**, `proof_verified=true` et statut `activated` interdits. Test de 9 refus (doublon, FK identité, statut activé, preuve vérifiée, source incohérente, futur, UPDATE, DELETE, doublon événement) : **9/9 validés** ; premier essai a révélé une erreur du scénario de FK, corrigée avant succès ; toutes les insertions fictives ont été annulées par **`ROLLBACK`**. Post-test sandbox : **0 Auth, 0 dossier, 0 événement, 0 table publique, 1 migration** ; Security Advisor : **1 INFO `rls_enabled_no_policy` attendu**. Principal inchangé : **10 Auth, 35 migrations, 0 invitations familiales, 0 événements, demande fictive `new`, fonction famille v2 ACTIVE `verify_jwt=true`**. Aucun hook, lien, email, activation, déploiement Edge/Vercel ni fusion PR #6. Documents : [B.2 — rapport de recette](./lot-5-c-b2-b2-sandbox-sql-securite-2026-11-12.md), [SQL sandbox](./sql/lot_5_c_b2_b2_SANDBOX_ONLY_private_schema.sql), [tests ROLLBACK](./sql/lot_5_c_b2_b2_SANDBOX_ONLY_rollback_tests.sql). **PROCHAINE ÉTAPE : demander GO B.3 DISTINCT avant tout compte fictif, lien de récupération ou test Auth réel ; vérifier le canal de messagerie et la source de preuve compatible Free.**

---

> **SCHOOLNET — 12/11/2026 — Lot 5.C-B.2 / PHASE B.1 VALIDÉE : SANDBOX AUTH SUPABASE FREE CRÉÉE ET ISOLÉE.** Autorisation utilisateur reçue explicitement pour la création du deuxième projet Free **à 0 USD/mois**, dans l'organisation existante `schoolnet 2.0`. Le tarif 0 USD/mois a été reconfirmé immédiatement avant création, ainsi que 1 seul projet actif auparavant. Le projet `schoolnet-auth-sandbox`, référence **`onqlsvphmrqhelislpry`**, a été créé en région `eu-west-1` et vérifié `ACTIVE_HEALTHY`. Deux projets Free actifs figurent désormais dans l'organisation : principal **`anttmbhaphkhmkoqsofd`** et sandbox indépendante **`onqlsvphmrqhelislpry`**. Lectures de la sandbox : **0 compte Auth, 0 table publique, aucun historique de migrations SCHOOLNET, aucune Edge Function**. Projet principal vérifié après création : **10 Auth, 35 migrations, 0 invitations, 0 événements, demande fictive `DEM-3CF7B169BAD9` toujours `new`, Edge familiale v2 `verify_jwt=true`**. Aucun schéma, compte, invitation, e-mail, lien, secret, addon payant, déploiement Supabase principal, fusion PR #6 ou Vercel. Rapport : [B.1 — sandbox créée](./lot-5-c-b2-b1-sandbox-cree-2026-11-12.md). **PROCHAINE ÉTAPE : demander un GO distinct B.2 pour créer le schéma de tests minimal dans la sandbox UNIQUEMENT** ; aucune écriture SQL/Auth encore autorisée. La PR #6 reste en brouillon.

---

> **SCHOOLNET — 12/11/2026 — Lot 5.C-B.2 : PHASE B.0 / PRÉPARATION SANDBOX AUTH TERMINÉE, AUCUNE CRÉATION.** Accord utilisateur limité à préparer un environnement d'essai Supabase isolé et à vérifier coûts/capacité ; **pas de GO pour créer un projet ni engager une dépense**. Contrôle en direct : organisation `schoolnet 2.0` sur **Free**, **1 projet visible et actif** (`schoolnet_2.0`) ; documentation Supabase = 2 projets Free actifs autorisés au total par Owner/Admin. Outil officiel `get_cost` : **0 USD/mois** pour un nouveau projet dans cette organisation ; devis d'une branche séparée **0,01344 USD/heure**, non retenue. Nouveau projet proposé **`schoolnet-auth-sandbox`** dans la même organisation, région `eu-west-1`, uniquement après GO **B.1** et nouvelle vérification coût/quota. Deux niveaux prévus : tests locaux Docker/CLI + Mailpit sans e-mails externes, puis hébergement Free indépendant si autorisé. Limitation Free SMTP : sans SMTP personnalisé, envoi seulement aux adresses préautorisées de l'équipe ; ne pas envoyer vers `@example.test` en cloud. Chaque étape ultérieure est soumise à GO distinct (B.1 création, B.2 schémas test, B.3 comptes fictifs/liens, B.4 intégration). **Aucune clé/variable, base, fonction Edge, utilisateur, PR, Vercel ou configuration Supabase du principal n'a été modifiée**. Voir [Plan B.0 — sandbox Auth](./lot-5-c-b2-b0-sandbox-auth-plan-2026-11-12.md). **PROCHAIN GESTE :** demander à l'utilisateur l'autorisation explicite de créer le second projet Free à 0 USD/mois sans add-on, sans y créer de comptes ni migration. PR #6 en brouillon.

---

> **POINT DE REPRISE — 12/11/2026 — 5.C-B.2 / ÉTAPE A.2.3 : AUDIT DE PROVENANCE AUTH TERMINÉ SANS ÉCRITURE.** L'utilisateur a autorisé une étude et des vérifications en lecture seule. [Rapport A.2.3](./lot-5-c-b2-etape-a2-3-provenance-auth-2026-11-12.md). **Découverte bloquante à prendre en compte :** l'organisation Supabase du projet SCHOOLNET est sur **Free** ; le **Password Verification Attempt Hook**, supposé nécessaire par le prototype A.2.2, est réservé **Team / Enterprise** selon la documentation officielle. Donc **NE PAS** chercher à activer ce hook sur le projet actuel et **NE PAS** interpréter les 30 tests Deno simulés comme une preuve de fonctionnement Free. **Audit PostgreSQL** : \`auth.audit_log_entries\` existe mais comporte **0 événement**, \`service_role\` n'a **pas le droit SELECT** ; sur les dernières 24 h, journaux externes \`auth_audit_logs\` (**24** événements dont **3 mentions login**, **0 mention user_updated_password**), \`auth_logs\` (**47** événements) : aucune preuve réelle exploitable de changement de mot de passe et première connexion password. Audit du frontend : \`ResetPasswordPage\` autorise une session \`SIGNED_IN\` ou récupérée à afficher le formulaire ; cette session ne prouve pas la méthode de connexion. **Décision A.2.3 : fail-closed, conserver activation non confirmée**, concevoir sur **Supabase Free** un chemin de preuve de changement de mot de passe et, séparément, une preuve de connexion explicite au mot de passe à éprouver en **projet isolé** et sous GO distinct ; si impossible, conserver un état intermédiaire et ne pas afficher \`activated\`. Aucun code applicatif modifié durant A.2.3, aucune migration, aucun hook, aucun compte/lien, aucun déploiement Edge/Vercel, aucune fusion PR #6. Base principale conservée à 35 migrations, 10 Auth, 0 invitation, 0 événement. **Action suivante :** examiner avec l'utilisateur le protocole de tests en environnement isolé ; demander GO distinct avant toute création de projet, coût, mise en place de la preuve ou écriture.

---

> **POINT DE REPRISE — 11/11/2026, 17:03 UTC — Lot 5.C-B.2 / Étape A.2.2 VALIDÉE EN LOCAL (SANS ÉCRITURE).** Le frontend et le vérificateur de preuve d'activation ont été synchronisés depuis GitHub (commit `329f9b4`) et testés : ESLint 0 erreur (1 avertissement connu), `prebuild` et TypeScript/Vite réussis. CI : **30/30 tests Deno hors ligne** + `deno check` réussis. Recette Super Admin sur `DEM-3CF7B169BAD9` : Parent/Apprenant montrent en même temps `new_invitation_possible`, transmission en attente, activation non confirmée, preuve serveur indisponible, sans action mutatrice. Supabase : deux `POST 200` à **17:02:47** et **17:02:52 UTC** ; compteurs **10 Auth, 0 invitations, 0 événements, 35 migrations, demande `new`, 0 résolution**. Edge déployée v2 **non modifiée**, JWT vérifié et verrou de lecture seule actif. **A.2.2 validée UNIQUEMENT comme logique simulée et affichage consultatif** : aucune preuve Auth réelle n'est collectée, aucune confirmation d'activation et aucune création de compte n'est autorisée. PR #6 toujours brouillon, sans fusion ni Vercel. **Étape suivante à proposer :** cadrage et vérification en environnement Supabase isolé de sources de preuve serveur, audit immuable, redirection Auth et scénarios de première connexion. Exiger nouvelle autorisation avant toute activation de hooks, migration, écriture ou déploiement.

---

> **POINT DE REPRISE — 11 novembre 2026, SCHOOLNET 5.C-B.2 : ÉTAPE A.2.2 CODÉE SUR GITHUB, RECETTE LOCALE EN ATTENTE.** Accord obtenu pour la **preuve sécurisée d'activation sans écriture**. Création de `supabase/functions/_shared/familyActivationEvidence.ts` (évaluateur pur, refus par défaut) et `familyActivationEvidence_test.ts` (**30 tests Deno simulés, zéro accès Supabase**). La fonction préparatoire `schoolnet-family-invitation/index.ts` appelle le vérificateur uniquement avec `authUser:null`, `passwordUpdated:null`, `validPasswordVerified:null`, `passwordLogin:null` : elle ne peut donc pas confirmer d'activation ; un statut registre `activated` sans preuve est requalifié `manual_review`. Le frontend montre une ligne « Preuve serveur : non disponible » tant qu'aucun mécanisme Auth complet n'est déployé. Le script `prebuild` vérifie les sources nulles et l'absence de toute action `confirm_activation`. GitHub Actions **run `43061453579`** : ESLint, build TypeScript/Vite, prébuild, `deno check` et **30/30 tests Deno** réussis (11/11/2026 vers 16:46 UTC). Sources envisagées pour un FUTUR essai isolé : `auth.audit_log_entries` (`user_updated_password`, `login`) et Password Verification Hook (`valid:true`), à raccorder uniquement côté serveur après audit de provenance, droits et tests séparés. Ces sources **NE SONT PAS installées ni lues** aujourd'hui ; le code ne fait pas de SQL. La page existante `ResetPasswordPage` accepte actuellement `SIGNED_IN` pour montrer le formulaire : une validation spécifique du parcours `family-invite` sera à concevoir avant ouverture. Documentation : [protocole A.2.2](./lot-5-c-b2-etape-a2-2-preuve-activation-2026-11-11.md). **À faire maintenant :** sécuriser les modifications locales, synchroniser GitHub, `npm run lint`, `npm run build`, test de l'interface A.2.2 dans Demandes publiques → `DEM-3CF7B169BAD9` en lecture seule. **Aucun GO** pour créer des comptes, activer les hooks, faire des migrations, déployer la nouvelle fonction Supabase, fusionner PR #6 ou publier Vercel. A.2.2 est développée et contrôlée par CI, **pas encore recettée localement ni déployée**.

---

> **POINT DE REPRISE SCHOOLNET — 11/11/2026 16:31 UTC — 5.C-B.2 ÉTAPE A.2.1 RECETTÉE LOCALEMENT.** Tests du PC : `npm run lint` 0 erreur (1 warning connu), `npm run build` + `prebuild` réussis ; CI GitHub lint, build et `deno check` réussie. Le Super Admin a ouvert `DEM-3CF7B169BAD9` dans Demandes publiques sur `localhost:5173` et a inspecté Parent puis Apprenant. Les deux cartes conservent `new_invitation_possible` et affichent le suivi distinct **« Transmission : suivi A.2 serveur en attente de publication »**, **« Activation : non confirmée »**, sans bouton d'écriture. Journaux Supabase 16:30 UTC : deux `POST 200` ; SQL après recette : **10 Auth, 0 invitations, 0 événements, 35 migrations, demande fictive `new`, 0 résolution**. **A.2.1 VALIDÉE POUR L'INTERFACE EN LECTURE SEULE** ; aucune preuve ou activation Auth réelle. Edge distante demeure v2 `verify_jwt=true`, le code GitHub A.2 (`declare_sent` verrouillé) **n'est PAS déployé**. PR #6 brouillon, pas de fusion, pas de Vercel. **Suite recommandée : A.2.2 — concevoir une preuve serveur fiable de l'activation et audit immuable, d'abord sans écriture ni activation, validation distincte avant nouvelle étape.** Protocole : [Étape A.2.1](./lot-5-c-b2-etape-a2-suivi-transmission-activation-2026-11-11.md).

---

> **SCHOOLNET — 11/11/2026, Lot 5.C-B.2, ÉTAPE A.2.1 : CODE PRÉPARÉ SUR GITHUB ; RECETTE LOCALE EN ATTENTE.** L'utilisateur a autorisé l'avancement de l'Étape A.2 en mode **sans écriture**. La branche `feature/schoolnet-multi-etablissements` inclut désormais une action dormant `declare_sent` derrière le verrou permanent `READ_ONLY_DEPLOYMENT=true` et le contrôle du dossier/destinataire pilote. L'action future exigerait preuve d'attestation admin, canal manuel, justification, correspondance Auth/profil et transition SQL atomique `prepared → sent_declared`. Le code et le client exposent en lecture seule les nouveaux champs `delivery_status`, `delivery_declared_at`, `activation_status` et `activation_evidence_verified:false`. **Aucune activation Auth n'est codée ou autorisée : les champs `last_sign_in_at` ou `email_confirmed_at` ne prouvent pas seuls la création d'un mot de passe.** Le panneau Parent/Apprenant indique « suivi A.2 serveur en attente de publication » lorsque le serveur distant v2 ne connaît pas les nouveaux champs ; aucun bouton d'écriture ajouté. `scripts/check-family-readonly.mjs` vérifie statiquement les garde-fous A.2. `.github/workflows/schoolnet-quality.yml` exécute désormais un `deno check --node-modules-dir=auto` pour éviter les erreurs de syntaxe Edge. CI GitHub **run `43054088371` : ESLint, TypeScript/Vite, prébuild et Deno TOUS RÉUSSIS** après correction de l'installation des dépendances npm pour Deno. La fonction Supabase **reste version 2 ACTIVE sans la nouvelle action `declare_sent`**, `verify_jwt=true`, verrou actif. Contrôle après code : **35 migrations, 10 comptes Auth, 0 invitations et 0 événements, demande fictive `DEM-3CF7B169BAD9` toujours `new`, 0 résolution**. PR #6 toujours brouillon et non fusionnée ; aucun Vercel. Protocole de recette : [A.2.1 — transmission et activation](./lot-5-c-b2-etape-a2-suivi-transmission-activation-2026-11-11.md). **Prochain geste : synchronisation locale sûre, lint/build puis inspection parent/apprenant pour vérifier les libellés en lecture seule ; documenter ensuite la recette A.2.1.** A.2.2 (preuve serveur d'activation et audit de transmission immuable) reste à développer ; aucun GO d'écriture n'a été reçu.

---

> **VALIDATION A.1 — 11 novembre 2026 à 15:38 UTC — Lot 5.C-B.2.** Après synchronisation GitHub (`452c32d`), tests locaux : `npm run lint` 0 erreur et 1 avertissement préexistant, `npm run build` réussi avec script `prebuild` de contrôle de sécurité. Recette Super Admin sur demande `DEM-3CF7B169BAD9` : les cadres Parent et Apprenant affichent **en même temps** `new_invitation_possible`, « Inspection confirmée — aucune écriture », aucune invitation enregistrée et les précautions administratives. Logs Supabase à 15:37 UTC : 2 `POST 200`; SQL de contrôle : 10 Auth inchangés, 0 invitations, 0 événements, 35 migrations, demande `new`, 0 rattachement finalisé. **A.1 VALIDÉE EN LOCAL.** Garde-fous futurs du code Edge non déployés ; Edge distante v2 en lecture seule, aucun compte, aucune invitation, aucun Vercel, PR #6 brouillon non fusionnée. **Suite : A.2 — préparer transitions `sent_declared` / `activated`, preuves serveur et suivi d'état, sans lever verrou ni lancer des écritures.** Document : [Recette A.1](./lot-5-c-b2-etape-a1-gardes-et-preflight-2026-11-11.md).

---

> **SCHOOLNET — 11/11/2026, Étape A.1 du Lot 5.C-B.2 IMPLÉMENTÉE SUR GITHUB, RECETTE LOCALE EN ATTENTE.** Accord reçu pour l'Étape A **sans aucune écriture**. Source Edge : verrou `READ_ONLY_DEPLOYMENT=true` conservé et future ouverture bornée côté serveur par `SCHOOLNET_FAMILY_PILOT_REQUEST_ID` + `SCHOOLNET_FAMILY_PILOT_RECIPIENT`, en plus du flag existant ; adresses de test réservées refusées pour les opérations futures. `supabase/config.toml` précise `verify_jwt=true`. Le script `scripts/check-family-readonly.mjs` s'exécute en `prebuild` et fait échouer le build si les verrous sont retirés par inadvertance. L'assistant de demandes publiques affiche séparément les résultats `inspect` Parent et Apprenant, sans ajouter de bouton d'écriture, et masque les réponses périmées si la demande/adresse change. Le workflow GitHub **SCHOOLNET — Vérifications du code**, run `43045345687`, a validé lint + TypeScript/Vite sur le commit code `9fa0af5`. **Aucune nouvelle Edge Function déployée** : Supabase reste sur **v2** `verify_jwt=true`, `READ_ONLY_DEPLOYMENT=true`, 35 migrations, 10 Auth, 0 invitations/événements ; demande fictive toujours `new`. Documentation de recette : [Étape A.1 — gardes et préflight](./lot-5-c-b2-etape-a1-gardes-et-preflight-2026-11-11.md). **Prochaine action** : utilisateur `git status` local, puis synchronisation sûre, lint, build (prébuild attendu), navigation Super Admin → Demandes publiques → `DEM-3CF7B169BAD9`, inspecter Parent puis Apprenant et vérifier la persistance des deux résultats sans écriture. Ne pas commencer A.2 avant validation locale A.1. Aucune fusion PR #6, aucun Vercel, aucune migration, aucun compte ou lien.

---

> **PLANIFICATION — 11 novembre 2026 — 5.C-B.2 : ACTIVATION CONTRÔLÉE PRÉPARÉE, NON AUTORISÉE.** Une revue technique détaillée du code Edge (v2), du registre SQL et de l'interface Auth a été menée **sans migration, déploiement, création de compte ni génération de lien**. Les tests `inspect`/JWT/roles de la phase lecture seule sont validés. Le nouveau document directeur de sous-phase est [Plan d'activation contrôlée 5.C-B.2 (11/11/2026)](./lot-5-c-b2-plan-activation-controlee-2026-11-11.md). **Écarts principaux identifiés :** transitions `sent_declared` / `activated` non implémentées de bout-en-bout, interface de préparation non raccordée, redirection HTTPS Vercel incompatible avec une recette locale complète sans environnement Auth isolé, risque d'orphelin Auth après crash, nécessité de limiter une future activation côté serveur au dossier pilote. Security Advisor signale des vérifications pour `handle_new_user` (search_path mutable et exposition EXECUTE), à auditer avant DDL. **Ordre impératif** : A) durcissement + code/tests non mutateurs après nouveau GO ; B) recette Auth isolée après GO écritures d'essai ; C) pilote principal limité après GO ; D) finalisation et Vercel après GO. **Verrou actuel `READ_ONLY_DEPLOYMENT=true` conservé.** À ce point de reprise : Supabase 35 migrations, 10 comptes Auth, 0 invitation/événement, demande fictive toujours `new`; PR #6 en brouillon et non fusionnée.

---

> **POINT DE REPRISE VALIDÉ — 11/11/2026, 14:24 UTC — LOT 5.C-B.2 : PHASE LECTURE SEULE / AUTORISATION TERMINÉE.** Tous les tests réellement exécutés : Super Admin `inspect` → HTTP 200 (Parent existant `reuse_after_verification`, Parent et Apprenant fictifs `new_invitation_possible`) ; sans JWT → 401 ; JWT invalide → 401 ; Parent authentifié → 403 ; Administrateur d'établissement authentifié (`school_admin`) → **403**, confirmation journaux à 14:24:36 UTC. Intégrité Supabase confirmée après le test : 10 comptes Auth, 0 invitations familiales, 0 événements, 35 migrations, demande `DEM-3CF7B169BAD9` toujours `new` et 0 résolution. Edge v2 `verify_jwt=true`, `READ_ONLY_DEPLOYMENT=true` maintenu. **Suite proposée, non autorisée à ce jour :** spécifier une activation progressive et sécurisée des invitations/liaisons de comptes, en détaillant prérequis, reprise, audits et rollback, puis demander un GO spécifique avant toute écriture réelle. PR #6 toujours en brouillon, pas de fusion ni Vercel. Le PC local doit être synchronisé depuis GitHub avant toute prochaine modification/test frontend ; les dernières modifications sauvegardées ici sont seulement documentaires.

---


> **SCHOOLNET — 11/11/2026, 14:18 UTC — LOT 5.C-B.2 : PHASE INSPECTION / SÉCURITÉ LECTURE SEULE VALIDÉE.** Super Admin : `inspect` Parent existant `reuse_after_verification` ; Parent et Apprenant fictifs `new_invitation_possible`, `POST 200`. Rejets HTTP testés : **sans session → 401**, **JWT invalide → 401**, **session authentifiée Parent (rôle non admin) → 403** (journal Supabase `POST 403`, 14:18:30). Après ces essais : 10 comptes Auth, 0 invitations, 0 événements, demande `DEM-3CF7B169BAD9` toujours `new`, 0 résolution. Fonctions d'écriture **toujours désactivées par verrou serveur** `READ_ONLY_DEPLOYMENT=true` ; aucun e-mail, compte, lien, migration supplémentaire, fusion PR #6 ou Vercel. **Sous-phase validée** : inspection et refus ciblés. **5.C-B.2 global non terminé** : activation réelle des invitations, gestion de reprise et tests Auth restent soumis à un GO distinct. Le rôle `school_admin` peut être testé séparément en négatif avant l'activation, compte tenu du modèle multi-établissements. Note hors périmètre : console navigateur avec avertissements Realtime/Vite à surveiller indépendamment.

---

> **SÉCURITÉ 5.C-B.2 — 11/11/2026, 14:05 UTC : refus 401 CONFIRMÉS.** Deux essais HTTP réels depuis Windows : `POST` sans authentification → **401** ; `POST` avec JWT volontairement invalide → **401**. Les journaux Supabase montrent les deux `POST 401` ; le problème TLS Schannel a été contourné avec `--ssl-revoke-best-effort` sans `--insecure`. Contrôle base inchangé : 10 comptes Auth, 0 invitations, 0 événements, demande de test toujours `new`, 0 résolution. **Prochain test : HTTP 403 avec session réellement authentifiée de rôle non admin** depuis `localhost:5173` via `supabase.functions.invoke` (sans afficher le JWT). Fonction version 2, verrou `READ_ONLY_DEPLOYMENT=true` maintenu ; aucune activation et aucun Vercel. Test 403 non encore réalisé : ne pas confondre contrôle de code avec résultat HTTP.

---

> **SÉCURITÉ 5.C-B.2 — 11/11/2026, contrôle statique et SQL conforme, recettes HTTP négatives EN ATTENTE.** Fonction Edge v2 confirmée, `verify_jwt=true`, code `auth.getUser`, contrôle strict `profiles.role='admin'`, `READ_ONLY_DEPLOYMENT=true`. ACL des deux tables : `anon/authenticated` sans `SELECT/INSERT`, `service_role` sans `DELETE`; RLS + FORCE RLS actives. Base inchangée : 35 migrations, 10 Auth, 0 invitations/événements, demande de test toujours `new`. **Prochaine action :** effectuer depuis Windows les deux POST négatifs vers la fonction (sans Authorization et avec `Bearer invalid-test-token`) et vérifier HTTP 401. Ensuite, avec une session normale Parent / Enseignant ou `school_admin`, vérifier HTTP 403 en appelant uniquement `inspect`, sans communiquer de jeton. Les tests HTTP négatifs ne sont pas encore validés ; ne pas déployer Vercel ni activer les écritures.

---

> **ÉTAT DE PILOTAGE — 11/11/2026, après recette locale 5.C-B.2 : contrôles `inspect` Parent/Apprenant RÉUSSIS.** Demande fictive `DEM-3CF7B169BAD9` : les deux boutons renvoient « Inspection confirmée — aucune écriture » et la décision `new_invitation_possible` pour chaque destinataire. Journaux serveur : `POST 200`, `OPTIONS 200`. Base après la recette : 10 comptes Auth inchangés, 0 registre familial, 0 événement, 0 résolution de la demande, statut `new`, 1 notification interne (création). Le scénario précédent « Parent existant → `reuse_after_verification` » avait également réussi. **Ne pas clôturer intégralement 5.C-B.2** : il faut encore les tests de refus d'accès sans JWT/avec rôle non autorisé et, après GO séparé, les tests Auth de préparation et d'activation. Double verrou d'écriture de la fonction v2 inchangé ; pas de migration, de fusion vers `main` ou de Vercel. **Prochaine étape recommandée : recette négative d'autorisation en lecture seule.**

---

> **POINT DE REPRISE — 11/11/2026 : 5.C-B.2, scénario apprenant avec e-mail personnel PRÊT POUR RECETTE LOCALE.** Après l'inspection Parent existant déjà validée, l'utilisateur a autorisé une seule demande fictive. Création contrôlée dans Supabase : référence **`DEM-3CF7B169BAD9`**, id `f12a07f3-095e-4a2d-b707-849c250d9915`, statut `new`, niveau `6e`, adresses personnelles distinctes en `@example.test`. Un déclencheur existant a généré **une notification interne admin**. Compteurs après création : 10 comptes Auth inchangés, 0 invitation familiale, 0 événement familial, 0 résolution annuelle. **ACTION SUIVANTE UNIQUE :** dans `localhost:5173`, aller à Super Admin → Demandes publiques, ouvrir la demande référence `DEM-3CF7B169BAD9`, déplier « Recette serveur 5.C-B.2 », cliquer **uniquement** sur « Inspecter le parent » puis « Inspecter l'apprenant » et envoyer les captures. Vérifier `new_invitation_possible`, `no_write`, absence de créations et refus des rôles non autorisés (recette ultérieure). L'étape n'est pas encore clôturée et aucun déploiement Vercel n'est autorisé. Pas de modification du code applicatif pour cette création fictive.

---

> **ÉTAT ACTUALISÉ — 11/11/2026, 12:44 UTC — 5.C-B.2, inspection Parent existant VALIDÉE en local.** Fonction Supabase v2 : `OPTIONS 200`, `POST 200` (journaux). L'interface `localhost:5173` affiche `reuse_after_verification` et « aucune écriture ». Comptage base après recette : invitations 0, événements 0, Auth 10. L'enfant sans email personnel reste hors sous-lot 5.C-B.2 ; bouton d'inspection Apprenant désactivé conformément au contrat. Pas de demande active avec email personnel Apprenant disponible pour la recette au dernier contrôle. **5.C-B.2 n'est pas encore clôturé dans son ensemble** : vérifier refus des rôles non autorisés et scénario d'inspection d'un apprenant ayant un email propre avec données fictives autorisées. Aucune création Auth ni invitation envoyée ; pas de merge ou Vercel. Prochaine décision : convenir d'une recette complémentaire en lecture seule avant activation d'écritures.

---

> **Mise à jour — 11/11/2026, incident local et correctif Edge 5.C-B.2 :** la première inspection Parent sur `localhost:5173` a échoué (message générique « Service d'invitation familiale indisponible »). Journaux Supabase : `OPTIONS /functions/v1/schoolnet-family-invitation → 503 BOOT_ERROR`, déclaration multiple de `profileError`. Correctif ciblé `linkedProfileError` : commit GitHub `4431d7b` sur `feature/schoolnet-multi-etablissements`. **Fonction redéployée en version 2** : `verify_jwt=true`, `READ_ONLY_DEPLOYMENT=true` conservé, aucune migration / compte / invitation / Vercel. **Prochaine action unique : retester `Inspecter le parent` dans la demande fictive sur localhost, vérifier la réponse HTTP et l'absence d'écriture, puis actualiser l'état du lot.** La réussite fonctionnelle n'est pas encore acquise.

---

> **POINT DE REPRISE — 11 novembre 2026, après déploiement Edge 5.C-B.2**  
> La fonction `schoolnet-family-invitation` est maintenant **déployée en version 1**, `verify_jwt=true`, avec un verrou codé `READ_ONLY_DEPLOYMENT=true` qui interdit toutes les écritures indépendamment du flag serveur. `http://localhost:5173` est autorisé pour `inspect` seulement. Un panneau de test Parent/Apprenant en lecture seule est intégré à la fiche des demandes publiques. Supabase : **35 migrations, 7 Edge Functions, 0 invitation familiale, 0 événement**. La recette HTTP avec une vraie session Super Admin est **à réaliser en local** ; ne pas déclarer 5.C-B.2 terminé avant ce test. Commits : `78cef306` (verrou), `e51fb5e` (panneau inspect) ; détail : [protocole 5.C-B.2](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). **Pas de Vercel, pas de migration, pas de comptes Auth créés, pas de merge.** Prochaine étape : synchroniser le PC Windows sans écraser des changements locaux, puis `npm ci`, lint, build et tests `inspect` sur `localhost:5173`.  
>
> Les éléments datés du 10 novembre ou d'avant ce déploiement ci-dessous sont conservés comme historique et peuvent indiquer que la fonction Edge n'était pas encore déployée.

---

# SCHOOLNET — WORKFLOW COMPLET DE DÉVELOPPEMENT POST-V1
## Édition consolidée V2.2 : inscriptions automatisées, établissements et continuité en local

**Mise à jour : 10 novembre 2026.** **Statut : document directeur de pilotage.**  
**Source métier originelle :** « Workflow_complet_SchoolNet_post_V1(7).pdf », édition d'octobre 2026, 19 pages, version V1.0.0. Ses **Lots 0 à 8, les dépendances et la méthode de recette sont préservés**.  
**Sources techniques :** GitHub ramon77777/schoolnet, PR #5 et #6, audit du Lot 5.C, dossiers des établissements, sécurité S1, proposition S2 et passage d'année 5.D.  
**Guide opératoire associé :** [Synchronisation GitHub, branche locale et tests sans Vercel](./guide-synchronisation-et-tests-local-schoolnet.md).

> **OBJECTIF.** SCHOOLNET est déjà une plateforme d'apprentissage en ligne fonctionnelle. **Nous n'en reconstruisons pas la pédagogie.** Nous achevons l'automatisation des inscriptions et des identifiants, puis étendons les outils existants aux établissements partenaires, avec une administration et des données isolées par école. Les répétiteurs à distance sont des **enseignants SCHOOLNET** qui utilisent les cours, LIVE, devoirs et évaluations existants. Aucun « nouveau module de cours à domicile » n'est ouvert.

---

## 1. Positionnement de SCHOOLNET et périmètre fonctionnel

### 1.1. Fonctionnement historique, à préserver

Un apprenant ou son parent demande l'accès. L'Administration SCHOOLNET vérifie la demande, prépare les comptes et les identifiants, regroupe les apprenants **par niveau dans les classes existantes**, affecte les enseignants autorisés et ouvre l'accès aux cours, devoirs, évaluations, classes virtuelles, LIVE, résultats et suivi familial.

**Problème réel à résoudre :** la phase **validation → préparation des comptes → rattachement Parent/Apprenant → invitation → première connexion** demande trop de manipulations manuelles. Le but est un **assistant administratif supervisé**, pas une nouvelle plateforme.

### 1.2. Évolution : établissements scolaires partenaires

SCHOOLNET conserve sa communauté d'**apprenants libres** et accueille en parallèle des écoles ayant leurs propres classes et leurs propres administrateurs. Le **Super Administrateur SCHOOLNET** conserve le pilotage global ; chaque **administrateur d'établissement** ne gère que les données de ses écoles autorisées.

**Un seul moteur pédagogique** pour tous les parcours : comptes, cours, enseignements à distance, quiz, devoirs, examens et résultats sont réutilisés. Les écoles ajoutent un **contexte organisationnel vérifié**, pas une application supplémentaire.

### 1.3. Répétiteurs et soutien à distance

Les répétiteurs reçoivent un compte Enseignant après validation par l'administration, et leurs élèves sont inscrits comme apprenants SCHOOLNET puis affectés dans les classes ou cours autorisés. Ils peuvent enseigner à distance via les fonctions déjà présentes. Un éventuel catalogue commercial « cours à domicile » est **hors périmètre actuel**.

### 1.4. Acteurs et frontières de sécurité

| Acteur | Missions / accès | Limites |
| --- | --- | --- |
| Super Administrateur SCHOOLNET (role admin actuel) | Gouvernance, utilisateurs, demandes publiques, référentiels, création d'écoles et délégation locale | Validation humaine des demandes sensibles, audit |
| Administrateur d'établissement (school_admin) | Informations, inscriptions, classes et personnel **de l'école autorisée**, progressivement selon les modules activés | Jamais de droits admin centraux, pas de lecture des autres écoles |
| Enseignant | Classes / cours affectés, LIVE, devoirs, évaluations et corrections | Pas de droits sur une classe ou une école non affectée |
| Apprenant | Cours, activités, progression et informations personnelles | Données de ses propres parcours et classes |
| Parent / Tuteur | Inscrire ou demander accès, suivre ses enfants après lien familial vérifié | Ne voit pas les enfants d'un autre responsable |

**Vérification obligatoire par RLS/serveur**, pas seulement par le menu React. Réutiliser les comptes Auth existants, sans recréer un compte par établissement.

---

## 2. Socle SCHOOLNET déjà disponible — non-régression

L'ancien workflow (pages 2–3) qualifie la V1 de fonctionnelle avec les quatre espaces **Administration, Enseignant, Parent/Tuteur et Apprenant**. Les développements post-V1 ont étendu ce socle.

| Périmètre | Fonctionnalités existantes à conserver |
| --- | --- |
| Site public | Accueil, Bibliothèque, Niveaux, Tarifs, À propos, Contact, CMS, demandes publiques |
| Apprenant | Connexion, cours, devoirs, quiz, examens, notes, moyennes, progression, messagerie, espace de classe |
| Enseignant | Cours, classes et affectations, évaluations, corrections, moyennes, messagerie, espace de classe, LIVE |
| Parent/Tuteur | Enfants liés, résultats, moyennes, présences, bulletins, messagerie, suivi |
| Administration SCHOOLNET | Utilisateurs, classes, années scolaires, contenus, paramètres, inscriptions, notifications, plannings, bulletins |
| Administration locale | Écoles, invitations et rôle local, tableau de bord et profil ; formulaire de classes S2-B préparé **mais non activé** |

**Interdictions de principe :** ne pas créer un second système de cours ou de notes ; ne pas migrer arbitrairement les classes historiques vers une école ; ne pas créer automatiquement des identités ou des liens familiaux non vérifiés.

---

## 3. Roadmap historique conservée : Lots 0 à 8

| Lot | Module original | Avancement constaté | Recette / suite |
| --- | --- | --- | --- |
| 0 | Stabilisation transverse | Socle en place et contrôles de sécurité successifs | RLS, cohérence des profils, mobile, CI, stockage |
| 1 | Présences et Absences | Développé avec recettes ciblées | Contrôler Présent, Absent, Retard, Justifié, parents, enseignants et écoles |
| 2 | Emploi du temps (et salles) | Développé, salles et codes automatiques travaillés | Conflits classe/enseignant/salle, vues des 4 rôles, contexte école |
| 3 | Bulletins scolaires | Développé avec contrôles ciblés | Calculs, appréciations, publication, confidentialité, PDF |
| 4 | Notifications enrichies | Développé et enrichi | Événements, préférences, absence de doublons, nouveaux flux d'inscription |
| **5** | **Inscriptions et dossiers élèves** | **EN COURS : 5.C automatisation et 5.D préparé** | **Priorité immédiate : 5.C-A à 5.C-D ; 5.D attend** |
| 6 | Vie scolaire | Prévu dans le workflow historique | Retards, observations, incidents, sanctions, encouragements, visibilité contrôlée |
| 7 | Scolarité / Finances | Prévu dans le workflow historique | Frais, échéances, paiements, soldes, reçus, audit |
| 8 | Documents scolaires | Prévu dans le workflow historique | Certificats, attestations, relevés, reçus, archives, droits d'accès |

### Gates métier héritées de l'ancien workflow

- **Lot 1 :** appel complet, absent/retard/justification, traces, parent et élève autorisés.
- **Lot 2 :** emploi du temps hebdomadaire, détection de conflit classe/enseignant/salle, vues par rôle.
- **Lot 3 :** bulletin complet, note manquante, validation/publication, famille autorisée, PDF sans débordement.
- **Lot 4 :** alerte note, absence, devoir, bulletin et changement d'emploi du temps ; préférences et dédoublonnage.
- **Lot 5 :** demande, dossier, pièces éventuellement requises, décision, classe, accès et réinscription sans doublon.
- **Lot 6 :** observation/incident, visibilité adaptée, validation et traçabilité des modifications.
- **Lot 7 :** paiement partiel/complet, annulation contrôlée, soldes, reçu PDF et accès limité au parent.
- **Lot 8 :** certificat, relevé, reçu, numérotation unique, archivage et accès fichiers sécurisé.

**À retenir :** « développé » ne veut pas dire « production validée pour tous les établissements » ; les extensions seront recettées sur deux écoles distinctes avant ouverture des droits locaux.

---

## 4. Priorité active — Lot 5.C : automatiser les inscriptions existantes

### 4.1. Parcours visé, sans rupture de SCHOOLNET

~~~text
Apprenant / Parent : remplit la demande publique
  -> ADMIN SCHOOLNET : ouvre la demande, vérifie identité et autorité parentale
  -> Assistant : retrouve ou prépare les comptes existants / manquants
  -> Admin : valide le bon parent, apprenant, niveau et classe existante
  -> SCHOOLNET : réutilise les fonctions de classe et dossier existantes
  -> SCHOOLNET : rattache le parent après vérification et finalise la demande
  -> SCHOOLNET : prépare les liens temporaires et messages personnalisés
  -> Admin : envoie lui-même les invitations et déclare l'envoi réel
  -> Parent / Apprenant : définit le mot de passe et se connecte
  -> Cours / LIVE / devoirs / suivi : fonctionnement déjà en place
~~~

**L'administrateur décide ; SCHOOLNET exécute les opérations répétitives.** La vérification humaine reste obligatoire pour les liens familiaux et l'identité. Une correspondance de nom ou d'e-mail n'est pas une preuve.

### 4.2. État technique de 5.C vérifié le 10 novembre 2026

- Fonction publique de dépôt de demande et module **Demandes publiques** : existants.
- RPC **admin_finalize_public_enrollment_request** : migration 5.C appliquée, tests SQL effectués, mais l'interface exige encore des comptes et un dossier préexistants.
- Edge Function **admin-create-user** : création de comptes possible, mais saisie manuelle d'un mot de passe temporaire.
- Edge Function **schoolnet-admin-invitation** : invitations sécurisées pour admin local **déjà testées en navigateur** ; réutiliser le **modèle** de lien sans mot de passe, pas les privilèges scolaires locaux.
- RPC **admin_assign_student_to_class** : classe et dossier annuel sont déjà synchronisés ; ne pas écrire une seconde fois ces associations.
- Dans Supabase, **35 migrations au 11/11/2026 après application de la migration familiale ciblée**. Les chiffres de test historiques avant cette opération étaient : **4 demandes publiques**, **0 résolution finalisée**, **2 classes historiques**, **2 affectations apprenant**, **2 affectations enseignant** et **2 dossiers annuels** ; ils n'ont pas été recalculés lors du contrôle technique du registre.

### 4.3. Sous-lots d'automatisation (enchaînement obligatoire)

| Étape | Livrable | Statut / gate |
| --- | --- | --- |
| **5.C-A — Reconnaissance** | Dans la fiche de demande, proposer comptes plausibles et classes existantes selon le niveau ; aucune écriture | **Recette locale validée le 11/11/2026** (compte Parent, apprenant sans e-mail, classe 5e non créée), sans écriture |
| **5.C-B — Comptes et identifiants** | **B.1** : présélection assistée sans écriture ; **B.2** : création Auth sans mot de passe, invitation et reprise idempotente sous contrôle ; **B.3** : téléphone propre ou accès enfant supervisé par le Parent | **B.1 et ergonomie validés ; B.2 registre et audit appliqués dans Supabase, migration `20261111101351` vérifiée (tables vides, RLS). Fonction Edge et créations Auth toujours désactivées** ; B.3 non activé |
| **5.C-C — Affectation et finalisation** | Choix de classe, réutilisation des RPC existantes, vérification lien familial, traitement idempotent | À développer et tester après GO 5.C-B |
| **5.C-D — Transmission et activation** | Objet, corps, destinataire, lien temporaire, copier, ouvrir messagerie, déclarer l'envoi, renouveler, première connexion | À terminer puis recette complète Parent/Apprenant |

**Décision 11/11/2026 — enfants sans e-mail :** le numéro propre de l'apprenant peut servir à une connexion Supabase après activation/vérification du fournisseur téléphone ; le **numéro du parent ne peut pas être partagé comme identifiant Auth** (index unique). L'e-mail du parent est un **contact de transmission**, mais ne doit pas être utilisé comme identifiant Auth de plusieurs enfants. Le parcours d'activation supervisée d'un enfant sans téléphone propre nécessite une réalisation serveur distincte. [Cadrage technique du Lot 5.C-B](./lot-5-c-b-comptes-invitations-et-acces-sans-email.md).

**Recette 11 novembre 2026 — 5.C-B.1 :** sur le dossier fictif Koffi Amani, le bouton de présélection retrouve Koffi Bernard et met à jour le champ Parent/Tuteur, tandis que la case de vérification familiale reste décochée. Le dossier n'a pas été finalisé. **Amélioration ergonomique ensuite codée :** fiche élargie avec informations à gauche et assistant à droite sur PC ; plan d'accès, note de suivi et formulaire manuel repliables ; affichage vertical sur petit écran. ESLint et build Vite réussis sur GitHub. **La nouvelle ergonomie reste à valider visuellement en local.** Aucune migration Supabase ni déploiement de fonction d'invitation.

**Recette SQL 5.C-B.2, 11 novembre 2026 :** [Brouillon du registre](./sql/lot_5_c_b2_family_invitation_registry_DRAFT.sql) créé dans `docs/sql/` (pas dans les migrations applicables). Test sur Supabase dans `BEGIN ... ROLLBACK` : unicité dossier/destinataire, unicité e-mail, rôles, normalisation, transitions de statuts, immutabilité, permissions SQL, RLS et FORCE RLS **conformes**. Un premier test a révélé le droit DELETE attribué par défaut à `service_role`, ensuite révoqué explicitement ; le second passage est réussi. Contrôle après transaction : **table inexistante, toujours 34 migrations appliquées**. [Procès-verbal et limites](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). Aucune migration n'a été appliquée, aucune invitation envoyée ; tests réels Edge/concurrence et reprise d'échec restent à réaliser.

**Protocole de reprise 5.C-B.2, 11 novembre 2026 :** la fonction serveur sépare désormais `createUser` sans mot de passe, liaison du compte au registre, préparation du profil et `generateLink(recovery)`. Les actions `resume`, `renew` et `flag_review` sont codées avec contrôle de rôle Super Admin, anti-doublon, délais et verrouillage par changement d'état atomique. Le registre proposé conserve un **historique append-only** sans jeton, ainsi qu'une unicité par demande, e-mail et compte Auth. Les [tests SQL reproductibles](./sql/lot_5_c_b2_family_invitation_registry_TEST_ROLLBACK.sql) sont réussis en `BEGIN/ROLLBACK` : **34 migrations appliquées, 0 nouvelle table conservée**. [Protocole, incidents et limites](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). **Les essais Auth réels, la concurrence de deux appels et l'activation complète restent à faire après autorisation.**

**Application SQL ciblée 5.C-B.2 — 11/11/2026 :** l'autorisation explicite a été donnée. Après une dernière recette réversible, la migration [`20261111101351_schoolnet_family_invitation_registry.sql`](../supabase/migrations/20261111101351_schoolnet_family_invitation_registry.sql) a été appliquée dans Supabase et vérifiée : **35 migrations au total, 2 nouvelles tables vides, 2 triggers, RLS + FORCE RLS, accès directs anon/authenticated interdits, aucun DELETE accordé à service_role**. La vérification SQL ne crée aucun compte ni invitation. L'historique de 34 migrations dans les paragraphes de recette précédente est le **constat avant l'application**, conservé pour traçabilité. [Rapport d'application et prochaine étape](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). **La fonction Edge n'est toujours pas déployée et son flag d'écriture reste désactivé.**

**Recette ergonomique 11/11/2026 :** sur Chrome local, la nouvelle fiche en deux colonnes est affichée avec les sections secondaires repliables. **5.C-B.2 :** fichier serveur séparé schoolnet-family-invitation et contrat client adminFamilyInvitationApi préparés sur GitHub. L'Edge n'est PAS déployée ; le registre SQL a été approuvé et appliqué ensuite, mais le flag serveur des créations reste désactivé. [Audit et règles d'activation B.2](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). Aucun e-mail envoyé, aucun compte créé et aucune migration appliquée.

### 4.4. Cas de recette obligatoires

1. Compte Parent déjà présent ; compte Apprenant déjà présent ; deux personnes homonymes.
2. Nouveau Parent et nouvel Apprenant ; e-mails distincts et réutilisation des comptes si déjà créés.
3. Enfant sans e-mail personnel : **pas de fausse adresse ni de partage automatique du compte Parent** ; solution métier à valider.
4. Accès Parent à un apprenant déjà inscrit : lien vérifié **sans créer une deuxième inscription**.
5. Affectation dans une **classe déjà existante**, bonne année et enseignant autorisé.
6. Double clic, expiration d'une invitation, erreur entre création Auth et enregistrement SQL, reprise sans doublon.
7. Refus d'une demande, tentatives non autorisées, conservation des historiques, aucune divulgation Parent/Enfant.

**GO final Lot 5.C :** le parcours peut être effectué dans une seule fiche sans naviguer manuellement entre plusieurs modules, le responsable et l'apprenant accèdent aux bons espaces et aucune donnée d'un autre compte n'est divulguée.

---

## 5. Gestion des établissements scolaires — extension structurée de SCHOOLNET

**Ce chantier est intégré au workflow global, sans effacer les lots historiques et sans ouvrir une seconde application pédagogique.** Il reprend directement le développement déjà enregistré dans la PR #6.

### 5.1. Modèle organisationnel

~~~text
                        SUPER ADMIN SCHOOLNET
                      Référentiels / supervision
                                 |
              +------------------+------------------+
              |                                     |
     École A : administrateur local         École B : administrateur local
              |                                     |
   Classes A / enseignants A / élèves A   Classes B / enseignants B / élèves B
              |                                     |
       Cours, LIVE, notes, bulletins : fonctionnalités SCHOOLNET communes
                                 |
             Communauté SCHOOLNET des apprenants libres
                  Classes/groupes historiques distincts
~~~

Les **apprenants libres** ne sont pas déplacés automatiquement dans une école. Une « 6e A » de l'école A et une « 6e A » de l'école B sont distinctes, même pour la même année.

### 5.2. Avancement par sous-étapes ÉTABLISSEMENTS

| Sous-lot | Contenu | Statut / ordre |
| --- | --- | --- |
| **E1 — Organisation et accès locaux** | Création établissement, code SCH automatique, rôle school_admin, invitation sécurisée, première connexion, audit | **Développé ; migrations S0/S1 appliquées, recette ciblée réussie** |
| **E2 — Cloisonnement de sécurité** | Protection RLS, école active, appartenance active, suspension/révocation, interdiction d'accès aux autres écoles | **Première phase S1 appliquée ; protections métier complètes à poursuivre** |
| **E3 — Classes officielles par école** | Fiche classes, niveau/année, unicité par école, consultation locale, création sécurisée | **S2-A/S2-B codés et testés en ROLLBACK ; SQL non activé** |
| **E4 — Enseignants et élèves de l'école** | Affectations, liens classe/cours, demandes et invitations de familles, comptes existants réutilisés | **À construire par extension contrôlée des modules existants après 5.C** |
| **E5 — Pédagogie et vie scolaire de l'école** | Cours, LIVE, devoirs, présences, emploi du temps, notes, bulletins, messages et notifications, avec filtrage de l'école | **Moteur existant ; isolation et recettes inter-écoles à terminer** |
| **E6 — Années, documents et finances par école** | Réinscriptions, passage d'année, documents et paiements dans le contexte de l'école | **Après les gates 5.C / 5.D et Lots 6 à 8** |

### 5.3. Parcours du Super Administrateur

1. Vérifie l'établissement et son responsable légal ; crée la fiche école.
2. SCHOOLNET attribue un **code permanent automatique** de type SCH-000001.
3. Prépare l'invitation d'un responsable local avec un lien personnel temporaire ; **le Super Admin envoie l'e-mail manuellement** depuis sa messagerie.
4. Suit l'activation et contrôle la disponibilité de l'école et les droits d'accès.
5. Peut suspendre l'établissement ou révoquer son responsable ; la visibilité des données est immédiatement restreinte selon les règles en base.
6. Supervise les écoles depuis le centre, sans confondre une administration locale avec des privilèges globaux.

### 5.4. Parcours de l'Administrateur d'établissement

Après activation de ses droits : consulte **uniquement ses établissements actifs**, crée et organise leurs classes, gère les enseignants/élèves autorisés, vérifie les demandes et prépare les invitations, puis supervise les cours, présences, évaluations et bulletins **grâce aux modules SCHOOLNET existants**.

**Limite actuelle importante :** l'espace local, le profil et le catalogue des établissements sont testés ; **les fonctions complètes de gestion des classes et des affectations ne sont pas encore activées en base**. Ne pas annoncer aux écoles qu'elles peuvent déjà tout administrer.

### 5.5. Critères de recette de l'extension établissements

- Deux écoles A et B, chacune avec une classe de même nom ; aucun doublon intra-école.
- Un responsable de A ne voit **aucun** compte, classe, évaluation, message ni document privé de B.
- Une école suspendue ou une affiliation révoquée perd immédiatement les droits correspondants.
- Le Super Admin conserve les droits centraux ; le responsable local n'hérite jamais du rôle admin global.
- Les **classes historiques** et les apprenants libres restent accessibles aux acteurs historiquement autorisés et ne sont pas déplacés arbitrairement.
- Le lien Parent/Enfant reste vérifié et l'affectation à l'école/année/classe reste explicite.
- Les photos, justificatifs, bulletins et documents exigent aussi une isolation côté Storage.
- Les migrations SQL S2 ne sont appliquées **qu'après autorisation explicite** et test en transaction ROLLBACK.

**Ordre recommandé :** terminer 5.C, puis reprendre **E3**, ensuite E4/E5. Conserver E1/E2 acquis sans les recommencer.

---

## 6. Lot 5.D et Lots 6, 7, 8 — dépendances préservées

### 6.1. Lot 5.D — Réinscriptions et passage d'année

Le code et la proposition SQL du passage d'année existent, **sans activation SQL durable**. L'année en cours et certaines inscriptions de test présentent une incohérence connue ; aucun correctif automatique n'est autorisé.

Gate avant activation : année cible valide, décisions de réinscription/redoublement/départ, prévisualisation, absence de doublon, historique conservé, RLS, audit et recette sur la communauté SCHOOLNET puis sur les écoles concernées. L'année scolaire d'une école et la notion de « période globale » devront être rapprochées sans perte de données.

### 6.2. Lot 6 — Vie scolaire

Retards, incidents, observations, sanctions et encouragements, avec création par acteur autorisé, validation selon catégorie, visibilité Parent/Apprenant et traçabilité. Réutiliser présences, classes, notifications et messagerie.

### 6.3. Lot 7 — Scolarité et finances

Définition des frais applicables, échéanciers, paiements, soldes et reçus. Les **tarifs pédagogiques du site public** ne sont pas, par défaut, les frais de scolarité d'une école. Les transactions financières exigent audit, annulation contrôlée, calcul fiable côté données et isolation par école.

### 6.4. Lot 8 — Documents scolaires

Certificats, relevés, attestations, reçus et archives à numéro unique, données figées après publication et contrôle d'accès aux fichiers. Réutiliser les notes, bulletins, inscriptions et finances existants ; ne pas dupliquer les référentiels.

---

## 7. Architecture des dépendances — pas de fonctionnalités isolées

~~~text
Profils / Auth / liens familiaux / organisations
                      |
        Classes existantes / niveaux / années
                      |
        +-------------+--------------+
        |                            |
Cours + enseignants + évaluations    Inscriptions + dossiers
        |                            |
Notes -> moyennes -> bulletins        Pièces / année / documents
        |                            |
        +------- Notifications -------+
                      |
  Présences / emploi du temps / vie scolaire
                      |
     Écoles = contrôle de périmètre
       et administration locale
~~~

**Modèle de données :** privilégier les relations vers les tables existantes, plutôt que créer une deuxième table de notes, une deuxième table de profils ou un deuxième système de cours.

**Alerte de sécurité :** l'isolation multi-écoles n'est pas acquise du seul fait que la barre latérale ne montre pas certains modules. Les politiques RLS, fonctions serveur, relations classe/cours et autorisations Storage doivent être vérifiées séparément.

---

## 8. Continuer le développement malgré une limitation Vercel

### 8.1. Deux voies de test pour le même code GitHub

| Situation | Vérification | Décision |
| --- | --- | --- |
| **Preview Vercel disponible au bon commit** | GitHub CI réussi, déploiement Ready, **SHA identique** à celle testée, URL Preview | Recette navigateur sur Preview ; pas de publication Production |
| **Preview bloquée, limitée ou sur ancien commit** | GitHub CI réussi, branche locale **synchronisée avec GitHub**, npm run lint, npm run build | **Recette fonctionnelle sur localhost:5173** ; poursuivre les petits lots sans attendre Vercel |
| **Code local différent du remote** | git status, diff, historique, git fetch et comparaison des SHA | **STOP :** préserver le travail local, ne pas forcer la synchronisation |
| **Besoin d'une migration ou d'une création de comptes** | Vérifier l'environnement Supabase et le caractère réel des données | Autorisation distincte ; localhost **n'est pas** une base isolée |

### 8.2. Procédure locale sur Windows 11 — résumé opérationnel

Depuis la racine du dépôt SCHOOLNET dans PowerShell, **contrôler avant d'agir** :

~~~powershell
git status --short
git branch --show-current
git remote -v
git log -1 --oneline
git fetch origin --prune
~~~

Si **aucune modification locale** n'est à conserver sans traitement et si la branche existe sur le PC :

~~~powershell
git switch feature/schoolnet-multi-etablissements
git pull --ff-only origin feature/schoolnet-multi-etablissements
git rev-parse HEAD
git rev-parse origin/feature/schoolnet-multi-etablissements
~~~

Si la branche **n'existe pas** localement : après git fetch, exécuter **git switch --track origin/feature/schoolnet-multi-etablissements**. Les deux commandes git rev-parse doivent fournir **exactement la même SHA**. Ne jamais exécuter git reset --hard, un push forcé ou un rebase aveugle pour « réparer » une divergence.

Puis :

~~~powershell
npm ci
npm run lint
npm run build
npm run dev -- --host localhost --port 5173 --strictPort
~~~

Ouvrir **http://localhost:5173**. Conserver les variables d'environnement locales **hors de Git** ; seules l'URL Supabase et la clé publique/anon du projet autorisé peuvent être exposées à Vite, jamais une service-role key.

**Attention :** le frontend local peut appeler les **Edge Functions et la base Supabase distante**. Pour le test 5.C-A, ouvrir une demande fictive et **ne faire que des lectures** ; n'inviter, ne valider, ne rattacher et ne créer aucun compte réel sans procédure de test approuvée.

La procédure détaillée, y compris la gestion des changements locaux non enregistrés et les limites Cloudflare/Supabase Auth, se trouve dans le [guide de synchronisation et tests locaux](./guide-synchronisation-et-tests-local-schoolnet.md).

### 8.3. Passage du test local à la Preview, puis à la production

1. Versionner le petit lot dans la branche **feature/schoolnet-multi-etablissements**, avec un commit descriptif.
2. Vérifier le build GitHub. Si Vercel est bloqué, **conserver le résultat des tests locaux** et ne pas relancer des déploiements de façon répétitive.
3. Dès qu'une Preview correspondant **au commit testé** est Ready, reproduire les scénarios concernés sur ce déploiement.
4. Appliquer les migrations nécessaires seulement après accord explicite et recette RLS ; ne jamais utiliser un **supabase db push --remote global** pour activer toutes les migrations en attente.
5. Fusionner vers main et déployer en Production **uniquement après GO explicite** et recette de non-régression.

**État observé le 10/11/2026 :** PR #6 à la SHA applicative 563149e, lint/build GitHub réussis, statut Vercel en échec pour **limite de fréquence de build**. Le code de 5.C-A est donc prêt **pour test local**, mais **pas encore validé en navigateur** au dernier commit.

---

## 9. Méthode de livraison et sécurité — héritage du document initial

La méthode de la page 5 du workflow d'octobre 2026 reste obligatoire :

~~~text
Cadrage validé -> audit du modèle -> proposition SQL si nécessaire
-> RLS / sécurité -> services de données -> interface par rôle
-> test ciblé -> responsive mobile/tablette/desktop
-> lint et build -> recette locale ou Preview au bon SHA
-> commit GitHub -> vérification du déploiement
-> GO utilisateur -> lot suivant
~~~

**Avant les écritures durables :** revue des différences SQL, tests transactionnels en ROLLBACK, consentement explicite pour la migration ciblée, contrôles des cinq rôles et des deux écoles si concernés.

**Règles générales :** pas de duplication de comptes, pas de fusion sur le nom, mot de passe jamais transmis à l'administrateur, jetons jamais sauvegardés en clair, pièces protégées par RLS et Storage, mobile à 412 px minimum, aucun secret dans GitHub ou les logs, jamais d'activation globale d'une migration « en attente ».

### Règle de non-régression

Chaque modification des inscriptions et des écoles doit être testée sans casser : connexion Parent/Apprenant/Enseignant/Admin, accès aux cours et classes existants, affectation, notes/bulletins publiés, messages, présences, emploi du temps et notifications.

---

## 10. GitHub, branches et sauvegardes

~~~text
main                                      -> Production (référence stable)
  └─ feature/schoolnet-notifications       -> PR #5, brouillon (lots 4/5)
       └─ feature/schoolnet-multi-etablissements
                                           -> PR #6, brouillon (écoles, 5.C-A et docs)
                 ↕ synchronisation Git
         branche du PC Windows             -> npm ci, lint, build, localhost
~~~

**Le PC local ne se synchronise pas tout seul** à partir d'une modification GitHub. Exécuter la procédure du guide, contrôler les SHA et préserver toute modification locale non enregistrée. Le test local n'autorise jamais un push vers main.

Ne pas créer de nouveau dépôt pour résoudre un problème Vercel : la branche GitHub existante demeure la sauvegarde partagée.

---

## 11. Tableau de pilotage — état de référence au 10 novembre 2026

| Sujet | État / prochaine décision |
| --- | --- |
| **Lot actif** | **5.C-B.2 : migration du registre familial appliquée et vérifiée dans Supabase ; protocole de reprise prêt dans GitHub ; fonction Edge non déployée** |
| **Code 5.C-A** | **Recette navigateur local réussie le 11/11** ; correspondances Parent/Apprenant et recherche classes cohérentes |
| **Prochaine action unique** | **Demander l'accord avant déploiement ciblé de `schoolnet-family-invitation` en mode non activé, puis effectuer uniquement les contrôles read-only `inspect`** |
| **Étapes suivantes** | 5.C-B.2 : migration du registre après accord, fonction Edge + recette, suivi envoi ; 5.C-B.3 : apprenants sans e-mail ; 5.C-C : affectation/finalisation ; 5.C-D : transmission et connexion |
| **Établissements** | E1/E2 partiellement activés ; E3=S2 préparé mais non activé ; E4/E5 après 5.C |
| **Passage d'année 5.D** | Code préparé, migration non appliquée |
| **Supabase (dernier contrôle)** | **35 migrations** (dont `20261111101351_schoolnet_family_invitation_registry`), 2 tables familiales vides et protégées. Les autres valeurs affichées sont celles des contrôles historiques, non réactualisées lors de cette migration |
| **GitHub** | PR #5 + PR #6 en brouillon, aucun merge main |
| **Vercel** | Dernier SHA applicatif 563149e : rate-limit ; fallback local |
| **Règle de clôture** | Un seul petit bloc, test concret, accord avant toute écriture durable ou production |

**En fin de séance, enregistrer :** branche et SHA, fichiers modifiés, statut git, tests lint/build, capture de recette, migrations réellement appliquées ou non, anomalies et **seule prochaine action**. Actualiser ce tableau immédiatement.

---

## 12. Références et documents conservés

- **Workflow de référence d'octobre 2026 :** « Workflow_complet_SchoolNet_post_V1(7).pdf » ; V1.0.0, 19 pages, positionnement, Lots 0–8, dépendances, critères de qualité, GitHub/Vercel et pilotage.
- [Audit du Lot 5.C — Inscription et comptes](./lot-5-c-automatisation-comptes-acces-audit-existant.md).
- [Cadrage et sécurité du Lot 5.C](./lot-5-c-cadrage-demandes-et-rattachement.md).
- [Gestion des écoles et invitations](./architecture-schoolnet-multi-etablissements-et-invitations.md).
- [Audit de sécurité inter-écoles S1](./audit-isolation-multi-etablissements-phase-1.md).
- [Schéma des classes E3 / S2-A](./lot-s2-classes-multi-etablissements-conception-et-recette.md).
- [Formulaire et RPC E3 / S2-B](./lot-s2-b-formulaire-classes-et-rpc-securisees.md).
- [Réinscriptions et année scolaire 5.D](./lot-5-d-reinscriptions-et-cloture-annee.md).
- [Synchronisation GitHub et tests sur PC](./guide-synchronisation-et-tests-local-schoolnet.md).
- [Ancienne roadmap conservée comme historique](./roadmap-schoolnet-post-v1-lots-restants-et-salles.md).

**Cette édition V2.2 remplace les versions V2.0 et V2.1 comme référence active de pilotage, sans supprimer les anciens commits ni leurs documents.**
