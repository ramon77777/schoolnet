> **12/11/2026 — B.4 : étude de preuve Auth compatible Free achevée, sans nouvelle écriture.** Après B.3, la source externe `auth_audit_logs` montre 4 événements `login` et 1 `user_updated_password`, mais les métadonnées visibles ne permettent pas d'attester la méthode `password`. Le hook **Custom Access Token**, disponible sur Free, reçoit `authentication_method` (`password` ou `recovery`, etc.) et `claims.session_id` selon la documentation officielle ; un **test sandbox et une corroboration après émission de jeton** seront impératifs. Le Password Verification Hook reste indisponible sur Free. [Rapport B.4](./lot-5-c-b2-b4-architecture-preuves-auth-free-2026-11-12.md). Aucun hook installé, aucun compte créé ou lien généré durant B.4 ; fonction B.3 v2 toujours neutralisée.

# SCHOOLNET — Lot 5.C-B.2 / Phase B.3
## Recette Auth réelle sur Supabase Free, exclusivement en sandbox — 12 novembre 2026

**STATUT : RECETTE B.3 EXECUTÉE — SCÉNARIOS AUTH PASSÉS — FONCTION TEMPORAIRE DÉSACTIVÉE.**

### 1. Autorisation, isolation et garde-fous

L'utilisateur a autorisé explicitement la **création de comptes fictifs et les tests Auth exclusivement dans la sandbox**. Projet cible : `schoolnet-auth-sandbox` (ID **`onqlsvphmrqhelislpry`**). Projet principal `schoolnet_2.0` (ID **`anttmbhaphkhmkoqsofd`**) **non modifié**.

La sandbox possédait initialement 0 compte Auth, 0 cas/événement dans le schéma privé B.2, et 1 migration B.2. Les deux comptes de test ont des adresses fixes réservées `schoolnet-b3-parent@example.test` et `schoolnet-b3-student@example.test`. Elles sont fictives, non distribuables. Les mots de passe ont été générés aléatoirement dans le contexte serveur et n'ont été ni affichés ni stockés dans GitHub, SQL ou dans les journaux.

### 2. Pourquoi un workflow GitHub OIDC a été utilisé

Les outils Supabase connectés permettent d'inspecter la base et de déployer des Edge Functions, mais ne proposent pas directement de commande `auth.admin.createUser` ni d'appel HTTP d'exécution Auth.

Pour réaliser la recette sans partager de clé `service_role`, un orchestrateur **temporaire et strictement limité à la sandbox** a été mis en place :

- Source sauvegardée : [`docs/sandbox/b3/edge/index.ts`](./sandbox/b3/edge/index.ts), compilée avec `deno check` dans les vérifications GitHub (run **`43189836124`**, succès).
- Déploiement initial sur **le seul projet sandbox** : `schoolnet-auth-sandbox-b3` **version 1**, `verify_jwt=false` au niveau de la passerelle car l'API devait vérifier elle-même un JWT OIDC **GitHub**, non un JWT Supabase.
- Le code vérifiait avec la clé publique officielle de GitHub **signature RS256, issuer, audience dédié, expiration, nom du dépôt, workflow exact, branche exacte et événement `push`**. Un appel sans identité GitHub signée était refusé HTTP 401.
- Le code vérifiait **l'URL exacte de la sandbox** et ne devait pas démarrer si un projet différent était configuré.
- Uniquement les deux emails `@example.test` fixés dans le code étaient admissibles. La sandbox devait être vide avant toute création ; une nouvelle exécution après le premier essai était refusée.
- Le service role restait **à l'intérieur de l'Edge Function**, via les variables serveur Supabase. Il n'a pas été copié dans le navigateur, les workflows ou les fichiers de travail.
- Déclencheur GitHub [`schoolnet-auth-sandbox-b3-once.yml`](../.github/workflows/schoolnet-auth-sandbox-b3-once.yml), limité à une mise à jour du fichier de workflow sur la branche de développement, sans exécution lors des modifications documentaires suivantes.

**Remarque :** ce mécanisme est un outil de recette et **ne constitue pas le futur dispositif d'activation familiale de production**.

### 3. Résultat du workflow B.3

- GitHub Actions : **run `43190361763`, conclusion `success`**.
- Job : `test-auth-b3`, conclusion `success`.
- Journal (12/11/2026 UTC) :
  - **09:19:00** — appel sans authentification : refus HTTP 401 ;
  - **09:19:03** — préflight GitHub OIDC autorisé : HTTP 200, sandbox Auth vide ;
  - **09:19:09** — scénario Auth réel Parent + Apprenant : réussi ;
  - **09:19:10** — second appel de création : refus HTTP 409, pas de doublon.

| Test effectué avec Supabase Auth de la sandbox | Résultat |
| --- | --- |
| Création administrative Parent fictif, email confirmé pour le test | PASS |
| Création administrative Apprenant fictif, email confirmé pour le test | PASS |
| Mot de passe volontairement incorrect | Refus |
| Connexion par mot de passe du Parent | PASS |
| Connexion par mot de passe de l'Apprenant | PASS |
| Génération de lien `recovery` avec `auth.admin.generateLink` | PASS |
| Consommation du token recovery avec `verifyOtp` | PASS |
| Définition d'un nouveau mot de passe avec `updateUser` | PASS |
| Rejeu du token recovery consommé | Refus |
| Tentative avec ancien mot de passe après changement | Refus |
| Connexion avec le nouveau mot de passe | PASS |
| Double exécution de création | Refus HTTP 409 ; aucun doublon |

