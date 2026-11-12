> **12/11/2026 — Suite B.5.1 après GO :** migration SQL sandbox `20261112094548_schoolnet_auth_sandbox_b51_token_observer` installée, une table privée d'observation des **pré-émissions non vérifiées**, fonction SQL `observe_access_token` renvoyant les claims inchangés, GRANT limités à `supabase_auth_admin`, RLS FORCÉE, journal append-only. Tests simulés et ROLLBACK réussis ; le rôle SQL de maintenance n'a pas le droit `SET ROLE supabase_auth_admin`, donc tests réels du rôle Auth encore à effectuer. **Le hook n'a PAS été activé dans les paramètres Supabase Authentication > Hooks** et aucune méthode Auth réelle n'a encore été collectée en B.5.1. Voir [rapport B.5.1](./lot-5-c-b2-b51-custom-access-token-hook-sandbox-2026-11-12.md). Le principal est intact ; pas de fusion ni Vercel.

# SCHOOLNET — Lot 5.C-B.2 / Étape B.4
## Architecture des preuves Auth durables — Supabase Free
### Audit en lecture seule et plan d'expérimentation du 12 novembre 2026

**STATUT : CONCEPTION ET CONTRÔLES READ-ONLY TERMINÉS. AUCUN HOOK, SQL OU DÉPLOIEMENT.**

### 1. Objet et autorisation

L'utilisateur a approuvé la **conception et les contrôles sans écriture** d'une preuve d'activation familiale durable compatible avec Supabase Free, après les tests Auth fictifs B.3. Cette autorisation **ne couvre pas** de migration, de nouveau hook, de changement des réglages Auth, de création de compte, de génération de lien, d'exécution d'une Edge Function de test ou de déploiement.

La seule écriture de cette étape est **documentaire, sur GitHub**, dans la branche `feature/schoolnet-multi-etablissements`, PR #6 maintenue en brouillon. Ni la sandbox ni le Supabase principal ne doivent recevoir de DDL/DML durant B.4.

**Projets à toujours distinguer :**
- **Sandbox** : `schoolnet-auth-sandbox`, `onqlsvphmrqhelislpry` — tests futurs sous nouveaux GO.
- **Principal** : `schoolnet_2.0`, `anttmbhaphkhmkoqsofd` — aucune opération hors lecture permise.

### 2. Faits observés directement après B.3

| Source / contrôle | Résultat dans la sandbox | Ce qu'il est permis d'en conclure |
| --- | --- | --- |
| `auth.users` | 2 comptes de test fictifs, déjà créés en B.3 | Les deux identités existent ; cela ne prouve pas l'activation familiale |
| `auth.sessions` | 3 sessions pour les 2 comptes, toutes `aal1` | Une session `aal1` peut provenir de différents modes d'authentification |
| `auth.audit_log_entries` | **0 ligne** | Aucune preuve SQL utilisable directement dans cette table |
| `auth_audit_logs` externes, 09:15–09:30 UTC | **9 événements** : `login` 4, `user_signedup` 2, `user_updated_password` 1, `user_recovery_requested` 1, `user_modified` 1 | Événements d'observation de l'Auth, mais pas une preuve d'activation métier |
| `auth_audit_event.traits.provider` | `email` sur 3 événements `login` ; absent sur 1 | `email` n'est **pas** une preuve que la méthode est `password` |
| Structure des métadonnées de `auth_audit_logs` | Clés de type `action`, `user_id`, `request_id`, `provider` ; **pas `authentication_method`** | Le journal externe visible ne distingue pas de façon fiable `password` et `recovery` |
| Registre B.2 `schoolnet_auth_sandbox.invitation_cases` | 0 ligne | Aucun rattachement fictif ni génération enregistrée |
| Registre B.2 `activation_evidence_events` | 0 ligne | Aucune preuve durable enregistrée |
| Migrations sandbox | 1 (B.2) | Aucun SQL B.4 appliqué |
| `supabase_auth_admin` vers schéma privé B.2 | `USAGE=false`, `INSERT=false` pour les preuves | Les tables B.2 ne sont **pas** directement accessibles au producteur d'événements Auth |
| Fonctions de hook custom accessibles dans schémas applicatifs | Aucune trouvée | Aucun hook applicatif de ce type installé en sandbox |
| Edge B.3 déployée | v2, `verify_jwt=true`, code de refus HTTP 410, sans `createUser` ni `generateLink` | La fonction temporaire de création Auth est neutralisée |
| Security Advisor sandbox | INFO `rls_enabled_no_policy` attendu ; WARN `auth_leaked_password_protection` | Fermeture RLS volontaire ; avertissement mots de passe à revoir séparément |

