> **12/11/2026 — Audit A.2.3 de provenance Auth terminé, sans écriture.** Nouveau [rapport A.2.3](./lot-5-c-b2-etape-a2-3-provenance-auth-2026-11-12.md) : projet Supabase **Free**, Password Verification Hook réservé aux offres Team / Enterprise, table \`auth.audit_log_entries\` vide et non lisible directement par \`service_role\`, tandis qu'un journal Auth externe existe sans preuve de méthode « password » vérifiée. Le code A.2.2 en lecture seule et ses 30 tests fictifs restent utiles, mais **ne permettent pas d'activer une invitation réelle**. Première connexion, changements de mot de passe et provenance doivent être testés en environnement isolé, avec autorisation distincte. Pas de migration, hook, compte, invitation, déploiement Supabase/Vercel ou fusion.

> **11/11/2026 — Étape A.2.2 RECETTÉE localement sans écriture.** Validation Super Admin des deux inspections (parent/apprenant) sur demande fictive `DEM-3CF7B169BAD9` : rendu simultané de l'état « preuve serveur indisponible », activation « non confirmée », transmission en attente et décision `new_invitation_possible`. Journaux Edge : 2 `POST 200` à 17:02 UTC. SQL post-recette : 10 comptes Auth, 0 invitations, 0 événements, 35 migrations, demande `new`, 0 résolution. CI Deno **30/30 cas simulés**, lint et build local réussis. Fonction Supabase distante demeure v2 lecture seule ; les nouveaux mécanismes A.2.2 n'ont pas été déployés ni raccordés à des preuves Auth réelles. **Aucun GO pour activer les comptes/liens ou publier Vercel.** Voir [protocole A.2.2](./lot-5-c-b2-etape-a2-2-preuve-activation-2026-11-11.md).

> **11/11/2026 — A.2.2 préparée sur GitHub, sans activation ni écriture.** Contrôle pur des preuves d'activation corrélées (réservation, identité, transmission, événement Auth de mot de passe, hook de vérification positive, login) ; échec par défaut tant qu'aucune source fiable n'est installée. Tests GitHub Deno : **30/30 passés**, lint + build + prébuild + `deno check` réussis. La fonction déployée demeure **v2 lecture seule** ; aucune action `confirm_activation` n'est exposée. Le statut `activated` du registre seul n'est pas une preuve Auth. Détails et limites dans [A.2.2 — preuve d'activation](./lot-5-c-b2-etape-a2-2-preuve-activation-2026-11-11.md). **Tests locaux et contrôle SQL post-recette à effectuer ; PR #6 non fusionnée ; pas de Vercel.**

> **11/11/2026, 16:31 UTC — Validation ciblée A.2.1 (consultation uniquement).** Inspection Parent/Apprenant sur la demande fictive `DEM-3CF7B169BAD9` : nouveaux indicateurs Transmission et Activation visibles côte à côte, suivi A.2 en attente de publication, activation non confirmée, décisions `new_invitation_possible`. Journaux Supabase : deux `POST 200` à 16:30 UTC. Base inchangée : 10 Auth, 0 invitation et événement, 35 migrations, demande `new`, 0 résolution. La fonction Edge distante reste **version 2**, JWT activé ; le code préparatoire dormant `declare_sent` n'a pas été déployé. Aucune opération de transmission, lien ni activation n'a été effectuée. Détails : [recette A.2.1](./lot-5-c-b2-etape-a2-suivi-transmission-activation-2026-11-11.md). Étape A.2.2 à venir, sans écriture.

> **11/11/2026 — Nouvelle phase A.2.1 préparatoire sur GitHub seulement :** suivi consultatif des états de transmission et d'activation, action `declare_sent` dormante et conditionnée à une autorisation future, aucun `confirm_activation` tant qu'une preuve Auth fiable n'existe pas ; écran et API client sans bouton de mutation. GitHub CI lint, build, prébuild et Deno vérifiés (run `43054088371`, succès). Supabase principal conserve l'Edge v2 (pas de code A.2 déployé), JWT actif, 10 Auth/0 invitation/0 événement/35 migrations. Détails : [Étape A.2.1 et protocole local](./lot-5-c-b2-etape-a2-suivi-transmission-activation-2026-11-11.md). **Recette locale utilisateur en attente ; aucune création de compte, invitation ou activation ; aucun Vercel.**

> **11/11/2026 — Recette A.1 validée sans écriture.** Les inspections Parent/Apprenant, dans deux cartes indépendantes sur `localhost:5173`, ont réussi pour `DEM-3CF7B169BAD9` (`new_invitation_possible` pour chacun). Deux appels `POST 200` retrouvés dans Supabase, contrôle Auth=10, registre=0, événements=0, migrations=35, demande `new` sans résolution. Lint et build locaux réussis, avec garde `prebuild`. Edge déployée **v2 inchangée**, aucun lien ou compte. Voir [protocole de validation A.1](./lot-5-c-b2-etape-a1-gardes-et-preflight-2026-11-11.md). **A.2 en attente de développement sans écriture** ; Vercel et activation réelle toujours interdits à ce stade.

> **11 novembre 2026 — Étape A.1 codée, recette locale à suivre :** conformément à l'autorisation de préparer l'activation sans écrire, les garde-fous de future demande/destinataire pilote, un contrôle `prebuild` et un panneau d'inspection distinct Parent/Apprenant ont été enregistrés sur la branche `feature/schoolnet-multi-etablissements`. CI (lint + build) réussie sur `9fa0af5`. **La fonction distante n'a pas été redéployée** (toujours v2 lecture seule) ; aucun compte ni invitation. Détails, contrôle et test pas à pas : [A.1 — gardes et préflight](./lot-5-c-b2-etape-a1-gardes-et-preflight-2026-11-11.md). `prepare`, `resume`, `renew`, `declare_sent` et `confirm_activation` ne sont pas autorisés au stade A.1 ; tout GO sera distinct.

> **11/11/2026 — Plan de reprise pour l'activation réelle (DOCUMENTATION UNIQUEMENT).** Après validation des inspections et des accès 401/403, l'examen de la fonction Edge, de la migration et du parcours de mot de passe a conduit à [un plan d'activation contrôlée détaillé](./lot-5-c-b2-plan-activation-controlee-2026-11-11.md). **NO GO** à la création Auth et aux liens tant que ne sont pas résolus : suivi `sent_declared`/`activated`, parcours dédié de mot de passe, test de redirection en Supabase isolé, idempotence/reprise, contrôles du déclencheur `handle_new_user`, limitation serveur à une demande pilote et GO explicites. Le registre reste vide et l'Edge v2 reste en lecture seule. Ce paragraphe ne modifie ni le schéma ni les permissions.

> **RECETTE D'AUTORISATION CIBLÉE CLÔTURÉE — 11 novembre 2026 à 14:24 UTC.** Dernier scénario : connexion à `localhost:5173` avec le **compte Administrateur d'établissement** `profiles.role=school_admin` et appel `supabase.functions.invoke('schoolnet-family-invitation', {body:{action:'inspect',request_id:'f12a07f3-095e-4a2d-b707-849c250d9915',recipient:'parent'}})`. Capture Chrome : `Rôle testé : school_admin`, `Résultat HTTP : 403`, `TEST VALIDÉ : accès refusé`. Journaux Supabase : `OPTIONS 200` puis **`POST 403` à 14:24:36 UTC**. Scénarios cumulés validés : Super Admin inspection Parent/Apprenant HTTP 200 ; sans Authorization HTTP 401 ; JWT invalide HTTP 401 ; session Parent HTTP 403 ; session school_admin HTTP 403. Vérification après ces essais : **10 comptes Auth, 0 registre d'invitation, 0 événement, 35 migrations ; demande test DEM-3CF7B169BAD9 toujours new, sans résolution**. La fonction est toujours en version 2, `verify_jwt=true`, verrou `READ_ONLY_DEPLOYMENT=true` inchangé. **Seule la phase inspect/authz lecture seule est close**, pas le lot 5.C-B.2 complet : préparer séparément l'activation éventuelle des opérations Auth et invitations avec validations, tests de reprise et nouvelle autorisation explicite. **Aucun déploiement Vercel, aucun nouveau compte, aucune migration, aucun merge.**


> **RECETTE SÉCURITÉ LECTURE SEULE : SCÉNARIOS AUTORISÉS VALIDÉS — 11 novembre 2026, 14:18 UTC.** Le Super Admin a déjà validé les appels `inspect` du parent existant (`reuse_after_verification`) et de la demande fictive `DEM-3CF7B169BAD9` pour parent + apprenant (`new_invitation_possible`). Les deux refus sans authentification et avec JWT invalide ont donné `POST 401` (14:04:57 / 14:05:02 UTC). Test effectué depuis `localhost:5173` avec une **vraie session de rôle `parent`**, via `supabase.functions.invoke('schoolnet-family-invitation',{body:{action:'inspect',request_id:'f12a07f3-095e-4a2d-b707-849c250d9915',recipient:'parent'}})`, sans afficher ni transmettre le jeton : la console rapporte **`Rôle testé : parent`**, **`Résultat HTTP : 403`**, et les journaux Supabase confirment **`OPTIONS 200` puis `POST 403` à 14:18:30 UTC**. Contrôle SQL post-recette : **10** Auth inchangés, **0** invitations, **0** événements familiaux, demande fictive toujours `new`, **0** résolution. **Cette phase de recette en lecture seule est validée pour les scénarios exécutés** ; **les droits d'un rôle `school_admin` ou `teacher` n'ont pas été testés activement**, mais le code exige strictement `profiles.role === 'admin'`. La fonction Edge v2 garde `verify_jwt=true` et `READ_ONLY_DEPLOYMENT=true`. **Aucune permission de création, d'invitation, d'envoi, de fusion ou de déploiement Vercel** ne résulte de cette validation. Les erreurs simultanées du navigateur (canal Realtime `TIMED_OUT`/`CHANNEL_ERROR`, connexion de développement Vite perdue, chargement d'un média) sont observées mais hors périmètre de l'autorisation, à diagnostiquer séparément si elles persistent.

> **Recette négative d'authentification VALIDÉE — 11 novembre 2026, 14:05 UTC.** Depuis PowerShell sur le PC Windows, les appels POST vers `schoolnet-family-invitation` sans `Authorization` et avec `Bearer schoolnet-invalid-jwt-test` ont retourné chacun **HTTP 401**. Un premier blocage Schannel (`CRYPT_E_NO_REVOCATION_CHECK`, HTTP 000) a été contourné sans désactiver la validation TLS avec l'option ciblée curl `--ssl-revoke-best-effort`. Les journaux Supabase confirment deux `POST | 401` aux heures **14:04:57** et **14:05:02 UTC**. Comptes Auth **10**, invitations **0**, événements familiaux **0**, demande fictive `DEM-3CF7B169BAD9` toujours `new`, 0 résolution. **Validé :** refus des appels sans JWT et avec JWT invalide, sans mutation. **Reste à valider :** refus HTTP 403 d'une session valide de rôle `parent`, `teacher` ou `school_admin` sur `inspect` uniquement ; ne pas recopier ni partager les jetons utilisateur. Vercel et les écritures demeurent inactifs.

> **Recette de sécurité en cours — 11/11/2026 (autorisée, lecture seule).** Contrôle technique du code v2 déployé : `verify_jwt=true`, vérification de l'utilisateur via `auth.getUser(jwt)` et rejet HTTP 403 si `profiles.role !== 'admin'` ; refus d'écriture permanent `READ_ONLY_DEPLOYMENT=true`, refus des actions non `inspect` sur `localhost:5173`. Contrôle SQL du projet : les tables `schoolnet_family_invitation_records` et `schoolnet_family_invitation_events` ont `RLS` + `FORCE RLS`, aucun privilège SELECT/INSERT pour `anon` ou `authenticated`, et pas de DELETE pour `service_role`. 35 migrations toujours présentes ; **10** comptes Auth, **0** réservation, **0** événement, test `DEM-3CF7B169BAD9` encore `new` et non finalisé. Les tests HTTP de refus sans JWT, avec JWT invalide et avec session d'un rôle autre que Super Admin **restent à exécuter** ; les revues du code ne remplacent pas les assertions HTTP. Le runner distant actuel ne peut pas joindre directement le domaine Supabase (DNS indisponible), donc les deux premiers tests seront lancés depuis PowerShell sur le PC utilisateur avec des valeurs invalides non sensibles, sans divulgation de jetons réels. Dernier essai Super Admin `inspect` : succès vérifié précédemment. Aucun envoi, création Auth, changement de rôle, SQL DDL, Vercel ou merge `main`.

> **Recette locale COMPLÉMENTAIRE VALIDÉE — 11 novembre 2026, 13:41–13:42 UTC, demande `DEM-3CF7B169BAD9`.** Sur la demande de test (ID `f12a07f3-095e-4a2d-b707-849c250d9915`), le Super Admin a effectué `inspect` pour chacun des deux destinataires : **Parent → `new_invitation_possible`**, **Apprenant → `new_invitation_possible`**. Les deux captures affichent « Inspection confirmée — aucune écriture », et « Aucune invitation enregistrée ». Contrôle indépendant : les journaux Edge de la fonction `schoolnet-family-invitation` comportent des appels `OPTIONS 200` et `POST 200` dans cette période, sans échec de démarrage observé pour ces appels. Contrôle SQL post-recette : **0** ligne dans `schoolnet_family_invitation_records`, **0** dans `schoolnet_family_invitation_events`, **10** comptes Auth (inchangé), **0** résolution de la demande ; son statut demeure `new`. La notification interne de création de demande est toujours unique (**1**). La fonction demeure en v2 et `READ_ONLY_DEPLOYMENT=true`, sans activation d'invitations, de comptes ou de liens. **Validé uniquement : parcours `inspect` Super Admin, parent existant + parent fictif sans compte + apprenant fictif avec e-mail propre.** **Non validé :** refus d'un utilisateur non Super Admin, refus de session absente/invalide, vraie préparation/création de compte, lien d'activation et reprise. Ces étapes nécessitent une recette distincte et, pour les écritures, une autorisation distincte. Aucun déploiement Vercel ou fusion vers `main`. La demande fictive doit rester identifiée comme telle et ne doit pas être finalisée.

> **Recette complémentaire autorisée et préparée — 11 novembre 2026 : apprenant avec e-mail personnel.** Une **seule demande de test** a été créée dans `schoolnet_2.0` sous la référence **`DEM-3CF7B169BAD9`** (id `f12a07f3-095e-4a2d-b707-849c250d9915`, statut `new`, niveau `6e`). Parent et apprenant portent des noms explicitement fictifs (`TEST SCHOOLNET … 5CB2`) et possèdent des e-mails distincts en `@example.test`, domaine de test non destiné à recevoir des courriels. Contrôle après création : **1 demande, 1 notification administrative via trigger existant, 0 réservation familiale, 0 événement familial, 0 dossier finalisé pour cette demande, 10 comptes Auth inchangés**. Aucune invitation, aucun mot de passe, aucun lien, aucun déploiement Vercel. Le test cible uniquement les actions `inspect` de la fonction Edge v2 avec la session Super Admin depuis `localhost:5173` : pour le parent et l'apprenant fictifs, attendre normalement `new_invitation_possible` et `no_write: true` (à confirmer en navigateur). **Ne cliquer ni sur « Finaliser et rattacher » ni sur « Préparer » ; ne pas envoyer de message aux e-mails de test.** Ne pas supprimer la demande tant que la recette n'est pas terminée ; nettoyage éventuel après décision séparée et contrôle des liens/notifications. Le résultat de la recette HTTP reste à renseigner après captures.

> **Recette navigateur VALIDÉE — 11 novembre 2026 à 12:44 UTC (lot 5.C-B.2, scénario Parent existant, lecture seule).** Dans la page `localhost:5173` → Super Administration → Demandes publiques → demande fictive, le bouton **Inspecter le parent** a renvoyé « Inspection confirmée — aucune écriture » : destinataire Parent, décision serveur `reuse_after_verification`, état du registre « aucune invitation enregistrée ». Les journaux Supabase montrent `OPTIONS 200` puis `POST 200` sur la fonction `schoolnet-family-invitation` (version 2). Contrôle SQL de non-écriture après la recette : 0 ligne dans `schoolnet_family_invitation_records`, 0 dans `schoolnet_family_invitation_events`, 10 comptes Auth inchangés. Aucun email de l'enfant dans cette demande, donc le bouton « Inspecter l'apprenant » est désactivé, conformément au périmètre. **Portée de la validation** : ce scénario Parent existant est réussi ; tests de JWT invalide/rôle interdit, de demande avec email personnel Apprenant et de préparation réelle Auth restent à faire séparément sous les autorisations correspondantes. Le recensement SQL à cette date ne révèle aucune demande apprenant active éligible à une inspection via email personnel ; ne créer aucune demande fictive supplémentaire sans GO. Le verrou `READ_ONLY_DEPLOYMENT=true` reste appliqué, aucune fusion `main`, aucun Vercel.

> **Correctif du 11/11/2026 — recette locale 5.C-B.2 :** le premier essai sur `localhost:5173` a renvoyé « Service d'invitation familiale indisponible ». Les journaux Supabase ont identifié `OPTIONS 503` / `BOOT_ERROR` : `Uncaught SyntaxError: Identifier 'profileError' has already been declared`. Dans la fonction, la seconde déclaration au niveau du traitement de reprise a été renommée `linkedProfileError` (commit `4431d7b`). **Version 2 de la seule Edge Function redéployée sur Supabase**, `verify_jwt=true`, double verrou de lecture seule maintenu ; ni nouveau compte, ni migration, ni Vercel. **La réussite de l'appel `inspect` n'est pas encore attestée** : retester le parent depuis le navigateur local connecté en Super Admin, puis inspecter l'apprenant si applicable. 

## Actualisation du 11 novembre 2026 — déploiement technique en lecture seule

**Fonction `schoolnet-family-invitation` déployée sur Supabase `schoolnet_2.0` (version 1, ACTIVE, `verify_jwt=true`).** Ce déploiement était autorisé pour la recette `inspect` uniquement, sans activation des écritures.

- Double verrou : `READ_ONLY_DEPLOYMENT = true` dans la fonction effectivement déployée ; le flag `SCHOOLNET_FAMILY_INVITES_ENABLED` ne peut donc pas activer les écritures même s'il était configuré par erreur.
- Le navigateur `http://localhost:5173` est autorisé pour `inspect` exclusivement ; les autres actions y reçoivent HTTP 403. Les origines Vercel autorisées restent configurées, mais **aucune action d'écriture n'est possible sur ce déploiement**.
- Un panneau « Recette serveur 5.C-B.2 — inspection sans écriture » a été ajouté à `AdminEnrollmentRequestPreflight.tsx` (Parent / Apprenant). Il utilise uniquement la méthode `inspectFamilyInvitation` ; aucun bouton d'écriture n'est raccordé.
- Contrôle après déploiement : **7 Edge Functions, 35 migrations, 0 invitation enregistrée, 0 événement familial, 10 utilisateurs Auth**. Aucune modification de schéma ni de comptes pendant l'intervention.
- Commits GitHub du chantier : `78cef306` (verrou serveur et localhost) et `e51fb5e` (UI locale de recette).
- La fonction a été relue sur Supabase après déploiement : version 1 ACTIVE, `verify_jwt=true`, code contenant les deux verrous. **Les réponses HTTP en navigateur Super Admin ne sont pas encore recettées** ; un déploiement réussi ne remplace pas ce test.
- **GO Vercel non donné** : d'abord `git status --short`, `git fetch origin --prune`, `git switch feature/schoolnet-multi-etablissements`, `git pull --ff-only` seulement si la copie locale est propre, puis `npm ci`, `npm run lint`, `npm run build`, `npm run dev -- --host localhost --port 5173 --strictPort`.
- Test manuel : ouvrir **Super Administration → Demandes publiques → demande fictive**, développer « Recette serveur 5.C-B.2 », cliquer « Inspecter le parent » puis « Inspecter l'apprenant » si e-mail distinct ; constater la décision et « aucune écriture ». Ne pas cliquer sur Finaliser et rattacher.
- Contrôles à effectuer ensuite avec la session Super Admin : JWT présent et valide, refus sans session, refus d'un autre rôle, erreurs CORS et base inchangée. Ne jamais publier les e-mails personnels, tokens JWT ou liens dans les captures.

