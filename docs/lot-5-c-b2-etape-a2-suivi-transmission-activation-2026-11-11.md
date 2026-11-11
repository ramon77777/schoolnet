# SCHOOLNET — Lot 5.C-B.2 / Étape A.2.1
## Suivi de la transmission et de l'activation — implémentation préparatoire (11 novembre 2026)

**Statut : CODE GITHUB UNIQUEMENT — AUCUNE ÉCRITURE AUTORISÉE — RECETTE LOCALE EN ATTENTE.**

La phase A.1 (inspections Parent/Apprenant) a été validée avec une demande fictive. L'autorisation d'avancer concerne **l'étape A.2 en mode préparatoire**, sans compte créé, sans invitation générée, sans migration, sans déploiement de fonction Edge ni déploiement Vercel.

### État de référence et décisions

- Branche de travail : `feature/schoolnet-multi-etablissements` ; PR #6 en brouillon, non fusionnée.
- Supabase principal : 35 migrations, 10 comptes Auth, 0 invitations familiales, 0 événements d'invitation à l'ouverture de A.2.1.
- Edge actuellement déployée : **version 2**, lecture seule, `verify_jwt=true`. **Ne pas déployer la version GitHub préparatoire** avant nouvelle autorisation ; elle porte des chemins de mutation non recettés.
- `READ_ONLY_DEPLOYMENT=true` et le verrou de demande/destinataire pilote restent présents en dur dans le code sur GitHub.
- **Différence fondamentale** : `sent_declared` = déclaration de transmission par un administrateur, **pas preuve de réception** ; `activated` = événement sensible qui ne doit être confirmé que par une preuve Auth serveur, **jamais par la déclaration d'un administrateur ou par un simple jeton de session**.

### Réalisation A.2.1

1. `supabase/functions/schoolnet-family-invitation/index.ts`
   - Le schéma de réponse `inspect` est enrichi avec **`delivery_status`**, **`delivery_declared_at`**, **`activation_status`** et **`activation_evidence_verified:false`** ; cette sortie est exclusivement consultative, sans lien ni jeton.
   - Nouvelle action **`declare_sent`**, seulement **dans le code dormant après `if (!enabled)` et après le verrou pilote** : exige `verified:true`, `delivery_confirmed:true`, canal `manual_email` ou `in_person`, justification de 10 à 1000 caractères, compte et profil strictement cohérents, statut préalable `prepared`, absence d'une déclaration antérieure.
   - L'action **ne génère ni lien ni message** et ne crée pas de compte. Le seul changement qui serait éventuellement autorisé dans une future recette isolée serait le passage atomique `prepared → sent_declared` du registre existant, avec `sent_declared_at`, `sent_declared_by`, `last_action_by` et audit via trigger SQL existant.
   - La justification est temporairement conservée dans `recovery_note` avec un préfixe de canal ; cette colonne peut être modifiée lors d'une reprise ultérieure. **Ce n'est pas un registre d'attestation immuable suffisant pour une mise en production.** Prévoir si nécessaire un champ/un événement append-only dédié après une autorisation SQL distincte.
   - Empêche de placer un lien ou des jetons connus dans la note, sans prétendre détecter tous les secrets possibles.
   - **AUCUNE action `confirm_activation`** : elle n'est pas sûre tant qu'il n'existe pas une preuve de mise en place du mot de passe et d'une véritable connexion reconnue par Supabase côté serveur. Les champs `last_sign_in_at`, `email_confirmed_at` ou un `SIGNED_IN` du navigateur, pris isolément, sont insuffisants (une ouverture de lien recovery peut authentifier temporairement).
2. `src/features/enrollments/lib/adminFamilyInvitationApi.ts`
   - Ajoute le contrat de suivi de lecture, et `declareFamilyInvitationSent` **non raccordé à un écran**, doté de validations locales et du refus d'une réponse dépourvue des marqueurs de sécurité.
