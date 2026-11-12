> **12/11/2026 — phase B.2 autorisée et recettée dans le projet sandbox créé en B.1.** Deux tables privées dans `schoolnet_auth_sandbox`, RLS FORCÉE, accès direct refusé, migrations du principal inchangées. Migration sandbox `20261112085040_schoolnet_auth_sandbox_b2_private_evidence`, 9 scénarios SQL **validés et annulés par ROLLBACK**, aucun compte Auth, dossier ou événement fictif restant. Un avis INFO de Security Advisor `rls_enabled_no_policy` est **volontaire** : tables non exposées. [Rapport complet B.2](./lot-5-c-b2-b2-sandbox-sql-securite-2026-11-12.md). La préparation B.0 et la création B.1 n'accordent toujours aucun GO automatique à B.3.

> **12/11/2026 — Phase B.1 créée avec autorisation distincte :** nouveau projet Free `schoolnet-auth-sandbox` **`onqlsvphmrqhelislpry`** en région `eu-west-1`, devis 0 USD/mois, statut `ACTIVE_HEALTHY`. Vérification de la sandbox : 0 utilisateur Auth, 0 table métier `public`, 0 fonction Edge et aucun historique de migration SCHOOLNET. Deux projets actifs sont maintenant présents, principal `anttmbhaphkhmkoqsofd` intact (10 comptes, 35 migrations). **La phase B.0 a bien été suivie de B.1 sous autorisation explicite** ; B.2, B.3 et B.4 restent non autorisées. Rapport détaillé : [B.1 — création et isolation](./lot-5-c-b2-b1-sandbox-cree-2026-11-12.md).

# SCHOOLNET — Lot 5.C-B.2 / Phase B.0
## Préparation de l'environnement Auth isolé — 12 novembre 2026

**ÉTAT : PRÉPARATION DOCUMENTAIRE SEULEMENT — AUCUN PROJET CRÉÉ — AUCUN COÛT ENGAGÉ.**

### 1. Autorisation et limites

L'utilisateur a autorisé la **préparation** d'un environnement de test Supabase isolé, **sans création de projet ni engagement financier avant une validation distincte**. Les actions effectuées durant B.0 sont limitées à la consultation de l'offre, des ressources et de la documentation, puis à la sauvegarde de ce protocole sur GitHub.

**Interdictions jusqu'à un nouveau GO explicite :** appeler `create_project` ou `create_branch`, activer un abonnement/add-on/SMTP, installer des hooks, exécuter une migration ou un SQL mutateur, créer un compte Auth, générer/envoyer un lien, changer un mot de passe, publier l'Edge Function sur le projet principal, fusionner la PR #6, publier Vercel.

### 2. Vérifications effectuées en direct auprès de Supabase (12/11/2026)

| Contrôle | Résultat |
|---|---|
| Organisation | `schoolnet 2.0` — ID `gwnzwpkeerivryptjepp` |
| Offre | `free` / `tier_free` |
| Projets visibles pour le compte | **1** |
| Projet rattaché à cette organisation | `schoolnet_2.0` — ID `anttmbhaphkhmkoqsofd` — région `eu-west-1` — `ACTIVE_HEALTHY` |
| Quota documentaire Free | **2 projets Free actifs** maximum, toutes organisations où le compte est Owner/Admin confondues. Les projets en pause ne comptent pas. |
| Estimation officielle pour **un nouveau projet** dans cette organisation | **0 USD/mois** (`get_cost(type=project)`, `recurrence=monthly`, `amount=0`) |
| Estimation officielle pour **une branche** | `get_cost(type=branch)` : **0,01344 USD/heure** ; **ne pas créer de branche** (inadaptée au budget 0 souhaité) |
| Nouveau projet et quota | Sur la base de la liste visible, il reste **une place Free active**. Revérifier cette capacité et le devis au moment d'un éventuel GO. |
| E-mails Auth hébergés | Sans SMTP personnalisé, l'outil de messagerie intégré n'envoie qu'aux adresses **préautorisées de l'équipe** ; ne pas utiliser `@example.test` comme destinataire hébergé. |
| Pause Free | Le projet de test peut être automatiquement mis en pause après environ **7 jours de faible activité** ; prévoir une reprise manuelle au besoin. |