La table `auth.users.encrypted_password` existe, mais **aucun hash ni mot de passe n'a été lu**. Les logs ont été analysés uniquement par comptages, présence de champs et catégories, sans rapatrier d'identité, de jeton ni d'IP.

**État du principal observé en lecture seule** : 10 comptes Auth, 35 migrations, 0 invitation familiale, 0 événement, demande fictive `DEM-3CF7B169BAD9` au statut `new`. La fonction familiale principale reste en version 2 et en lecture seule.

### 3. Découverte déterminante : un hook réellement disponible sur Free

La documentation officielle Supabase distingue :

| Mécanisme | Plan Free | Informations recevables |
| --- | --- | --- |
| **Password Verification Attempt Hook** | **NON** (Team / Enterprise) | `user_id`, `valid` : ne pas en dépendre |
| **Custom Access Token Hook** | **OUI** (Free / Pro) | `user_id`, `claims.session_id`, `authentication_method` fournis **par Supabase Auth** au moment de préparer un jeton |

La documentation du **Custom Access Token Hook** répertorie explicitement les valeurs `password`, `recovery`, `magiclink`, `otp`, `token_refresh`, `invite` et autres. Cette **distinction d'origine serveur** est notre meilleure piste de conception pour la première connexion par mot de passe **sans intercepter ni vérifier manuellement le mot de passe**.

- https://supabase.com/docs/guides/auth/auth-hooks (matrice de disponibilité par plan)
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook (entrée `authentication_method`, `user_id`, `claims.session_id`)
- https://supabase.com/docs/guides/auth/audit-logs (stockage PostgreSQL facultatif et stockage externe)

**RÉSERVE FONDAMENTALE** : le hook intervient **avant** la délivrance du jeton. Il ne suffit **pas**, à lui seul, à prouver qu'une connexion complète a été finalisée. Avant toute validation d'activation, il faudra établir expérimentalement la correspondance durable entre événement enregistré, méthode `password`, émission effective et session Auth réelle. Aucun test d'un tel hook n'a été exécuté dans B.4.

### 4. Architecture envisagée — QUATRE PREUVES DISTINCTES

```text
 [A] Admin valide le dossier réel + l'identité + le destinataire
                    |
                    v
     Registre pour demande + destinataire + génération
                    |
       Lien créé -> prepared   (PAS activated)
                    |
          Envoi externe attesté -> sent_declared
                    |
                    v
 [B] Evénement Auth fiable de changement de mot de passe
     (après cette transmission, même user_id, même génération)
                    |
          password_set_observed
          PAS encore activated
                    |
                    v
 [C] Supabase Auth lance une connexion par mot de passe
     Custom Access Token Hook reçoit :
       user_id + authentication_method=password
       claims.session_id + horodatage serveur
     Seul cet événement est candidat, pas recovery/magiclink/OTP
                    |
                    v
 [D] Vérification post-émission de la session effective
     + correspondance identité/rôle/génération + chronologie
     + preuve [B] indépendante et durable
                    |
                    v
   Transition CAS et audit append-only -> activated
   (seulement après autorisation de tests puis GO production)
```

**A — transmission** : `sent_declared` est une attestation administrative du canal, **pas une preuve que le destinataire a reçu le message**. Son auteur et sa date doivent rester traçables et non falsifiables par le client.

**B — changement de mot de passe** : une preuve **indépendante et d'origine serveur** doit établir le changement *effectif* du secret Auth après `sent_declared_at`. Pistes **non validées** : stockage PostgreSQL autorisé des Auth Audit Logs (`user_updated_password`) avec lecture minimisée et contrôlée ; ou instrumentation strictement limitée et auditée dans une sandbox. Un changement fait par l'administrateur ou pour une génération précédente ne doit **jamais** suffire. Ne pas enregistrer de mot de passe, de hash, de token ni de lien.

**C — méthode de première connexion** : instrumenter **dans la sandbox uniquement**, après nouveau GO, un **Custom Access Token Hook** qui reçoit `authentication_method` de Supabase et relève, pour les seuls comptes de la recette, `password` / `recovery` / `token_refresh` / `magiclink` / `otp`. **Ne pas déduire la méthode du seul `auth.sessions`, du JWT du navigateur, de `SIGNED_IN`, de `aal1` ou du `provider=email` des journaux.** Les événements `token_refresh` ne prouvent aucune nouvelle saisie de mot de passe.

**D — confirmation** : vérifier en lecture de confiance la persistance et la validité d'une session Auth **liée au `session_id` de la preuve [C]**, les horodatages, la génération non révoquée et l'état de l'invitation ; exécuter ensuite une transition atomique **CAS** `sent_declared → activated` avec audit. La preuve de simple *pré-émission du JWT* doit rester en état `pending` jusqu'à corroboration. En cas d'erreur ou de preuve indisponible, conserver `not_confirmed` / `requires_review`.

