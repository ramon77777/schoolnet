# SCHOOLNET — Lot 5.C-B.2 / Étape A.2.2
## Preuve sécurisée d'activation des accès familiaux — préparation (11 novembre 2026)

**Statut : code préparatoire GitHub seulement, aucune preuve Auth réelle raccordée, aucune activation possible.**
**Périmètre autorisé :** étude, conception, implémentation sécurisée sans écriture, tests simulés, sauvegarde GitHub, puis recette locale. **NON AUTORISÉS :** nouvelle migration, déploiement Supabase/Vercel, création de comptes, envoi de liens, collecte d'événements Auth réels ou modification des mots de passe.

### 1. Pourquoi la preuve d'activation reste nécessaire

Un compte Auth nouvellement créé n'est pas nécessairement activé. Les signaux suivants sont **insuffisants à eux seuls** :
- Le statut `activated` de `schoolnet_family_invitation_records` (déclaration métier non indépendante) ;
- Le champ `auth.users.last_sign_in_at` ou une session `SIGNED_IN` : une récupération peut aussi ouvrir une session ;
- L'e-mail confirmé, l'ouverture d'un lien ou un JWT valide ;
- Le message de succès affiché par le navigateur après `updateUser({password})`.

**Source documentaire Supabase (vérifiée le 11/11/2026) :**
- [Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs) : actions `user_updated_password` et `login`, stockage éventuel dans `auth.audit_log_entries` si activé ;
- [Password Verification Hook](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook) : événement serveur avec `user_id` et `valid`.
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [User sessions](https://supabase.com/docs/guides/auth/sessions) : distinguer mot de passe, récupération et session.

**État actuel vérifié :** le schéma `auth.users` dispose bien d'`encrypted_password`, `updated_at`, `email_confirmed_at` et `last_sign_in_at`. Aucune entrée d'`auth.audit_log_entries` n'a été observée lors de la revue ; la configuration/retention réelle des événements sera à valider **dans le Supabase isolé d'essai**, sans modification du projet principal. Le Password Verification Hook n'a pas été activé dans le cadre de A.2.2.

### 2. Code intégré sur la branche GitHub

| Fichier | Travail réalisé |
| --- | --- |
| `supabase/functions/_shared/familyActivationEvidence.ts` | Évaluateur pur `evaluateFamilyActivationProof` : retourne `verified:false` par défaut ; n'accepte une chaîne complète que si dossier, identité Auth, rôle, transmission, modification du mot de passe, vérification positive du mot de passe et connexion Auth sont cohérents |
| `supabase/functions/_shared/familyActivationEvidence_test.ts` | 30 scénarios hors ligne, dont un cas positif avec données **entièrement simulées** et 29 refus (absence de preuve, identité ou rôle incohérents, preuve d'un autre usager, ordre temporel impossible, statut `activated` sans justificatif, session seule…) |
| `supabase/functions/schoolnet-family-invitation/index.ts` | Appel de l'évaluateur dans `inspect` avec **toutes les preuves Auth fixées à `null`** ; renvoie `activation_proof_state` et `activation_evidence_verified:false`, ne déclenche aucune modification de l'état. Un registre `activated` sans preuve devient `manual_review`, pas `already_activated` |
| `src/features/enrollments/lib/adminFamilyInvitationApi.ts` | Contrat de lecture pour les états de preuve et leur vérification |
| `src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx` | Ajout d'une ligne de lecture « Preuve serveur », avec refus explicite lorsque la source n'est pas disponible et rappel des limites de session/e-mail |
| `scripts/check-family-readonly.mjs` | Refus du build si les sources de preuve sont raccordées par accident, si la vérification n'est plus côté serveur ou si un statut `activated` sans preuve n'est pas signalé |
| `.github/workflows/schoolnet-quality.yml` | Ajout d'un `deno test` dédié aux 30 scénarios après ESLint, prébuild, TypeScript/Vite et `deno check` de l'Edge Function |

### 3. Contrat de preuve envisagé — pas encore opérationnel

L'évaluateur exige **la conjonction**, pour **le même `user_id`**, de :
1. Un registre d'invitation correspondant exactement au dossier, destinataire, e-mail, rôle, compte et numéro de génération, au stade `sent_declared` ou `activated`.
2. Une confirmation d'identité fournie **par le serveur** : `auth.admin.getUserById` et `profiles`, jamais une chaîne déclarée dans le body, `user_metadata`, JWT ou écran.
3. Un événement Auth serveur `user_updated_password` intervenu **après** `sent_declared_at` et `last_prepared_at`.
4. Une vérification positive `valid:true` du mot de passe par un Password Verification Hook **protégé et journalisé** après ce changement.
5. Une connexion Auth `login` du même compte, corrélée à cette vérification positive à moins de 2 minutes, sans incohérence temporelle.

**IMPORTANT : les champs `source` des objets du test ne sont pas une signature.** La garantie de provenance viendra de tables privées et de permissions SQL strictes dans un environnement isolé, après GO. Un client HTTP ne devra jamais pouvoir fournir ces preuves ni choisir leurs dates. Les tests positifs purement simulés valident seulement la logique, **pas** la sécurité effective d'un fournisseur d'événements.

### 4. Limites et points bloquants avant activation réelle

- Le compte principal Supabase ne dispose **pas encore** de la chaîne d'événements protégés et corrélés. Tant qu'elle n'est pas en place, le code de production doit toujours afficher **preuve non disponible / activation non confirmée**.
- Il faudra valider le format réel, la rétention et les accès à `auth.audit_log_entries` dans l'environnement d'essai. Le hook ne doit pas écrire vers une table accessible au navigateur ni enregistrer de mot de passe, token ou lien.
- Des événements Auth horodatés ne prouvent pas l'identité civile ni la filiation : le contrôle humain administratif reste obligatoire.
- `ResetPasswordPage.tsx` accepte actuellement un simple `SIGNED_IN` pour accéder au formulaire de changement de mot de passe ; ce comportement existant devra être revu pour le mode `family-invite`, sans casser le parcours général « mot de passe oublié ». **Ne pas introduire un écran d'activation familiale actif avant la recette isolée.**
- L'enregistrement irrévocable de l'état `activated` ne doit être codé qu'après **preuve Auth indépendante**, validation du dossier, CAS, audit append-only, RLS, limites de concurrence et GO écritures dans un environnement isolé.
- Une récupération, une connexion ou une action administrateur postérieure à l'envoi ne vaut pas à elle seule activation par le destinataire.

### 5. Recette technique et locale A.2.2 à effectuer

**CI GitHub** : contrôler que le workflow `SCHOOLNET — Vérifications du code` passe :
- ESLint : aucune erreur bloquante (un avertissement React `user` préexistant peut subsister) ;
- `npm run build` avec `prebuild` de sécurité ;
- `deno check --node-modules-dir=auto supabase/functions/schoolnet-family-invitation/index.ts` ;
- `deno test supabase/functions/_shared/familyActivationEvidence_test.ts` : 30 tests, aucun accès à Supabase.

**Local Windows** : vérifier la branche, préserver `tsconfig.app.tsbuildinfo` avant `git pull --ff-only`. Lancer lint/build. Depuis `localhost:5173` en Super Admin : Demandes publiques → `DEM-3CF7B169BAD9` → inspecter Parent puis Apprenant. Les cartes doivent conserver `new_invitation_possible`, le suivi A.2 « publication en attente », « activation non confirmée » et « Preuve serveur : non disponible », **sans boutons de mutation**. L'Edge distante est toujours version 2 et ne renverra pas `activation_proof_state` ; le frontend doit donc afficher un repli sûr.

**Après tests** : vérifier sur Supabase : 35 migrations, 10 Auth, 0 invitations, 0 événements et demande fictive toujours `new`. Garder la PR #6 brouillon sans fusion, sans Vercel.

### 6. Conditions strictes d'une prochaine étape

Une nouvelle autorisation est obligatoire avant tout schéma SQL, tout hook de vérification de mot de passe, toute lecture/écriture d'une table de preuves, tout changement du flux de récupération Auth et toute publication. Le pilote doit avoir lieu d'abord **dans un projet Supabase isolé**, avec des comptes et boîtes e-mail de test contrôlés, contrôles de concurrence et de reprise, une preuve de non-duplication et un plan de rollback.

**État : Étape A.2.2 implémentée de façon préparatoire, non déployée, non recettée localement. Aucun compte activé par cette étape.**
