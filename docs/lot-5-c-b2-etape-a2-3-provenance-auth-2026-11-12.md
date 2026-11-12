> **12/11/2026 — Suites du plan A.2.3 : sandbox Free créée et vérifiée en B.1.** `schoolnet-auth-sandbox` — référence `onqlsvphmrqhelislpry` — est disponible et isolé : 0 Auth, 0 table `public`, aucune migration et aucune Edge Function ; 0 USD/mois selon devis confirmé. Le principal demeure inchangé. **Aucun essai d'activation réel n'a été entrepris** : la mise en place des premières tables/épreuves nécessite un GO B.2 séparé. Voir [rapport B.1](./lot-5-c-b2-b1-sandbox-cree-2026-11-12.md).

> **SUITE B.0 — 12/11/2026 : préparation du projet de test isolé terminée, SANS CRÉATION.** Devis officiel sur l'organisation Supabase Free `schoolnet 2.0` : **0 USD/mois** pour un second projet, **1 projet actuellement visible sur 2 emplacements Free** ; branche payante évitée. Architecture recommandée : Docker/CLI + Mailpit local pour liens de récupération (pas d'envoi réel), puis éventuel `schoolnet-auth-sandbox` autonome en région `eu-west-1`, sous GO distinct. Le SMTP intégré hébergé ne délivre qu'aux membres de l'équipe autorisés ; la récupération avec des adresses fictives sera testée localement. **Aucun changement au projet principal, aucun projet créé ni coût engagé.** Voir [Plan détaillé B.0 — environnement Auth isolé](./lot-5-c-b2-b0-sandbox-auth-plan-2026-11-12.md).

# SCHOOLNET — Lot 5.C-B.2 / Étape A.2.3
## Audit de provenance Auth et stratégie de première connexion — 12 novembre 2026

**STATUT : ÉTUDE ET CONTRÔLES NON MUTATEURS TERMINÉS. AUCUNE ACTIVATION AUTORISÉE.**

### 0. Cadre de l'autorisation

L'utilisateur a autorisé l'étude de la provenance des preuves Auth, du journal d'audit et du parcours de première connexion **sans toucher aux comptes, aux données ni à la fonction Edge déployée**. Les résultats ci-dessous sont des **lectures** Supabase / GitHub et des vérifications dans la documentation officielle. Ce document n'est ni une migration SQL, ni un déploiement, ni une habilitation d'activation.

