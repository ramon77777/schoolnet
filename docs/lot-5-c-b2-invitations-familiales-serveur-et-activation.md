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