### 5. Conception de la provenance et des droits — NON IMPLÉMENTÉE

Un futur collecteur `custom_access_token` fonctionnera au sein de l'Auth ; la valeur `authentication_method` ne doit provenir **QUE de l'événement de Supabase Auth**, jamais d'un body HTTP ni d'une propriété `user_metadata` modifiable.

**Option préférée à étudier pour le hook PostgreSQL :** fonction de hook en schéma privé, `SECURITY INVOKER` lorsque possible, paramètres stricts, `search_path` fixé, `EXECUTE` uniquement pour `supabase_auth_admin`, et `REVOKE` pour `PUBLIC`, `anon`, `authenticated`, `service_role` sauf besoin borné et prouvé. Une politique RLS ciblée doit éventuellement permettre le seul `INSERT` des événements observés à `supabase_auth_admin` ; **aucune policy globale** et aucune ouverture REST. Si un schéma privé est invoqué par Auth, vérifier que Supabase permet sa configuration et les droits nécessaires avant de compter sur cette option. La fonction de hook doit renvoyer **`claims` inchangés**, en conservant toutes les claims obligatoires.

Le schéma B.2 **N'EST PAS DIRECTEMENT RÉUTILISABLE en écriture réelle** : `synthetic_only=true`, `proof_verified=false`, `case_status` n'autorise pas `activated`, accès `supabase_auth_admin` fermé, un événement par type/génération, comptes B.3 non enregistrés dans `invitation_cases`. Il devra être **étendu dans une migration sandbox nouvelle, revue et approuvée séparément**. Ne pas supprimer la fermeture B.2 ni substituer les données synthétiques aux événements Auth.

**Schéma logique à concevoir, pas un DDL à exécuter :**

| Champ logique | Raison |
| --- | --- |
| `event_id` | UUID serveur non réutilisable |
| `request_id` + `recipient` + `generation_count` | Liaison à la bonne invitation, indépendamment des autres générations |
| `user_id` | Correspondance au compte Auth (sans e-mail superflu) |
| `event_kind` | `password_changed`, `password_token_observed`, `password_session_confirmed` |
| `auth_method` | Méthode fournie par Supabase Auth, jamais par le client |
| `session_id` | Corrélation à la session Auth (si vérifiée) |
| `source_event_id` | Identifiant d'origine et clé d'idempotence |
| `occurred_at` et `observed_at` | Chronologie source/collecte |
| `source_trust` + `proof_state` | Provenance contrôlée, état `pending`/ `verified`/ `rejected` |

**Pas d'email en clair inutile, IP, user agent, lien, token, hash, password ou `raw_user_meta_data` dans ce registre.** Les événements doivent être append-only, protégés par contraintes anti-doublons et des règles de rétention explicites. Une preuve `password` précoce, seule, n'active personne.

### 6. Points bloquants et risques à tester avant tout SQL

1. **Émission de jeton ≠ connexion réussie :** le Custom Access Token Hook précède l'émission. Vérifier le comportement lors d'erreurs, jeton refusé, session persistée/non persistée et renouvellement.
2. **Appels multiples / concurrence :** le hook peut être appelé pendant la récupération, la connexion puis la rotation de jetons. Les différents `authentication_method` doivent être enregistrés séparément et distingués.
3. **Transactions, performance et disponibilité :** un hook SQL exécuté dans le chemin critique de l'Auth peut ralentir ou interrompre les connexions. Limiter au strict nécessaire, monitorer le temps, préparer la désactivation et le comportement d'erreur ; ne pas intercepter les identifiants ou secrets.
4. **État B.2 fermé :** aucune écriture de preuve réelle n'est autorisée aujourd'hui ; toute ouverture exige un nouveau plan SQL, des politiques RLS minimales et un test de sécurité.
5. **Preuve [B] non disponible :** `auth.audit_log_entries` est vide dans la sandbox ; l'activation du stockage des logs dans PostgreSQL pourrait utiliser davantage de quota Free. Ne pas changer la configuration ou créer de trigger sur `auth.users` dans B.4.
6. **Parcours des utilisateurs :** `ResetPasswordPage.tsx` accepte actuellement `SIGNED_IN` pour afficher le formulaire ; une session de récupération ne prouve pas une première connexion explicite par mot de passe. Un futur parcours `family-invite` devra rester séparé de « Mot de passe oublié ».
7. **Privilèges et preuves falsifiables :** personne ne doit pouvoir écrire `authentication_method=password` depuis le client. Une valeur `source='supabase_auth_audit'` dans une table ou le body HTTP ne constitue pas en soi une signature.
8. **Vie privée :** sécurité et utilité avant volume de journaux. Ne jamais importer de données scolaires réelles dans la sandbox.