**Périmètre inchangé :** aucun merge de PR #6 vers `main`, aucune activation de S2/5.D, aucun envoi d'e-mail, aucune activation du service de création Auth. La prochaine étape après la recette locale réclame un GO explicite.

---

# SCHOOLNET 2.0 — Lot 5.C-B.2 : invitations familiales et reprise sécurisée

**État au 11 novembre 2026 : registre SQL appliqué et contrôlé dans Supabase ; Edge Function familiale non déployée, flag d'écriture non activé.**  
**Branche :** `feature/schoolnet-multi-etablissements`, PR #6 (brouillon).  
**Référence :** [Workflow directeur SCHOOLNET V2.2](./WORKFLOW_DIRECTEUR_SCHOOLNET_2_0_2026-11-10.md).

## 1. Objectif fonctionnel

Automatiser le traitement des demandes publiques des apprenants et parents possédant une adresse e-mail personnelle. Réutiliser les comptes existants, créer les comptes manquants **sans mot de passe communiqué à l'administration**, préparer une invitation sûre puis faciliter sa transmission manuelle par le Super Administrateur.

Les classes, cours, LIVE, enseignants et comptes existants demeurent intacts. Les apprenants sans e-mail personnel relèvent de 5.C-B.3 et **ne sont pas invités via l'adresse Auth du parent**.

