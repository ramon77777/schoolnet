# SCHOOLNET — Lot 5D-K | Auth, sessions Parent, RLS et Storage sur une véritable pile Supabase locale isolée

**Date :** 19 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**  
**Recette CI :** [GitHub Actions #44493115080](https://github.com/ramon77777/schoolnet/actions/runs/44493115080) — **10/10 jobs SUCCESS** ; **21/21 tests d'intégration Supabase réelle locale** + **20/20 tests contractuels hors réseau**.  
**Recette locale K :** **en attente de l'utilisateur**. Lots A–J déjà **199/199 validés** ; après K, objectif A–K **219/219**. Les 10 tests Parent historiques 5.C sont séparés.  
**Garde principal :** aucune modification Supabase hébergée, aucune fonction Edge déployée, aucun SQL 5D installé, aucune fusion de `main` et aucune publication Vercel.

## 1. Pourquoi une vraie pile locale plutôt que le sandbox hébergé

Deux projets Supabase distincts existent :

- `schoolnet_2.0` : **principal**, strictement en lecture seule,
  avec ses migrations et dossiers scolaires ; **aucune écriture**.
- `schoolnet-auth-sandbox` : sandbox hébergé préexistant,
  déjà utilisé pour d'autres tests d'authentification.
  L'audit du **catalogue et des compteurs seulement** a révélé
  des comptes et sessions fictifs existants, **aucun bucket Storage**
  et l'absence des tables d'inscriptions annuelles attendues.
  **Aucune écriture, création de bucket, compte ou changement
  de policy n'y a été effectuée** au Lot K.

Pour préserver ces travaux, le Lot K démarre une **nouvelle pile
Supabase complète mais minimale**, par
`supabase init` puis `supabase start` dans un
dossier temporaire **extérieur au dépôt** de GitHub Actions.
Elle utilise les **vraies API locales** Auth (GoTrue),
PostgREST / PostgreSQL et Supabase Storage, sur
`127.0.0.1:54321`, avec sa propre base
`postgres` sur `127.0.0.1:54322`.

La CI installe `supabase/setup-cli@v3` avec CLI
**3.0.0 épinglée** pour tenir compte du changement
de comportement Supabase CLI v3 de novembre 2026.
Aucune liaison à un projet hébergé, aucun jeton
d'administration cloud et **aucune migration du dépôt**
ne sont utilisés. La pile et ses données fictives
sont détruites avec `supabase stop --no-backup`.

Références :
[Développement local Supabase](https://supabase.com/docs/guides/local-development),
[Tester les parcours Auth](https://supabase.com/docs/guides/auth/testing-auth-flows),
[Supabase CLI v3](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3),
[Contrôle d'accès Storage](https://supabase.com/docs/guides/storage/security/access-control).

## 2. Livrables sur la branche uniquement

### 2.1 Fixture SQL locale — jamais une migration

`scripts/lot5d/5dk_local_supabase_real_api_fixture.sql`

Elle prépare uniquement dans la nouvelle base **jetable** :
`profiles`, `parent_links`, `school_years`, `classes`,
`student_enrollments` et `student_enrollment_documents`,
plus leurs rôles et leurs règles RLS essentielles.
Les politiques `storage.objects` sont créées
uniquement dans le Postgres local à un vrai service Storage.

Les protections préalables requièrent :
base `postgres`, réseau privé du conteneur Docker,
`application_name=schoolnet_5dk_local_ci`,
version PostgreSQL compatible, et **absence de table
SCHOOLNET préexistante**. Le workflow vérifie
indépendamment l'URL API, l'URL PostgreSQL et
l'absence de variables de connexion hébergées.

**Important :** cette fixture est plus proche du parcours
réel qu'une simulation d'objets SQL, mais elle
**ne reproduit pas les 43 migrations**, la totalité des
RPC, triggers, droits de table, politiques Storage,
hooks Auth et parcours publics de la base principale.
Ne pas l'utiliser pour valider une migration de production.

### 2.2 Intégration réelle sur API locales

`scripts/test-schoolnet-lot5d-k-real-supabase.mjs`

Le script refuse avant tout appel une URL ou connexion
autre que les ports locaux fixes `127.0.0.1:54321`
et `127.0.0.1:54322`, ainsi que les variables
susceptibles d'indiquer un projet hébergé.

Il crée **cinq comptes entièrement fictifs via la vraie
API Supabase Auth Admin locale** : deux Parents distincts,
deux Élèves, un Admin. Le mot de passe n'est utilisé
que dans cette instance éphémère et aucune clé
personnelle ou utilisateur réel n'est importé.

Il construit deux années (`2025-2026` ancienne,
`2026-2027` courante fictive) avec des
inscriptions distinctes. Il crée **deux vrais buckets
privés via l'API Storage locale**, un pour les
justificatifs et un pour la rétention serveur.

### 2.3 Tests contractuels accessibles sur Windows

`scripts/test-schoolnet-lot5d-k-contract.mjs`

`npm run qa:lot5d:k` exécute **20 tests hors réseau**
vérifiant les préconditions d'isolement, la
séparation des droits, la lecture Parent, le
traitement des sessions, la confidentialité Storage
et l'interdiction de toute opération cloud.

`npm run qa:lot5d:k:integration` exécute
**21 tests d'intégration** mais **nécessite la pile
Supabase locale déjà démarrée**, ses clés locales
et PostgreSQL : **ne pas lancer cette commande
isolément ni contre un serveur hébergé**.
La CI s'en charge automatiquement.

## 3. Résultats exacts de l'intégration Supabase

[Run #44493115080](https://github.com/ramon77777/schoolnet/actions/runs/44493115080) :
**10 jobs sur 10 SUCCESS**.

| Famille de tests | Parcours réels confirmés |
| --- | --- |
| K01–K06 | API GoTrue et Storage répondent ; 5 utilisateurs fictifs créés ; `signInWithPassword` émet de vraies sessions ; `auth.getUser` valide les jetons ; `session_id` correspond à `auth.sessions`. |
| K07–K11 | Les deux Parents ne voient que leurs propres `parent_links` ; le navigateur `authenticated` ne peut pas lire directement `student_enrollments` (absence de `GRANT SELECT`) ; le cœur serveur du Lot I lit la classe de l'année active sans mélanger familles ou années. |
| K12 | Une modification de `user_metadata` par un Parent ne change pas son rôle vérifié en base. |
| K13–K18 | Deux vrais buckets privés sont créés ; l'Admin peut déposer/télécharger un document source, le Parent ne peut ni déposer ni lire ; une tentative de suppression Admin reste sans effet grâce à RLS ; la métadonnée demeure ; la copie privée serveur est relue, vérifiée par taille et empreinte SHA-256, non visible par l'Admin client. |
| K19–K21 | `auth.signOut` supprime la session du Parent A dans `auth.sessions` tout en conservant la session du Parent B ; la vérification privée de présence de session bloque la session révoquée ; source et métadonnées restent intactes. |

**21/21 tests d'intégration réussis**, sans échec.
**20/20 tests contractuels hors réseau réussis.**
Les **neuf jobs précédents** (Lots A–J,
PostgreSQL fictif, lint, Vite et vérification Edge)
restent verts : **10/10 jobs CI au total**.

Le premier lancement avait signalé un garde SQL
trop strict, car PostgreSQL dans Docker voit une
adresse privée du réseau de conteneurs plutôt que
`127.0.0.1`. La correction impose **la cible locale
vérifiée dans le workflow** et un `application_name`
de test explicite. Le run cité ci-dessus est
**la version corrigée et entièrement réussie**.

## 4. Ce que ces résultats ne prouvent PAS

- **Pas de test contre les données réelles** :
  aucune session ou inscription du projet principal
  n'a été lue par cette nouvelle intégration,
  aucun fichier réel n'a été copié ou supprimé.
- **Pas de preuve de parité complète du schéma** :
  la fixture est minimale, et les RPC/archives
  5D-A à I restent en proposition `SANDBOX_ONLY`
  ou seulement en fixture PostgreSQL 17.
- **Pas d'Edge Parent I déployée** : le test réutilise
  son cœur de sélection annuel côté Node,
  mais ne met pas en service le véritable endpoint
  `schoolnet-parent-current-class` (toujours OFF).
- **Pas de contrôle de session révoquée encore
  intégré au endpoint réel** : le test démontre
  que la vérification de présence dans `auth.sessions`
  est faisable et nécessaire, pas qu'elle est
  implémentée dans l'Edge réelle.
- **Pas de rate-limit persistant réel** :
  seule la simulation du Lot J couvre ce contrat.
- **Pas de suppression documentaire métier** :
  les droits Admin clients sont volontairement
  restrictifs ; la sauvegarde a été effectuée
  seulement sur Storage local éphémère ; aucun
  audit de rétention durable ni mécanisme complet
  de restauration/compensation n'a été installé.
- **Pas de résolution du conflit métier de
  2026–2027** : la vraie année cible contient
  déjà un dossier actif d'un autre Élève et
  aucune bascule réelle n'est autorisée.

## 5. Prochaine séquence, après GO distinct

1. Construire dans une fonction privée le
   contrôle de session Auth réellement vérifiée
   (`auth.sessions` via accès à privilèges
   minimaux) et un quota persistant.
2. Relier le frontend Parent au seul service
   autorisé, une fois la fonction sécurisée
   et le contrat de confidentialité revus.
3. Concevoir la rétention documentaire serveur
   durable : emplacement privé, validation de
   copie SHA-256, audit transactionnel,
   idempotence, restauration et résolution
   des demandes en attente.
4. Réconcilier les politiques, fonctions et
   migrations **réelles**, et qualifier le
   dossier de 2026–2027 sur décision métier.
5. Obtenir des accords **séparés** pour toute
   migration du principal, déploiement Edge,
   fusion `main` et publication Vercel.

## 6. Recette locale K — à faire

Depuis PowerShell, dans `D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118

npm run qa:lot5d:k
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build

git status --short
```

**Attendu : 20/20 tests K hors réseau, 10/10
tests historiques Parent en supplément, lint zéro
erreur (warning React Hook préexistant),
build Vite réussi et état local non suivi inchangé.**

**Cumul local déjà validé A–J : 199/199**.
Après validation des 20 tests K :
**A–K 219/219**, sans double compter les 10
tests Parent ni les 21 tests d'intégration
de la CI.

**Interdictions maintenues :** aucune
`supabase db push`, aucune commande de
déploiement Edge, aucune requête d'écriture
dans les deux projets hébergés, aucun
`git reset --hard` ou `git clean`,
aucune fusion `main`, aucun Vercel production.
Ne pas toucher aux fichiers locaux non suivis
ni à `supabase/proposals/staged/`.