Le tarif 0 concerne le projet Free de base dans l'organisation actuellement connectée, **pas une garantie absolue** : aucun add-on/upgrade/service payant ne doit être accepté ; vérifier toute confirmation financière à l'écran lors de la future création.

Références :
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/billing-faq
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/auth/testing-auth-flows
- https://supabase.com/docs/guides/auth/auth-hooks

### 3. Choix recommandé : isolation à deux niveaux

**Niveau local, à activer avec autorisation séparée si des changements sur le PC sont requis :** exécuter Supabase localement via **CLI + Docker** ; e-mails capturés dans **Mailpit**, sans envoi externe ni consommation du quota Free. Tester le parcours récupération -> modification du mot de passe -> déconnexion -> connexion. Ne pas importer de vrais utilisateurs ni les secrets du serveur principal. Cette option valide le parcours et les erreurs d'interface, mais ne remplace **pas** les essais du service Supabase hébergé.

**Niveau cloud (après GO explicite) :** créer **un second projet Free autonome**, proposé sous le nom `schoolnet-auth-sandbox`, dans l'organisation existante `schoolnet 2.0`, région **eu-west-1** pour cohérence avec SCHOOLNET principal. Une nouvelle URL Supabase, un nouvel ID, une base, des comptes Auth, des clés de service et une configuration d'e-mails **exclusivement sandbox**. Pas de branche de prévisualisation payante et pas de lien automatisé avec `main` ou Vercel.

**Le choix d'utiliser le cloud ne vaut pas autorisation de toucher aux données :** la création du projet (B.1), le premier DDL contrôlé (B.2), et les essais Auth impliquant des comptes et liens (B.3) sont des GO distincts.

### 4. Garde-fous d'isolation à imposer dès B.1

1. Enregistrer un **ID sandbox distinct** de `anttmbhaphkhmkoqsofd`; refuser toute opération de test si la cible est le projet principal ou si les variables d'environnement ne correspondent pas au nouveau projet.
2. Ne **jamais** copier les 10 comptes réels du projet principal, son contenu scolaire, ses objets Storage, ses e-mails, ses secrets ou ses clés de rôle serveur.
3. N'utiliser que des identités et classes fictives ; aucune notification ou e-mail envoyé aux familles réelles. Pour le cloud, destinataires réels contrôlés et préautorisés ; pour les adresses fictives utiliser **Mailpit local**, non le SMTP hébergé.
4. Séparer les variables sandbox et les variables de SCHOOLNET principal : aucun écrasement de `.env.local`, de la configuration GitHub Actions ou Vercel. Ne jamais committer de secret ou le partager en capture.
5. Déployer la **structure minimale de test uniquement dans la sandbox**, pas l'ensemble des 35 migrations sans audit préalable. Schémas privés, RLS et privilèges stricts ; passer le Security Advisor avant les tests d'écriture.
6. Interdire toute exécution d'un `supabase db push`, d'une migration, d'un `supabase link` ou d'une opération Auth admin sans avoir confirmé la cible. Lire `supabase --help` / `supabase <commande> --help` pour vérifier les options courantes.
7. Maintenir le code principal `READ_ONLY_DEPLOYMENT=true` ; aucune action `declare_sent` ni `confirm_activation` active sur le projet SCHOOLNET principal.
8. Conserver un journal de chaque test (date, projet, action, résultat, absence de secrets). Tout test qui révèle une preuve insuffisante reste `not_confirmed` / `requires_review`.

### 5. Questions de faisabilité à résoudre dans le projet isolé

**Supabase Free :** le Password Verification Attempt Hook est réservé Team/Enterprise, et ne constitue pas une option disponible. Le prototype A.2.2 (30 tests Deno de données simulées) n'est donc **pas directement exploitable pour une activation réelle** sur Free.