## 2. Mécanisme serveur conçu

**Fonction distincte :** `supabase/functions/schoolnet-family-invitation/index.ts`. Elle n'attribue jamais `admin` ou `school_admin` et ne modifie aucune appartenance scolaire. La fonction dédiée aux responsables des écoles reste indépendante.

| Action | Rôle et sécurité | Effet prévu |
| --- | --- | --- |
| `inspect` | JWT valide et profil Super Admin ; demande et destinataire lus en base | Lecture seule, indique l'existant et le statut du registre |
| `prepare` | Super Admin, confirmation humaine, note 10–1000 caractères, absence d'un autre compte sur l'e-mail | Réservation unique, création d'un compte personnel, préparation d'un lien |
| `renew` | Compte déjà lié, non activé, confirmation humaine, délai minimal 60 s, limite de cinq liens | Un nouveau lien temporaire, sans nouveau compte |
| `resume` | Compte Auth **déjà lié au registre**, non activé ; état interrompu, note, délai minimal 120 s | Reprise du profil si réellement provisoire et nouveau lien, sans recréation Auth |
| `flag_review` | Opération en cours depuis au moins 120 s et note explicite | Place le dossier en revue, **sans créer ni modifier de compte Auth** |

**Verrou permanent avant autorisation :** `SCHOOLNET_FAMILY_INVITES_ENABLED` n'est pas activé. Toutes les opérations d'écriture sont refusées tant que le serveur n'a pas été configuré explicitement. Les méthodes sont définies dans `src/features/enrollments/lib/adminFamilyInvitationApi.ts`, mais **ne sont reliées à aucun bouton de la fiche publique**.