### 7. Matrice de recette prospective (PAS EXÉCUTÉE)

| Cas d'essai futur sur sandbox | Attendu |
| --- | --- |
| Login réellement effectué avec `signInWithPassword` | Hook reçoit **`authentication_method=password`** si la documentation correspond au comportement réel |
| Lien recovery consommé avec `verifyOtp` | Méthode `recovery`, **pas** `password` |
| Lien magique et OTP | Méthode distincte, **aucune preuve de saisie du mot de passe** |
| Refresh d'une session précédemment ouverte au mot de passe | `token_refresh`, ne pas compter comme première connexion |
| Token non émis / connexion abandonnée | Pas de preuve finale après contrôle post-émission |
| Mot de passe changé sans autre connexion | `password_set_observed` seulement |
| Connexion par mot de passe sans changement lié à l'invitation | Refus d'activation |
| Compte test A utilisé sur invitation test B | Refus, IDs/générations incohérents |
| Renouvellement d'invitation + vieux événement | Refus de réutilisation |
| Appel du hook par un rôle non autorisé | Refus d'exécution |
| 2 sessions simultanées / appels dupliqués | Un seul événement par identité de source, pas de double activation |
| Erreur de journal / indisponibilité SQL | Login selon politique de disponibilité à définir ; activation **toujours non confirmée** |
| Auth Audit Log PostgreSQL non activé ou source indisponible | Absence de preuve de mot de passe, activation bloquée |
| Vérification de session et preuve de mot de passe complète | Éligibilité de l'activation **à tester**, pas activation automatique avant GO |
| Revenir à l'état initial après test | Hook désactivé, éventuelle migration nettoyée selon procédure approuvée ; principal intact |

### 8. Décision de l'Étape B.4 et séquence des prochains GO

**B.4 — VALIDÉE EN CONCEPTION UNIQUEMENT :** la piste prioritaire est le **Custom Access Token Hook (Free / Pro)** pour constater la méthode Auth côté serveur, avec une preuve indépendante du changement de mot de passe et une corroboration effective de session. Le prototype A.2.2 qui attendait un Password Verification Hook **n'est pas déployable sur Free tel quel** ; il ne faut pas remplacer cette dépendance par un `login` non qualifié.

**GO B.5.1 requis (non accordé) :** définir puis revoir un schéma minimal sandbox et l'installation d'un Custom Access Token Hook en **observation uniquement**, d'abord avec sortie `claims` inchangée ; vérifier privilèges, impact sur la connexion, réversibilité. Aucune activation, aucun rattachement. Le plan devra préciser le coût (offre Free) et la désactivation.

**GO B.5.2 requis (non accordé) :** après validation de B.5.1, tester en sandbox les événements réels `password`, `recovery`, `token_refresh` et la corrélation des sessions, avec comptes fictifs déjà existants ou nouvelles identités expressément autorisées ; définir un producteur d'audit privé et un stockage minimal. Aucun hook, schéma ou compte du principal concerné.

**GO B.5.3 requis (non accordé) :** expérimenter une preuve indépendante et durable du changement de mot de passe, éventuellement via l'audit SQL optionnel, en mesurant les droits et le coût. Ne pas lire un hash. Toute modification de configuration Auth ou SQL aura un GO distinct.

**GO principal puis GO Vercel :** seulement après tests de concurrence, anti-fraude, reprise, impact sur Auth et validation du parcours familial complet en local. PR #6 demeure brouillon et **aucun déploiement au principal ni publication Vercel n'est autorisé**.

### 9. Références

**Documents vérifiés le 12 novembre 2026 :**
- https://supabase.com/docs/guides/auth/auth-hooks
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook
- https://supabase.com/docs/guides/auth/audit-logs
- https://supabase.com/docs/guides/auth/jwt-fields
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/changelog/53230-correlated-logs (10/11/2026, corrélation d'observabilité, non preuve métier)
- `docs/lot-5-c-b2-b3-sandbox-auth-first-login-2026-11-12.md`
- `docs/sql/lot_5_c_b2_b2_SANDBOX_ONLY_private_schema.sql`
- `supabase/functions/_shared/familyActivationEvidence.ts`
- `src/features/auth/pages/ResetPasswordPage.tsx`

**POINT DE REPRISE : B.4 étude / audit terminé et sauvegardé sur GitHub, sans SQL ni déploiement. Demander autorisation B.5.1 avant toute installation de hook sandbox.**