Établir une méthode vérifiable, sans contournement :
- **Changement de mot de passe :** trouver une source réellement produite par Auth et protégée côté serveur, après la déclaration d'envoi, associée au bon utilisateur et à la bonne génération d'invitation. Le contenu `auth.audit_log_entries` du projet principal est actuellement vide et `service_role` ne peut pas le lire.
- **Connexion par mot de passe :** identifier une preuve distinguant explicitement `signInWithPassword` d'une session recovery, OTP ou magic link ; un simple `SIGNED_IN`, une session, `last_sign_in_at`, un JWT ou le libellé audit `login` ne suffisent pas.
- **Récupération de mot de passe :** contrôler le parcours actuel `ResetPasswordPage.tsx` qui accepte aussi `SIGNED_IN` pour afficher le formulaire. Isoler un parcours `family-invite` sans casser « Mot de passe oublié ».
- **Traçabilité :** journal privé append-only des événements de preuve, aucun mot de passe, hash, lien recovery, JWT ni refresh token stocké. Source validée à la collecte, horodatages et ID de génération contrôlés côté serveur. CAS/idempotence.
- **Incertitude :** si une source de connexion avec mot de passe suffisamment fiable n'existe pas sur l'offre Free, **ne pas activer automatiquement** ; conserver « mot de passe enregistré / première connexion non vérifiée » et demander un contrôle administratif sécurisé.

### 6. Matrice de recette B.2/B.3 (PAS ENCORE EXÉCUTÉE)

| Scénario | Attendu |
| --- | --- |
| Registre inexistant | Aucune activation |
| Lien préparé sans envoi déclaré | Aucune activation |
| Envoi déclaré, lien non ouvert | Aucune activation |
| Ouverture du lien recovery sans définition de mot de passe | Aucune activation |
| Session OTP/magic link | Pas de preuve d'une connexion par mot de passe |
| `updateUser({password})` côté navigateur uniquement | Pas de preuve serveur suffisante à elle seule |
| Mot de passe changé puis aucune connexion explicitement attestée | État intermédiaire |
| Connexion password prouvée, mais sans changement lié à l'invitation | Refus |
| Utilisateur, rôle, e-mail ou génération différents | Refus |
| Horodatages inversés ou événement réutilisé | Refus |
| Double confirmation simultanée | Une seule transition, audit non dupliqué |
| Journaux manquants, droits insuffisants, source ambiguë | Fail-closed + revue humaine |
| Preuve complète issue d'un serveur de confiance | Autorisation de transition **uniquement** après accord spécifique et revue CAS/audit |
| Vérification depuis Parent/school_admin ou sans session admin | 401/403, aucune écriture |

### 7. Séquence d'approbation et de recette

- **B.0 — aujourd'hui :** vérifier coût, quotas et contraintes. Préparer/sauvegarder ce document sur GitHub. **Ne créer aucun projet.**
- **B.1 — GO requis :** obtenir l'autorisation explicite de créer `schoolnet-auth-sandbox` à **0 $/mois** (sans add-ons), dans `schoolnet 2.0`, région `eu-west-1`. Recontrôler le devis et la capacité **immédiatement avant** création ; interrompre si le tarif diffère. Après création, effectuer **uniquement des vérifications sans écriture** d'identité de projet et d'isolation.
- **B.2 — GO distinct :** écrire des schémas minimaux de recette dans la sandbox uniquement (ou démarrer les tests locaux Docker/Mailpit séparément), après validation sécurité et plan de retour arrière.
- **B.3 — GO distinct :** créer des comptes fictifs, générer des liens et tester la première connexion, exclusivement dans la sandbox. Aucun vrai destinataire SCHOOLNET.
- **B.4 — GO distinct :** étudier une intégration au produit, une recette locale puis Vercel séparément. Ne pas réutiliser des accès sandbox côté production.

### 8. Contrôles d'état et reprise

État du projet principal à la dernière validation A.2.3 : `schoolnet_2.0`, `anttmbhaphkhmkoqsofd`, **35 migrations, 10 Auth, 0 invitations familiales et 0 événements**. La fonction `schoolnet-family-invitation` déployée reste **version 2 ACTIVE**, `verify_jwt=true` et `READ_ONLY_DEPLOYMENT=true`.

Dépôt : `ramon77777/schoolnet`, branche `feature/schoolnet-multi-etablissements`, **PR #6 en brouillon**, sans fusion. Tous les livrables de B.0 sont documentaires. **Le prochain geste à faire confirmer est le GO de création du second projet Free B.1 ; aucune permission d'écriture n'en découle implicitement.**