### Création initiale, par étapes vérifiables

1. Valider le JWT Super Admin et la demande (non refusée, non traitée), puis rechercher l'e-mail via la RPC administrative existante.
2. **Réserver** `(request_id, recipient)` et l'e-mail dans le registre SQL ; toute seconde réservation échoue.
3. Appeler `auth.admin.createUser({ email, email_confirm: false })` **sans mot de passe**. L'unicité Auth protège aussi des inscriptions concurrentes externes.
4. Sauvegarder immédiatement `user_id` et le statut `auth_created`. Si cette étape échoue, **ne pas supprimer ni recréer aveuglément** le compte.
5. Contrôler le profil provisoire issu du trigger Auth ; lui attribuer uniquement le rôle `parent` ou `student` et le nom validé, puis indiquer `profile_ready`.
6. Générer un lien `auth.admin.generateLink({ type: "recovery" })` pour le **compte déjà créé**, sans déclencher d'e-mail.
7. Marquer `prepared` avec le compteur, puis retourner le lien **une seule fois** dans la réponse Admin. Les liens et jetons ne sont jamais conservés dans SQL, GitHub ou les journaux.

Cette séparation évite de confondre une création Auth et la génération de lien d'invitation et réduit le risque de s'approprier par erreur un compte nouvellement créé par quelqu'un d'autre.