Branche : \`feature/schoolnet-multi-etablissements\`, PR #6 en brouillon. Au début de l'audit : \`c1d6f7a\` sur GitHub, **35** migrations, **10** comptes Auth, **0** registres d'invitation, **0** événements d'invitation. Demande de recette \`DEM-3CF7B169BAD9\` au statut \`new\`.

### 1. Constats confirmés (GitHub, Supabase et documentation)

| Point | Constat observable | Conséquence |
| --- | --- | --- |
| Offre Supabase de l'organisation | \`plan=free\`, \`tier=tier_free\` (lecture de la configuration de l'organisation liée au projet SCHOOLNET) | Ne pas utiliser de fonctionnalité réservée aux abonnements Team / Enterprise |
| Password Verification Attempt Hook | **Team et Enterprise uniquement**, d'après la documentation officielle Auth Hooks | **Bloquant de la stratégie A.2.2 si elle exige impérativement ce hook** ; ne pas déployer/activer de hook sur Free |
| \`auth.audit_log_entries\` | Table présente, avec **0 ligne** ; **0** événement \`user_updated_password\`, **0** événement \`login\` en base | Aucun événement de cette table ne peut servir de preuve actuellement |
| Droits \`auth.audit_log_entries\` | \`anon SELECT=false\`, \`authenticated SELECT=false\`, **\`service_role SELECT=false\`**, \`postgres SELECT=true\` | Une Edge Function dotée de \`service_role\` ne peut PAS supposer qu'elle peut directement lire ce journal |
| Journal externe Supabase | Sur les **24 heures 11/11 08:00 UTC → 12/11 08:00 UTC**, \`auth_audit_logs\` : **24 événements** ; \`auth_logs\` : **47 événements**. Dans les messages du premier : 3 mentions « login » et 0 mention \`user_updated_password\` | Des événements existent hors de \`auth.audit_log_entries\` ; **ni leur méthode d'authentification ni leur corrélation fiable à une invitation n'ont été démontrées** |
| Fonction familiale réellement déployée | \`schoolnet-family-invitation\` **v2 ACTIVE**, \`verify_jwt=true\`, \`READ_ONLY_DEPLOYMENT=true\`, sans intégration A.2.2 | Le serveur principal reste inchangé et ne valide aucune activation |
| Preuves A.2.2 sur GitHub | \`familyActivationEvidence.ts\` et 30 tests Deno de logique **simulée** ; l'Edge GitHub passe encore \`authUser:null\`, \`passwordUpdated:null\`, \`validPasswordVerified:null\`, \`passwordLogin:null\` | Aucun \`verified=true\` ne peut être produit par le flux GitHub actuel ; le champ \`source\` d'un objet de test **n'authentifie pas sa provenance** |
| Récupération du mot de passe | \`ResetPasswordPage.tsx\` traite les événements \`PASSWORD_RECOVERY\` mais accepte aussi \`SIGNED_IN\` / \`getSession()\` comme session suffisante pour afficher le formulaire | Ce comportement du parcours générique n'est **pas** une preuve d'activation d'une invitation familiale ; un mode dédié et des contrôles Auth restent nécessaires |
| Lien généré | L'Edge préparatoire utilise \`generateLink({type:'recovery'})\` vers \`/auth/reset-password?mode=family-invite\` | Générer un lien ≠ le transmettre ; ouvrir le lien ≠ définir le mot de passe ; une session recovery ≠ connexion par mot de passe |

**Important sur la configuration** : une table PostgreSQL d'audit vide ne permet pas d'affirmer que la journalisation Auth est désactivée ; la documentation Supabase permet le stockage externe et rend le stockage en base optionnel. Vérifier le paramétrage dans un environnement **isolé**, sans toucher à la configuration principale. Un journal externe servant à l'observabilité ne devient pas automatiquement une source de preuve transactionnelle consultable par l'Edge Function.

Sources documentaires consultées :
- https://supabase.com/docs/guides/auth/auth-hooks (tableau des plans, Password Verification Attempt réservé à Team / Enterprise)
- https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook (entrée \`user_id\`, \`valid\`, précautions liées aux requêtes non authentifiées)
- https://supabase.com/docs/guides/auth/audit-logs (stockage externe, stockage PostgreSQL optionnel)
- https://supabase.com/docs/guides/auth/sessions (une session JWT ne prouve pas la méthode de connexion)
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/changelog (CLI v3 depuis novembre 2026 : distinguer explicitement \`--remote\` et \`--local\` lors d'un futur essai autorisé).

### 2. Décision technique A.2.3

**Ne pas activer de mécanisme qui déduirait \`activated\` d'une session valide, d'un succès \`updateUser\` côté navigateur, d'un e-mail confirmé, de \`last_sign_in_at\`, du seul statut de registre ou d'un champ \`source: 'supabase_auth_audit'\` fourni par un client.**

**Conserver A.2.2 en mode \`fail-closed\`**, et distinguer quatre étapes métier :
1. \`prepared\` : compte / lien théoriquement préparé (non validé en réel).
2. \`sent_declared\` : l'administrateur atteste une transmission par canal externe, **sans prétendre prouver la réception**.
3. \`password_set_observed\` (nouvelle notion à concevoir, non installée) : un événement serveur fiable établit un changement du mot de passe **après** la déclaration et pour la bonne génération d'invitation.
4. \`first_password_login_verified\` (nouvelle notion à concevoir, non installée) : une preuve indépendante établit une connexion **avec mot de passe** après l'étape précédente. Seulement ensuite l'état métier \`activated\` pourrait être envisagé.

La création du compte, la confirmation d'activation, le **rattachement familial** et l'**inscription annuelle** sont des opérations différentes. Les vérifications d'identité civile et de filiation demeurent manuelles.

### 3. Stratégie compatible avec SCHOOLNET sur Supabase Free

**Piste à tester exclusivement en environnement Auth isolé, non démontrée à ce jour :**

**A. Preuve d'un changement de mot de passe.** Concevoir un journal minimal privé, alimenté par une preuve serveur du changement effectif d'un secret Auth (par exemple un événement \`user_updated_password\` si sa source, sa conservation et son accès sécurisé sont vérifiés, ou un détecteur PostgreSQL de transition de mot de passe, évalué uniquement en environnement isolé). Aucun hash, mot de passe, lien, JWT ou jeton de récupération ne doit être stocké. Ne PAS créer de trigger sur \`auth.users\` du projet principal sans essai et GO SQL distinct : une erreur peut bloquer les opérations Auth.

**B. Preuve d'une première connexion avec mot de passe.** Vérifier sur l'environnement isolé si les événements Auth auditables distinguent effectivement le flux password des sessions créées par lien recovery/magic link, et si l'horodatage, le \`user_id\` et un identifiant de session peuvent être corrélés de façon fiable. **Le libellé \`login\` seul ne suffit pas.** Si l'information n'est pas disponible ou non durable, laisser \`first_password_login_verified=false\` ; ne pas requalifier une affirmation navigateur en preuve. Ne pas collecter le mot de passe dans une Edge Function maison simplement pour contourner cette limite.

**C. Source de confiance exploitable par l'application.** Ne pas accorder sans examen un \`SELECT\` global sur \`auth.audit_log_entries\`. Pour une future intégration, préférer un stockage applicatif privé et append-only de preuves **déjà validées à leur collecte**, avec une interface de lecture très étroite, des privilèges minimaux, des journaux d'accès et une séparation des producteurs/lecteurs. L'existence d'un schéma non exposé, RLS + FORCE RLS, revocations \`anon/authenticated\` et un accès de service borné sont nécessaires. Toute fonction \`SECURITY DEFINER\` demande une revue spécifique et ne doit pas constituer une API publique.

**D. Si la preuve de première connexion ne peut pas être établie sur Free :** conserver le statut **« mot de passe défini, première connexion non vérifiée »** ; ne jamais présenter une activation automatique comme acquise. Évaluer ensuite une preuve indépendante non intrusive compatible avec Free, plutôt qu'imposer un abonnement supérieur.

### 4. Contrat minimal d'événement privé (CONCEPTION, PAS DE TABLE CRÉÉE)

Chaque pièce de preuve devrait contenir : un ID d'événement non réutilisable, \`request_id\`, \`recipient\`, \`generation_count\`, \`user_id\`, \`kind\` (\`password_changed\` ou \`password_login\`), \`source_kind\` *réel et vérifié à la collecte*, un identifiant d'événement d'origine, \`occurred_at\` (horodatage source) et \`observed_at\` (horodatage de collecte). Pour la connexion, un \`session_id\` peut être conservé **si la source de confiance le fournit réellement**. Définir des contraintes anti-doublon sur la provenance et sur \`request_id + recipient + generation_count + kind\`, et une politique de rétention.

Aucun texte libre non contrôlé, e-mail en clair inutile, IP, mot de passe, token d'accès, refresh token, lien recovery ou hash Auth ne doit être conservé. Ne pas accepter d'horodatage ni d'identité de preuve en entrée HTTP client. Une preuve ancienne d'une génération précédente ne doit jamais valider un lien renouvelé.

Les transitions doivent utiliser un contrôle atomique de statut (**CAS**) et fournir un audit append-only indépendant. Toute incohérence mène à \`requires_review\` plutôt qu'à une création, une nouvelle tentative de connexion ou une activation automatique.

### 5. Parcours de première connexion souhaité (à prototyper plus tard)

\`\`\`text
Super Admin : dossier et identite verifies
       |
       v
Lien recovery prepare (futur essai isole, pas sur principal)
       |
       v
Transmission manuelle declaree (non preuve de reception)
       |
       v
Visite du lien -> session PASSWORD_RECOVERY
       |  pas de statut activated
       v
Saisie du mot de passe -> supabase.auth.updateUser({ password })
       |  pas de preuve serveur sur seul message client
       v
Fin de session recovery, puis connexion explicite au mot de passe
       |
       v
Source serveur attestant password_changed + password_login
       |  provenance, user_id, generation, horodatages, methode contrôles
       v
Transition atomique vers activated (APRES GO ecritures et recette isolee)
       |
       v
Lien familial verifie manuellement et inscription annuelle distincte
\`\`\`

Le parcours \`ForgotPasswordPage\` générique doit continuer à fonctionner pour tous les comptes. Le mode \`family-invite\` devra disposer de ses contrôles sans réduire la sécurité ni casser les autres flux Auth.

### 6. Plan de tests ciblés avant tout GO d'écriture

Dans un **nouveau projet Supabase isolé** (création et coût éventuel soumis à autorisation distincte), réaliser successivement, avec des comptes fictifs et des boîtes de test effectivement contrôlées :

| Scénario | Résultat attendu |
| --- | --- |
| Génération d'un lien non transmis | Pas d'activation |
| Ouverture d'un lien recovery sans choix de mot de passe | Pas d'activation |
| Session obtenue par magic link ou OTP | Pas de preuve de connexion par mot de passe |
| Changement de mot de passe sans connexion ultérieure prouvée | État intermédiaire, pas \`activated\` |
| Connexion password sans changement lié à l'invitation | Refus de validation |
| Mise à jour du mot de passe avant la déclaration d'envoi | Refus (chronologie invalide) |
| Événement d'un autre utilisateur / rôle / e-mail | Refus |
| Réutilisation d'un ancien événement après renouvellement | Refus |
| Deux confirmations simultanées | Une seule transition, audit non dupliqué |
| Journaux absents, ambigus, inaccessibles ou hors rétention | Refus de confirmation et revue humaine |
| Interruption après succès Auth mais avant journal applicatif | Reprise traçable, aucune fausse activation |
| Première connexion réellement démontrée en serveur | \`activated\` envisageable seulement après contrôle CAS/audit et GO |
| Appel sans session, Parent ou school_admin | 401/403 comme précédemment |

Avant tout essai, vérifier **les capacités de l'offre du projet d'essai**, les URLs de redirection, le flux recovery réel, la disponibilité du journal Auth et les permissions SQL. Ne pas utiliser l'environnement principal à cette fin.

### 7. Stop / rollback / jalons

- **Maintenant — A.2.3** : lecture et documentation uniquement. Pas de migration \`sql\`, pas de hook, pas d'événement Auth artificiel ajouté, pas de nouveau déploiement Edge, pas de Vercel, pas de fusion PR #6.
- **GO-B préalable** : décider la configuration et les coûts d'un environnement de test isolé. Examiner à cet instant la version CLI : depuis la v3, \`db push\` sans \`--remote\` ne cible plus l'hôte distant. Aucune commande qui peut modifier un serveur sans cible explicite.
- **GO-SQL distinct** : revue des politiques d'accès, du producteur d'événements, de la journalisation et de la conservation. Tester d'abord l'impact Auth sur l'environnement isolé.
- **GO-AUTH distinct** : autoriser le premier compte fictif, le lien de récupération et le changement de mot de passe sur le projet isolé.
- **GO principal / GO Vercel distincts** : après idempotence, anti-doublon, cohérence d'identité, sécurité, tests locaux et confirmation de la méthode de connexion.

**Décision à ce stade : NO GO pour \`activated\`. Priorité : établir une source serveur fiable de changement de mot de passe et surtout de méthode de connexion, compatible Supabase Free.**

### Références GitHub internes
- \`supabase/functions/_shared/familyActivationEvidence.ts\`
- \`supabase/functions/_shared/familyActivationEvidence_test.ts\`
- \`supabase/functions/schoolnet-family-invitation/index.ts\`
- \`src/features/auth/pages/ResetPasswordPage.tsx\`
- \`src/features/auth/pages/ForgotPasswordPage.tsx\`
- \`src/features/auth/pages/LoginPage.tsx\`
- \`docs/lot-5-c-b2-etape-a2-2-preuve-activation-2026-11-11.md\`
