# SCHOOLNET — Lot 5D-L : sessions Parent révoquées et limitation persistante des lectures

**Date :** 19 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**.  
**CI corrigée :** [#44497337368](https://github.com/ramon77777/schoolnet/actions/runs/44497337368), **10/10 jobs SUCCESS** : 5D-L **30/30 tests hors réseau** et **21/21 tests sur les vraies API Supabase locales**, compilation Deno de la fonction Edge, ESLint et Vite réussis.  
**Recette locale L :** **à recevoir** ; A–K **219/219 déjà validés** par l'utilisateur ; objectif A–L **249/249** après confirmation. Les **10 tests historiques Parent 5.C**, **21 tests d'intégration K** et **21 tests d'intégration L** ne sont pas inclus dans le cumul local.  
**Production :** aucun SQL installé dans Supabase principal ou dans le sandbox hébergé, aucune fonction Edge déployée, aucun changement de `main` ni de Vercel.

## 1. Risque traité

Le Lot K démontrait, avec les vrais services GoTrue et PostgreSQL
**locaux**, qu'une session peut être supprimée d'`auth.sessions`
après `signOut`, alors que son JWT précédemment émis peut
rester cryptographiquement valide jusqu'à son expiration.
Le code de la fonction Parent I se limitait à
`auth.getUser` avant les lectures annuelles.

Le Lot L branche dans la **source Edge non déployée**
un garde serveur de présence de session, de rôle Parent
revalidé et de quota PostgreSQL partagé, exécuté
**avant toute lecture des inscriptions ou des liens familiaux**.

Le seuil de proposition **12 requêtes / 60 secondes /
compte Parent** est une **valeur de test** : sa
validation métier et anti-abus en production reste
à faire. Les tentatives avec JWT invalide sont
rejetées par Auth avant la consommation du quota
Parent ; un garde d'infrastructure à l'entrée
de l'API reste donc à concevoir pour ce cas.

Références :
[Sessions Supabase](https://supabase.com/docs/guides/auth/sessions) ;
[Sécurisation de l'API](https://supabase.com/docs/guides/api/securing-your-api) ;
[Sécurisation des Edge Functions](https://supabase.com/docs/guides/functions/auth).

## 2. Livrables sur GitHub — aucun déploiement

### 2.1 Vérification de jeton, session et quota

`supabase/functions/_shared/lot5dlParentSessionGate.ts`

Le module pur `authorizeParentSession` :

1. exige un **utilisateur fraîchement vérifié** côté
   serveur par Supabase Auth `getUser(token)` ;
2. inspecte **ensuite seulement** les champs
   `sub`, `session_id`, `role`,
   `exp` et `iat` du même JWT ;
   la lecture JSON ne valide **pas** la
   signature à elle seule ;
3. exige que `sub` corresponde exactement
   à l'utilisateur vérifié, que `session_id`
   soit un UUID et que le jeton ne soit pas expiré ;
4. appelle une vérification **privée en base**
   qui associe le `session_id` à cet utilisateur,
   confirme sa présence et sa date `not_after`,
   confirme le rôle `profiles.role='parent'`
   et consomme une unité de quota ;
5. refuse les sessions absentes ou révoquées,
   les autres rôles et les quotas saturés ;
   refuse également toute panne du système
   de vérification sans consulter les classes.

Aucune autorisation ne repose sur
`user_metadata` ni sur des IDs ou un rôle
injectés dans le corps JSON du navigateur.

### 2.2 Fonction Edge Parent préparée

`supabase/functions/schoolnet-parent-current-class/index.ts`

Elle appelle désormais `authorizeParentSession`
après les contrôles d'origine, de méthode,
de JSON et de Bearer. Le serveur utilise son
client Supabase privilégié uniquement pour
exécuter le RPC `schoolnet_parent_read_gate`
avec l'identité vérifiée et le `session_id`
issu du jeton déjà vérifié. En cas de refus :
**401** (session), **403** (rôle),
**429** (quota) ou **503**
(panne / garde non installé).

Les lectures existantes continuent ensuite de
passer par `readVerifiedParentAnnualClasses`,
qui vérifie à nouveau le rôle et limite les
résultats aux enfants liés par `parent_links`
et à l'année `is_current`.
Aucun accès direct à `student_enrollments`
n'est ajouté au navigateur.

**Activation toujours interdite** :
`SCHOOLNET_LOT5DI_PARENT_READ_ENABLED`
reste désactivé et aucune valeur n'a été
installée dans l'environnement hébergé ;
la fonction n'est ni déployée ni appelée
par la page Parent. Si le RPC n'existe pas,
la fonction échoue en **503**, sans donner
accès aux dossiers.

### 2.3 SQL de proposition strictement local

`scripts/lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql`

Il s'agit d'un fichier **SANDBOX_ONLY, non d'une
migration de production**. Une garde impose
la base jetable locale `postgres`, un
`application_name=schoolnet_5dl_local_ci`,
le réseau interne Docker, les tables K
et les policies spécifiques `k_profile_self`
et `k_storage_source_delete_deny`.
Il ne doit **jamais** être exécuté dans
le SQL Editor ou l'instance principale.

Les objets expérimentaux sont :

- `schoolnet_private.parent_read_rate_windows` :
  une ligne persistante par compte,
  limite de 12 demandes sur 60 secondes ;
  **RLS active** et aucune permission directe
  aux rôles `anon`, `authenticated` ou
  `service_role` pour lire/écrire la table.
- `schoolnet_private.check_parent_session_and_rate` :
  fonction `SECURITY DEFINER` dans un
  **schéma privé non exposé**, `search_path`
  verrouillé, lecture réelle `auth.sessions`
  et du rôle en base, puis compteur atomique
  via `INSERT ... ON CONFLICT ... DO UPDATE`.
- `public.schoolnet_parent_read_gate` :
  **simple wrapper SECURITY INVOKER**
  pour l'API PostgREST ; `EXECUTE`
  **interdit** à `PUBLIC`, `anon` et
  `authenticated`, autorisé au seul
  rôle serveur `service_role`.

Les appels simultanés pour le même compte
sérialisent leurs changements sur la clé
primaire `actor_id`, afin qu'ils ne
dépassent pas le quota, même entre
différentes instances serveur.

**Réserves importantes :** ce montage reste
un candidat en fixture simplifiée et doit
faire l'objet d'une revue de sécurité
SQL (y compris schémas exposés, défauts
de privilèges, `SECURITY DEFINER`),
d'un mécanisme d'observabilité et d'un
choix de quota avant une migration canonique.

## 3. Recettes exécutées en GitHub Actions

### Tests hors réseau

`scripts/test-schoolnet-lot5d-l-session-gate.mjs`,
`npm run qa:lot5d:l` :
**30/30 tests**, dont vérification Auth
avant lecture du `session_id`, jeton
expiré ou falsifié, rôle interdit,
session révoquée, panne de base, quota
saturé, contrat SQL privé et Endpoint
OFF/non déployé.

Le premier passage CI avait
**29/30**, car une assertion attendait
à tort **zéro appel à Auth** pour un
jeton expiré. Le comportement correct est
d'interroger Auth, puis de **refuser le
jeton sans invoquer le RPC PostgreSQL**.
L'assertion a été corrigée ;
**le run final #44497337368 confirme
30/30 et le job de qualité SUCCESS**.
Ce correctif concerne uniquement le test.

### Intégration sur vraies API Supabase locales

`scripts/test-schoolnet-lot5d-l-real-supabase.mjs`,
`npm run qa:lot5d:l:integration` :
**21/21 scénarios réussis**, lancés
**uniquement en CI** avec une pile
Supabase locale éphémère du Lot K.

- Création de trois utilisateurs fictifs
  (deux Parents et un Admin) via la vraie
  API GoTrue, authentification et JWT,
  `auth.getUser` et vrais `session_id`.
- Refus des appels SQL privilégiés
  effectués directement par
  `anon` ou `authenticated`.
- Refus d'un Admin, d'une session inconnue,
  d'une session d'un autre Parent et
  d'une session dont `not_after` est dépassé.
- Deux connexions simultanées du même
  compte partagent **la même fenêtre
  durable de 12 requêtes**.
- **24 requêtes concurrentes** pour un
  deuxième Parent : exactement **12
  autorisées et 12 refusées**.
- Réinitialisation après expiration de
  la fenêtre et conservation du quota
  après changement de `user_metadata`.
- Après un véritable `auth.signOut`,
  l'ancienne session n'est plus présente
  et le RPC la refuse.

Résultat final du
[run #44497337368](https://github.com/ramon77777/schoolnet/actions/runs/44497337368) :
**10/10 jobs SUCCESS**. Les anciens
tests des Lots A–K, la compilation Deno
de la fonction Edge, ESLint et Vite
restent validés.

## 4. Ce qui reste à qualifier avant toute activation

1. La fixture locale **ne reproduit pas
   les 43 migrations et RPC historiques**
   du vrai `schoolnet_2.0` ; effectuer
   une revue de compatibilité complète.
2. La vraie fonction Edge a été **compilée**
   et branchée au garde, mais **n'a pas
   été déployée/exécutée comme endpoint HTTP
   dans un environnement Supabase réel**.
   L'intégration L vérifie le vrai RPC et
   le vrai service Auth, **pas le déploiement
   de l'Edge elle-même**.
3. Une révocation intervenant exactement
   **entre** la vérification de session
   et la fin d'une lecture peut laisser
   une courte fenêtre de concurrence :
   revoir le contrat d'autorisation
   atomique avec la lecture pour le GO.
4. Le quota persistant ne filtre pas
   encore les requêtes contenant un JWT
   invalide, qui sont rejetées plus tôt ;
   prévoir garde réseau/Edge anti-abus,
   journalisation sans données personnelles
   et ajustement du seuil.
5. Préparer une migration canonique,
   ses grants, tests RLS et rollback
   **sur copie fidèle** avant tout GO.
6. Les écrans Parent restent
   volontairement sur la
   « dernière classe connue » ;
   le branchement annuel nécessitera
   une autorisation spécifique et des
   tests métier.
7. La sauvegarde/restauration documentaire
   avec audit durable et suppression
   contrôlée est un **lot distinct**.
8. Le dossier actif distinct en 2026–2027
   reste bloquant : **aucune bascule
   réelle autorisée** sans décision métier.

## 5. Recette locale L — à recevoir

Depuis PowerShell, dans `D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118

npm run qa:lot5d:l
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build

git status --short
```

**Attendu : L 30/30**, tests Parent
5.C **10/10 séparément**, ESLint
**0 erreur** (un avertissement connu),
build TypeScript/Vite **réussi** ;
aucun changement imprévu de l'état
Git local. Préserver les scripts
non suivis et le dossier
`supabase/proposals/staged/`.

**Cumul local A–K déjà validé 219/219**,
objectif après réception de L :
**A–L 249/249 tests locaux**.
Les **21 tests d'intégration L et K**
restent une preuve CI **distincte**
(non comptée dans le total local).

**Interdits :** `supabase db push`,
`supabase functions deploy`,
toute installation `SANDBOX_ONLY`
dans Supabase hébergé, `git clean`,
`git reset --hard`, fusion `main`
ou publication Vercel.