**Limite explicite :** le comportement d'activation de `generateLink(recovery)` sur un compte tout juste créé et non confirmé devra être vérifié **en environnement autorisé**. La vérification SQL et la compilation ne prouvent pas à elles seules que l'activation e-mail fonctionne.

## 3. Registre SQL et historique d'audit

**Migration officielle APPLIQUÉE :** [20261111101351_schoolnet_family_invitation_registry.sql](../supabase/migrations/20261111101351_schoolnet_family_invitation_registry.sql).  
**Brouillon SQL historique :** [registre initial et étude](./sql/lot_5_c_b2_family_invitation_registry_DRAFT.sql).

**Script de recette reproductible :** [tests SQL avec ROLLBACK](./sql/lot_5_c_b2_family_invitation_registry_TEST_ROLLBACK.sql).

Tables proposées : `public.schoolnet_family_invitation_records` et `public.schoolnet_family_invitation_events`.

| Mesure | Garantie prévue |
| --- | --- |
| Clé primaire `(request_id, recipient)` | Un seul traitement par destinataire de la demande |
| Index unique `lower(email)` | Pas de double préparation du même e-mail dans deux demandes |
| Index unique sur `user_id` non NULL | Un compte Auth n'est pas réservé dans deux dossiers différents |
| RLS + FORCE RLS et privilèges SQL | Aucun accès direct par `anon` ni `authenticated`; `service_role` limité à SELECT/INSERT/UPDATE sur le registre |
| Événements append-only | Journal des transitions, acteur, compteur et code d'erreur, **sans lien ni mot de passe** |
| Trigger de transitions | Interdit les reculs de statut non autorisés, le changement d'e-mail ou de compte Auth lié |
| Revue des interruptions | `requires_review` bloque les tentatives de création et impose un examen |
| Générations et temps | Compteur 0 à 5 et temporisations serveur |

