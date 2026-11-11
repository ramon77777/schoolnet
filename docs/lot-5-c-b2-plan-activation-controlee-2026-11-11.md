# SCHOOLNET 2.0 — Lot 5.C-B.2
## Plan d'activation contrôlée des invitations familiales — revue technique du 11 novembre 2026

**Statut : PLAN / PRÉPARATION UNIQUEMENT — NO GO pour les écritures.**

> L'accord utilisateur du 11 novembre autorise une **revue de code et un plan d'activation**, pas un déverrouillage, pas une migration, pas un compte créé, pas un lien généré, pas une suppression de données et pas un déploiement Vercel. Conserver intégralement le workflow de validation par sous-lot, avec un GO distinct avant chaque activation sensible.

### 1. État vérifié et périmètre

- Branche : `feature/schoolnet-multi-etablissements` ; PR #6 en brouillon, non fusionnée (base `feature/schoolnet-notifications`).
- Supabase `schoolnet_2.0` : **35 migrations**, **10 comptes Auth**, **0 ligne** dans `schoolnet_family_invitation_records`, **0** dans `schoolnet_family_invitation_events`. La demande fictive `DEM-3CF7B169BAD9` reste `new`.
- Edge Function `schoolnet-family-invitation` : **version 2 ACTIVE**, `verify_jwt=true`, `READ_ONLY_DEPLOYMENT=true`, `enabled = !READ_ONLY_DEPLOYMENT && SCHOOLNET_FAMILY_INVITES_ENABLED === 'true'`. CORS prévu sur `http://localhost:5173` pour `inspect` uniquement.
- Recettes HTTP **déjà validées** : Super Admin `inspect` Parent existant → `reuse_after_verification` HTTP 200 ; parent et apprenant fictifs avec emails distincts → `new_invitation_possible` HTTP 200 ; sans session / JWT invalide → HTTP 401 ; Parent authentifié / `school_admin` authentifié → HTTP 403. Compteurs inchangés après ces tests.
- **Ne pas confondre** cette validation de lecture avec des essais réels `prepare`, `resume`, `renew` ou `flag_review` : aucune de ces écritures n'est encore recettée.

Sources techniques :
- `supabase/functions/schoolnet-family-invitation/index.ts`
- `supabase/migrations/20261111101351_schoolnet_family_invitation_registry.sql`
- `src/features/enrollments/lib/adminFamilyInvitationApi.ts`
- `src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx`
- `src/features/auth/pages/ResetPasswordPage.tsx`
- `supabase/config.toml`
- Protocole de recette : `docs/lot-5-c-b2-invitations-familiales-serveur-et-activation.md`

### 2. Résultats de la revue du code

**Protections en place**
1. Le JWT est vérifié et le rôle est contrôlé à partir de `profiles.role === 'admin'`, côté serveur ; les deux refus 401/403 ont été testés.
2. Le registre dispose de clés uniques `(request_id,recipient)`, `lower(email)`, `user_id` non nul ; RLS + FORCE RLS, absence d'accès direct `anon/authenticated`, pas de DELETE `service_role`.
3. Les transitions d'état sont surveillées par un trigger, avec historique append-only sans lien d'activation ni token.
4. Le registre est réservé **avant** l'appel Auth, et le code teste les comptes existants pour éviter une recréation à l'aveugle.
5. `auth.users` exécute `handle_new_user`, qui insère un profil provisoire `student` et `full_name = NULL`. Les colonnes `profiles.role`, `full_name`, `gender` existent. Hypothèse de création de profil du code : confirmée structurellement.
6. `auth.admin.createUser` et `auth.admin.generateLink({type:'recovery'})` sont des opérations serveur distinctes ; `generateLink` construit un lien sans envoi automatique. Le lien est retourné au Super Admin pour transmission manuelle.

**Écarts et risques AVANT déverrouillage (priorité)**