**Aucun e-mail d'invitation/réinitialisation n'a été demandé au fournisseur** : `auth.admin.createUser` ne déclenche pas de mail de confirmation et `auth.admin.generateLink` construit un lien sans l'envoyer. Aucun appel à `inviteUserByEmail` ou `resetPasswordForEmail`. Les adresses `.test` ne peuvent pas recevoir de courriel. Le statut « e-mail confirmé » a été défini **artificiellement pour les besoins de test** et ne prouve aucune propriété de boîte aux lettres.

**Tous les liens, token-hash, mots de passe et sessions ont été manipulés exclusivement en mémoire serveur.** La réponse à GitHub ne contient que des booléens / compteurs. Ces tests prouvent qu'un parcours Auth fonctionne dans cette sandbox ; **ils ne prouvent pas la fiabilité d'une chaîne d'activation métier en production**.

### 4. Observations réelles Supabase après la recette

| Contrôle en lecture seule | Sandbox B.3 | SCHOOLNET principal |
| --- | --- | --- |
| `auth.users` | **2** comptes fictifs | **10**, inchangé |
| Adresses test prévues dans Auth | **2** | Non ajoutées |
| Comptes marqués `schoolnet_sandbox=true` | **2** | Aucun transfert |
| Emails marqués confirmés pour le test | **2** | Non touchés |
| Comptes ayant `last_sign_in_at` renseigné | **2** | Non touchés |
| Cas privés `schoolnet_auth_sandbox.invitation_cases` | **0** | Schéma absent |
| Preuves privées `activation_evidence_events` | **0** | Schéma absent |
| Historique des migrations | **1** (B.2) | **35**, inchangé |
| Tables publiques supplémentaires | **0** | Aucune modification |
| Registre familial principal | Non installé | **0 invitation, 0 événement** |
| Demande fictive principale `DEM-3CF7B169BAD9` | Absente | Toujours `new` |

Les logs externes Supabase de la sandbox, sur le créneau 09:15-09:30 UTC, contiennent `auth_audit_logs` : **9 entrées**, dont **1 mention `user_updated_password`** et **4 mentions `login`**. Le flux `auth_logs` compte **20 entrées**. La table PostgreSQL `auth.audit_log_entries` demeure **vide (0)**.

**Conclusion sur les preuves :** le workflow a lui-même exercé `signInWithPassword`, mais un lecteur distinct du journal Auth ne dispose pas encore d'une preuve durable corrélant de façon vérifiable un événement `login` à la méthode mot de passe, à une génération familiale et à une attestation de transmission. Les deux tables privées B.2 restent délibérément vides et `proof_verified` demeure interdit. **Aucune activation `activated` n'a été enregistrée.**

### 5. Neutralisation immédiate de l'orchestrateur

Après succès et contrôle des données :

- Le fichier de neutralisation a été enregistré sur GitHub : [`docs/sandbox/b3/edge/disabled.ts`](./sandbox/b3/edge/disabled.ts).
- La fonction sandbox `schoolnet-auth-sandbox-b3` a été **redéployée en version 2, `verify_jwt=true`**, avec seulement une réponse de **HTTP 410 (« b3_completed_disabled »)** pour les appels pouvant franchir la passerelle.
- Une inspection de la version 2 a confirmé **aucun appel `createUser` ni `generateLink`** dans son code ; la fonction n'a plus de capacité de création ni de récupération.
- L'ancien exécuteur B.3 n'est **plus déployé**. Aucun nouveau compte ne peut être créé par cette fonction neutre.

La source originale de recette demeure archivée dans `docs/sandbox/b3/edge/index.ts` pour audit, **sans déploiement automatique**. Toute nouvelle exécution exigerait une autorisation spécifique et un nouveau contrôle.

### 6. Avis de sécurité et limites

L'avis Security Advisor de la sandbox après B.3 signale :
- **INFO `rls_enabled_no_policy`** : attendu, car les tables B.2 sont privées, totalement fermées et sans politiques d'accès.
- **WARN `auth_leaked_password_protection`** : protection contre les mots de passe compromis à examiner avant une future mise en production, sans modifier le plan/configuration de cette sandbox dans B.3.

Points restant à résoudre : une preuve serveur durable d'une **première connexion par mot de passe**, l'intégration de l'événement `user_updated_password` dans un registre privé fiable, la vérification d'une génération d'invitation et le contrôle de la transmission. Supabase Free ne dispose pas du Password Verification Attempt Hook Team/Enterprise ; ne pas l'installer.

**B.3 ne constitue pas un GO pour `sent_declared`, `activated`, la création de profils familiaux dans le projet principal ou l'envoi d'emails réels.**

### 7. Reprise et prochaines décisions

La prochaine sous-étape doit choisir une architecture de preuves **compatible Free**, expérimentée exclusivement dans la sandbox. Éviter de confondre « réussite d'une opération Auth dans le même programme de test » et « preuve ultérieure disponible pour SCHOOLNET ».

**Par défaut : STOP aux écritures.** Aucun nouveau projet, migration, hook, compte, Edge Function active, déploiement Vercel ou merge PR #6 sans nouvelle autorisation. La synchronisation du PC n'est pas requise pour cette recette backend isolée (aucune modification des composants React). L'état du produit principal et ses secrets restent inchangés.

**Références officielles :** https://supabase.com/docs/reference/javascript/auth-admin-createuser ; https://supabase.com/docs/reference/javascript/auth-admin-generatelink ; https://supabase.com/docs/guides/auth/audit-logs ; https://docs.github.com/en/actions/reference/security/oidc