### Transitions d'état

```text
preparing → auth_created → profile_ready → prepared → sent_declared → activated
     └────────┬─────────────┬───────────────┬───────────────┐
              v             v               v               v
        requires_review ← renewing ← prepared / sent_declared
              |
              └─(Auth lié et vérifié, décision humaine)→ renewing → prepared
```

**Précision :** l'état `renewing` ne peut pas être repris simultanément par une deuxième opération. S'il demeure bloqué, l'administrateur doit d'abord demander `flag_review` après le délai de sécurité. Une entrée `requires_review` **sans `user_id` ne peut jamais créer automatiquement un deuxième compte**.

## 4. Matrice de reprise après interruption

| Incident | Situation conservée | Action sûre |
| --- | --- | --- |
| Double clic sur « Préparer » | Réservation déjà présente | Refuser la deuxième création et consulter `inspect` |
| Création Auth refusée ou timeout, aucun identifiant retourné | `requires_review`, sans `user_id` | **Examen humain de la base Auth** avant toute reprise. Aucun nouvel essai automatique |
| Compte Auth créé et son ID sauvegardé, profil non préparé | `auth_created` ou `requires_review` avec `user_id` | `resume` après contrôle de l'ID, de l'e-mail, du rôle et du délai |
| Profil prêt, génération de lien interrompue | `profile_ready` ou `requires_review` avec `user_id` | Générer un **nouveau** lien, ne pas retrouver ni réutiliser l'ancien jeton |
| Lien préparé mais perdu ou expiré | `prepared` avec `user_id` | `renew` après 60 s, sans créer un compte |
| Crash durant `renewing` | Statut de traitement réservé | `flag_review` après 120 s ; ensuite reprise explicite après contrôles |
| E-mail appartenant déjà à un autre rôle | Compte existant | Bloquer la création et toute promotion automatique |
| Compte actif, adresse modifiée, connexion déjà effectuée ou e-mail confirmé | Compte Auth existant | Refuser `resume`/`renew` ; utiliser un parcours normal de récupération de compte |
| Deux demandes simultanées avec même e-mail ou même compte | Collision interdite par les index | Un seul traitement réservé ; l'autre passe en vérification |