3. `src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx`
   - Chaque carte Parent/Apprenant indique désormais « Transmission » et « Activation ». Si la fonction distante v2 n'envoie pas encore les champs A.2, l'interface affiche **« suivi A.2 serveur en attente de publication »**, sans inventer un état.
   - Aucun bouton d'action de transmission/activation, de création ou de renvoi de lien.
4. `scripts/check-family-readonly.mjs`
   - Garde-fous supplémentaires : la branche `declare_sent` doit rester derrière le verrou, la transition doit être `prepared → sent_declared`, aucune action `confirm_activation` ne peut être branchée, aucune action mutatrice ne peut être appelée depuis le préflight.
5. `.github/workflows/schoolnet-quality.yml`
   - Ajout d'une étape **`deno check supabase/functions/schoolnet-family-invitation/index.ts`** après lint et build Node/TypeScript/Vite, pour bloquer les erreurs de syntaxe TypeScript/Deno avant tout futur déploiement.
   - Cette étape n'utilise ni clés Supabase, ni connexion à la base, ni mutation.

### Cycle d'états et preuve

| État | Signification | Écriture autorisée aujourd'hui ? |
| --- | --- | --- |
| Aucun registre | Inspection seulement, aucun accès préparé | Non |
| `preparing`, `auth_created`, `profile_ready` | Préparation future, non validée | Non |
| `prepared` | Lien temporaire généré et compte lié (essai à réaliser en environnement isolé) | Non |
| `sent_declared` | Administrateur a déclaré une transmission par canal externe | **Non** ; code dormant uniquement |
| `activated` | Confirmation réelle d'activation | **Non** ; aucune action en place |
| `requires_review` | Interruption ou incohérence requérant un examen humain | Non |

**Limite sécurité volontaire :** l'activation n'est **pas** déduite du seul statut du registre. Elle ne deviendra disponible qu'avec une preuve côté Auth fiable, une attestation traçable et un GO explicite après tests. Le déclencheur SQL autorise déjà techniquement `sent_declared→activated`, mais cela ne constitue pas une autorisation métier.

### Recette ciblée locale A.2.1 (à exécuter)

1. Depuis le projet local, contrôler `git status --short`, préserver les éventuels fichiers générés modifiés, puis `git fetch` / `git pull --ff-only` sur la branche avant test.
2. Vérifier `npm run lint` puis `npm run build` : le prébuild doit passer, TypeScript/Vite doit compiler.
3. Vérifier sur GitHub Actions l'étape supplémentaire **Deno check Edge Function**, qui doit être verte. Ne pas déployer la fonction, même si cette vérification réussit.
4. À `localhost:5173` avec Super Admin, ouvrir la demande fictive `DEM-3CF7B169BAD9`. Cliquer `Inspecter le parent` et `Inspecter l'apprenant`. Les deux cartes montrent les nouveaux libellés de suivi : **« suivi A.2 serveur en attente de publication »** pour la transmission et **« non confirmée »** pour l'activation ; `new_invitation_possible` reste affiché. Aucun nouveau bouton actif.
5. Contrôler les journaux Supabase `POST 200` et les compteurs : 10 Auth, 0 invitations, 0 événements, 35 migrations, demande toujours `new`. Ne pas finaliser la demande fictive.

### Prochaine sous-étape A.2.2 (non implémentée et sans GO d'écriture)

Étudier la confirmation fiable d'activation après mise en place réelle d'un mot de passe, en s'appuyant sur un événement Auth serveur vérifiable (et éventuellement sur des événements d'audit Auth), pas sur la simple présence d'une session ni sur une affirmation client. Définir aussi l'historique immuable de transmission et les tests de concurrence `CAS`. Pour le cas des comptes sans email personnel, prévoir un autre parcours sécurisé distinct.

**Décision actuelle : Étape A.2.1 préparée sur GitHub, pas encore recettée localement ; pas d'activation, pas de mutation et pas de Vercel.**