| Priorité | Point | Risque / décision |
| --- | --- | --- |
| P0 | **Cycle d'activation incomplet** : `sent_declared` et `activated` existent en SQL, mais la fonction ne possède aucune action pour enregistrer leur transition | Concevoir preuve de transmission, confirmation serveur d'activation et audit ; ne jamais assimiler `prepared` à compte activé |
| P0 | **Interface d'administration incomplète** : `prepareFamilyInvitation`, `retryFamilyInvitation`, `flagStaleFamilyInvitation` sont des contrats TS non raccordés aux boutons ; seul `inspect` est exposé | Ajouter une interface à permissions strictes, validations de dossier et de destinataire, confirmation explicite, historique, messages sûrs |
| P0 | **Redirect d'activation** : `destination()` autorise HTTPS et pointe vers le site/preview Vercel ; en local, seuls les appels `inspect` sont autorisés | Définir un parcours d'essai local **dans un environnement Auth isolé**, avec redirection exacte autorisée par Supabase ; ne pas déverrouiller Vercel ni la production pour contourner le test |
| P0 | **Déverrouillage global trop large pour un pilote** : lever `READ_ONLY_DEPLOYMENT` et le flag permettrait les écritures pour toutes les demandes éligibles par un Super Admin, y compris depuis les origines autorisées | Prévoir un garde-fou **côté serveur** de projet/environnement, d'identifiant de demande explicitement autorisé et de volume (1 dossier au départ). CORS n'est pas une barrière d'autorisation suffisante |
| P0 | **Risque d'orphelin Auth** entre `createUser` et `advance(preparing,auth_created)` | Traiter ce cas en `requires_review`, sans nouveau `createUser` automatique ; documenter recherche et rapprochement manuel, sans suppression automatique |
| P0 | **Correspondance identitaire et parentale** : un e-mail déjà présent n'implique pas un lien Parent–Apprenant validé | Réutilisation d'un compte existant et rattachement familial exclusivement après examen humain et validation des dossiers scolaires |
| P1 | **Mécanisme `recovery` sur compte nouvellement créé et e-mail non confirmé** non éprouvé bout-en-bout | Tester URL autorisée, consommation du lien, création de mot de passe, confirmation e-mail, nouvel accès et expiration ; ne pas présumer la compatibilité de tous les réglages Auth |
| P1 | **Page `ResetPasswordPage`** vérifie une session, mais ne distingue pas explicitement `mode=family-invite`, ne contrôle pas la correspondance avec l'invitation et ne met pas à jour `activated` | Ajouter un parcours d'activation dédié ou des vérifications serveur spécifiques ; ne jamais mettre l'état à jour sur seule déclaration du navigateur |
| P1 | **Reprise et concurrence** : CAS présent, mais crash, double clic, renouvellement, cooldown, dépassement de 5 liens et statut `requires_review` non recettés | Tests d'injection d'échecs et simultanéité, puis processus de revue humaine documenté |
| P1 | **Secrets / lien d'activation** | Afficher/copier le lien seulement au moment autorisé, sans logs, captures, analytics, URL externe imprévue, stockage persistant ou diffusion automatique ; expiration et renouvellement contrôlés |
| P1 | **Durcissement Auth en base** : Security Advisor signale `handle_new_user` avec `search_path` mutable et `EXECUTE` exposé aux rôles `anon/authenticated` malgré `SECURITY DEFINER` | Examiner précisément ses privilèges et conséquences avant toute DDL corrective. Une alerte de linter n'est pas, à elle seule, la preuve d'une exploitation. Préserver le trigger Auth et l'usage des autres modules |
| P2 | **Autres avis Supabase Security Advisor** : fonctions `SECURITY DEFINER` et politique de mots de passe compromis | Revue de sécurité générale distincte avant production ; ne pas appliquer un `REVOKE` global sans tests d'impact |
| P2 | **Dette frontend existante** : avertissement ESLint `useEffect user`, vulnérabilités npm signalées, taille des bundles | Suivi technique séparé ; évaluer la gravité des dépendances avant publication |

### 3. Cycle cible proposé (NON ACTIVÉ)

```text
Demande publique (new / contacted)
    |
    +-- inspect (lecture seule, Super Admin) --> décision
    |     +-- compte existant --> réutilisation après vérification manuelle
    |     +-- sans compte --> candidat à une invitation
    |     +-- incohérence --> revue humaine
    |
    +-- vérification explicite du dossier et de l'identité par Super Admin
          |
          +-- réservation unique : preparing
          +-- création Auth serveur : auth_created
          +-- mise à jour profil provisoire : profile_ready
          +-- génération d'un lien temporaire (sans email) : prepared
          +-- transmission attestée : sent_declared [ACTION À CONCEVOIR]
          +-- preuve Auth d'activation et contrôle serveur : activated [ACTION À CONCEVOIR]

En cas d'incident : requires_review ; reprise contrôlée du même user_id
après vérification ; jamais de création automatique supplémentaire.
```

La création de compte/activation **ne vaut pas rattachement familial**, ni inscription annuelle, ni affectation à une classe. Ces opérations demeurent dans le workflow manuel vérifié de `Demandes publiques`, `Utilisateurs` et `Inscriptions`.

### 4. Découpage proposé par sous-étapes et GO distincts

**Étape A — Durcissement de conception et préflight (sans écritures Auth)**
- Compléter l'API et la vue de préflight pour montrer la décision, l'identité vérifiée et les préconditions ; aucun bouton `prepare` actif.
- Ajouter validations de cohérence demande/role/e-mail, garde-fou d'environnement et demande autorisée côté serveur, limitation d'accès/de tentatives.
- Concevoir le journal de remise et la preuve d'activation, le parcours `ResetPasswordPage` et le protocole de reprise manuelle ; revue des alertes du déclencheur `handle_new_user`.
- Vérifier les changements de code par lint/build **et** une validation Deno dédiée de l'Edge Function (le build Vite n'avait pas détecté l'ancien BOOT_ERROR). Aucun changement de schéma sans GO SQL séparé.
- **GO-A** : revue du diff GitHub, tests non mutateurs et accord explicite.