**Important :** les actions `resume`/`renew` sont codées mais **pas encore testées sur Auth réel**. La matrice définit les comportements à démontrer en recette.

## 5. Recette SQL réellement exécutée le 11 novembre 2026

Méthode : SQL exact du registre + script de tests exécutés dans **une même transaction `BEGIN ... ROLLBACK`** sur le projet Supabase SCHOOLNET existant. Aucun `Auth.admin` n'a été appelé pendant ces vérifications.

**Résultats des assertions :**

- Blocage des doublons par demande, destinataire, e-mail et compte Auth lié.
- Rejet de `prepared` sans compte Auth.
- Rejet d'une reprise sans identifiant de compte conservé.
- Rejet du changement d'e-mail lié, des statuts rétrogrades et du compteur décroissant.
- Transitions autorisées `preparing → auth_created → profile_ready → prepared`, puis renouvellement et déclaration d'envoi.
- Interdiction d'acquérir deux fois le verrou `renewing`.
- Contrôle de l'historique : **9 événements pour 9 écritures du scénario**.
- Permissions : les utilisateurs anonymes et authentifiés ne lisent pas le registre ; `service_role` ne possède pas DELETE ; les événements ne sont pas modifiables.
- Deux tables protégées par RLS et FORCE RLS.

**Contrôle avant application, après ROLLBACK :** les deux tables de test étaient absentes de Supabase ; **34 migrations appliquées, nombre inchangé à cet instant**. La migration a ensuite été autorisée et appliquée (voir § 5.1).

**Un premier test a détecté des privilèges DELETE accordés par défaut à `service_role`** : le brouillon les révoque explicitement. Un second contrôle a testé la vraie unicité des comptes et des transitions. Les assertions sont enregistrées sur GitHub pour la recette suivante.

### 5.1 Application durable approuvée et vérifiée — 11 novembre 2026

L'utilisateur a explicitement autorisé **uniquement** la création du registre et de son historique dans Supabase. La migration ciblée a été exécutée avec l'action `apply_migration` sur le projet `schoolnet_2.0`, qui a enregistré la version **`20261111101351`** dans son historique.

**Résultats du contrôle après application :**
- **35 migrations appliquées** (contre 34 avant l'opération), avec une seule nouvelle entrée : `schoolnet_family_invitation_registry`.
- Tables **`public.schoolnet_family_invitation_records`** et **`public.schoolnet_family_invitation_events`** présentes et vides (**0** réservation, **0** événement).
- RLS et `FORCE ROW LEVEL SECURITY` activés sur les deux tables.
- Deux déclencheurs sur le registre : contrôle des transitions et ajout à l'historique.
- Aucune permission directe de lecture pour `anon` et `authenticated` ; rôle `service_role` limité à `SELECT/INSERT/UPDATE` sur le registre ; `DELETE` interdit ; historique non modifiable par ce rôle.
- Analyse Supabase Advisors : les deux tables apparaissent en **INFO** « RLS Enabled No Policy » ; c'est volontaire : elles n'ont aucune politique ouverte aux utilisateurs ordinaires, le service privilégié restant l'unique interface autorisée.
- Aucun compte Auth ou lien d'activation créé ; aucune fonction Edge déployée et aucun flag d'activation changé.

**Trace GitHub :** [migration appliquée, version exacte de Supabase](../supabase/migrations/20261111101351_schoolnet_family_invitation_registry.sql).

**Attention aux autres migrations en attente :** ne pas lancer `supabase db push` globalement ; la branche contient des migrations 5.D, S2 et de sécurité indépendantes non toutes autorisées. Toute nouvelle application doit faire l'objet d'un périmètre ciblé et d'une validation distincte.

## 6. Ce qui reste avant une activation durable

1. **Réalisé :** migration SQL familiale ciblée appliquée après autorisation, version `20261111101351`, sauvegardée sous `supabase/migrations/`. **Aucune migration 5.D ni S2 en attente n'a été appliquée.**
2. Après application autorisée du registre : déployer **la seule** Edge Function dédiée, avec le flag d'écriture encore **désactivé** ; vérifier JWT, CORS et les scénarios `inspect`.
3. Sur environnement d'essai ou comptes fictifs explicitement autorisés : activer temporairement les écritures sous supervision, tester une invitation Parent ou Apprenant e-mail propre, puis deux appels simultanés et des pannes simulées.
4. Vérifier effectivement le lien de récupération, la première définition de mot de passe, la session, le rôle `parent`/`student` et l'absence d'accès aux dossiers d'autres familles.
5. Compléter le suivi `sent_declared`, l'activation réelle et les boutons UI ; conserver l'envoi manuel de l'e-mail par le Super Admin.
6. Revenir en lecture seule si les tests Auth ou l'isolation des données échouent. Les codes `flag_review`, `resume`, `renew` ne sont **pas une preuve d'une recette utilisateur réalisée**.

**Redirections :** la fonction n'accepte que les destinations HTTPS explicitement autorisées. La Preview SCHOOLNET doit être au bon SHA et son URL déclarée dans Supabase Auth. `localhost:5173` est un navigateur local qui peut malgré tout utiliser la base distante ; aucune activation réelle n'est prévue sur ce domaine avant approbation technique.

**Après approbation explicite, UNE migration SQL a été appliquée et archivée dans GitHub.** Aucune Edge Function n'a été déployée, aucune clé de production n'a été modifiée, aucun compte ni e-mail n'a été créé par cette intervention.

## 7. Prochaine décision

**Prochaine autorisation à solliciter :** déploiement ciblé de la seule Edge Function `schoolnet-family-invitation`, avec `SCHOOLNET_FAMILY_INVITES_ENABLED` non activé, pour une recette de lecture seule (`inspect`). Aucun test de création Auth avant validation séparée.

**Ne pas fusionner vers `main`, pousser toutes les migrations ou activer les créations de comptes par anticipation.**