**Étape B — Essai d'intégration dans un Supabase de test ISOLÉ (écritures de test, GO distinct)**
- Mettre en place une base/Auth de test séparée ou un environnement Supabase isolé approprié ; **ne pas utiliser la base principale** ni les e-mails `@example.test` comme boîtes de réception réelles.
- Redirection d'activation exacte vers `http://localhost:5173/auth/reset-password?mode=family-invite` **seulement dans cet environnement de test**, avec URL autorisée dans Supabase Auth. Le projet principal garde son redirect HTTPS strict.
- Utiliser uniquement des boîtes e-mail de test contrôlées, de faux noms et de faux dossiers. Tester Parent puis Apprenant, un par un.
- Tester : 1 compte/1 rôle, double clic, deux préparations simultanées, compte existant, conflit d'e-mail, erreur de réseau après `createUser`, reprise sans doublon, expiration/renouvellement, lien invalide, rôle non-admin refusé, copie du lien sans journal, confirmation d'activation, RLS et audits.
- Comparer avant/après : `auth.users`, `profiles`, registre, événements, demandes, résolutions et liens familiaux. Limiter toute mutation à la cible d'essai. **GO-B** après procès-verbal et contrôles.

**Étape C — Pilote extrêmement limité sur SCHOOLNET principal (GO distinct, pas avant B)**
- Réserver une seule demande interne autorisée explicitement, un e-mail contrôlé, maximum un compte ; code et flag bornés côté serveur à ce scénario.
- Prendre un état initial et vérifier à chaque sous-transition Auth/profil/registre/audit ; ne jamais confondre essai technique et activation effective d'un utilisateur.
- Ne pas envoyer de lien automatiquement ; vérifier affichage et transmission manuelle en environnement maîtrisé.
- En cas d'échec, verrouillage immédiat sans suppression des traces et passage en revue humaine. **GO-C** seulement après validation utilisateur du périmètre précis.

**Étape D — Recette fonctionnelle et publication Vercel (GO distinct)**
- Finaliser parcours complet, audit, affichage responsive, tests locaux, contrôle de sécurité, lint, build Vite, validation Edge Deno.
- Contrôler les dépendances à risque, vérifier la configuration des URLs, puis décider d'un déploiement Vercel **uniquement après validation complète du module et autorisation explicite**.
- Pas de fusion de PR #6 ni activation large de la fonction sans décision séparée.

### 5. Stratégie d'arrêt et retour arrière

1. **Arrêt des nouvelles opérations** : restaurer/maintenir `READ_ONLY_DEPLOYMENT=true` dans une version déployée vérifiée, désactiver le flag serveur et toute liste de demandes pilotes. Vérifier à nouveau `POST 403/503` sur les mutations et `inspect 200`.
2. **Ne jamais supprimer automatiquement les utilisateurs Auth ou les événements** : un compte éventuellement créé doit rester traçable ; faire une analyse de `user_id` avant une décision manuelle.
3. Si `createUser` a réussi mais que l'association au registre a échoué, **ne pas relancer une création** ; geler la demande, rapprocher le compte avec Auth/profils, documenter la reprise.
4. Ne pas effacer l'historique `schoolnet_family_invitation_events`. Préserver audit, horodatages, justifications et identité de l'opérateur.
5. Avant et après toute recette de mutation, sauvegarder les compteurs et la référence ciblée. Aucune opération sans test d'idempotence.

### 6. Conditions GO/NO-GO avant le premier compte réel

- [ ] Code backend compilé et testé via Deno/Edge, pas uniquement `npm run build`.
- [ ] Parcours de confirmation `sent_declared` / `activated` effectivement codé et éprouvé.
- [ ] Écran opérateur clair : préflight, consentement, identité, action confirmée, audit, rôle.
- [ ] Redirection locale de test validée en environnement séparé, pas de dépendance à Vercel pendant la recette locale.
- [ ] Création Auth, lien `recovery`, e-mail non confirmé, mot de passe et première connexion testés de bout en bout en environnement isolé.
- [ ] Collisions/réessais/pannes/crash testés ; zéro compte en double.
- [ ] Alertes de sécurité liées à `handle_new_user` examinées, corrections proposées et validées sous GO SQL distinct.
- [ ] RLS, permission Super Admin et séparation `school_admin` maintenues.
- [ ] Contrôle des données et journal d'audit avant/après chaque opération.
- [ ] Aucune écriture globale activée ; pilote limité au serveur, autorisé par l'utilisateur.
- [ ] Nouvelle autorisation explicite reçue avant chaque activation/migration/déploiement.

### 7. Décision et point de reprise

**Décision de l'audit du 11/11/2026 : phase de lecture seule achevée, activation Auth en attente (NO GO).** L'état du projet en production n'est pas modifié par la rédaction de ce plan. La prochaine intervention autorisée par défaut est uniquement la conception/durcissement technique **sans écriture**, après un GO distinct pour l'implémentation. Toute création Auth réelle, lien d'activation et nouveau schéma SQL réclament une validation spécifique.

**Références de documentation Supabase :**
- [Création Auth par Admin](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Génération de lien (pas d'envoi automatique)](https://supabase.com/docs/reference/dart/auth-admin-generatelink)
- [URLs de redirection et autorisations](https://supabase.com/docs/guides/auth/redirect-urls)
- [Security Advisor : fonctions à search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Security Advisor : fonctions SECURITY DEFINER accessibles aux rôles publics](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
