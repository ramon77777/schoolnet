# SCHOOLNET — Lot 5D-M : recette HTTP de bout en bout de la véritable fonction Edge Parent

**Date :** 19 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**, non fusionnée.  
**CI :** [GitHub Actions #44501540891](https://github.com/ramon77777/schoolnet/actions/runs/44501540891), **11/11 jobs SUCCESS**, **24/24 contrôles hors réseau** et **25/25 scénarios HTTP Edge réels** (Node affiche 26 tests réussis avec le test parent agrégateur).  
**Recette locale M :** **à recevoir de l'utilisateur** ; A à L **249/249 tests locaux déjà validés**, objectif A à M **273/273** après les 24 nouveaux tests hors réseau. Les **10/10 tests historiques Parent 5.C**, **21 tests d'intégration K**, **21 L** et **25 M HTTP en CI** sont distincts.  
**Production :** aucune écriture sur les deux Supabase hébergés, aucune fonction Edge déployée, aucun SQL M installé, aucune fusion dans `main` et aucune publication Vercel.

## 1. Objectif et portée exacte

Les Lots I à L ont préparé puis testé le cœur de lecture Parent,
Supabase Auth, `auth.sessions`, la limitation PostgreSQL persistante
et la confidentialité des familles. Leurs tests d'intégration
K/L validaient **les composants avec de vrais services Supabase**,
mais **pas la fonction Deno servie par une URL HTTP réelle**.

Le Lot M vérifie le code `Deno.serve` réellement routé
par la pile Supabase locale sur :

```text
POST http://127.0.0.1:54321/functions/v1/schoolnet-parent-current-class
```

Les requêtes traversent le routeur local Supabase, la vraie Edge Function,
Supabase Auth GoTrue, PostgREST et le contrôle PostgreSQL du Lot L.
L'environnement est **une nouvelle pile Docker jetable et indépendante**
des projets hébergés `schoolnet_2.0` (principal) et
`schoolnet-auth-sandbox` (déjà utilisé par d'autres essais).
Aucun élève réel, mot de passe réel ni fichier documentaire réel n'est impliqué.

## 2. Livrables et mécanisme d'isolement

### Fonction Edge préparée, toujours non déployée

`supabase/functions/schoolnet-parent-current-class/index.ts`

Le contrôle d'origine et de projet **hébergés** reste strict :

- projet : `https://anttmbhaphkhmkoqsofd.supabase.co` ;
- origine : `https://schoolnet-snowy.vercel.app` ;
- activation : `SCHOOLNET_LOT5DI_PARENT_READ_ENABLED=true`
  **nécessaire côté serveur**, toujours absente en hébergement.

Pour **les seuls tests Docker locaux**, le code autorise
une seconde combinaison **exactement délimitée** :

- variable serveur `SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP`
  égale à `loopback-fixture-20261119` ;
- absence de `DENO_DEPLOYMENT_ID` hébergé ;
- URL serveur locale dans la liste fermée
  `http://kong:8000` ou `http://127.0.0.1:54321` ;
- en-tête `Origin` exactement
  `http://127.0.0.1:54321` ;
- activation du flag serveur Parent identique.

Ces conditions ne peuvent pas viser le nom de domaine Supabase
principal. Le traitement métier reste inchangé : vérification
réelle `auth.getUser`, identification et présence de
`auth.sessions`, rôle stocké dans `profiles`,
quota SQL `service_role` uniquement, puis lecture
annuelle restreinte à `parent_links`.
**Aucune clé privilégiée n'est exposée au frontend.**

### Copie exacte de code dans le dossier temporaire

`scripts/lot5d/5dm_prepare_edge_http_fixture.mjs`

Le script exige GitHub Actions et le chemin temporaire
`$RUNNER_TEMP/schoolnet-5dm-stack`.
Il **copie octet pour octet**, sans modifier les sources du dépôt :

- la vraie fonction Edge `index.ts` ;
- les helpers de lecture annuelle et de contrôle session du Lot I/L ;
- le résolveur Parent pur `parentYearClassProposal.ts`.

**Seule la configuration TEMPORAIRE de cette nouvelle pile**
comporte `[functions.schoolnet-parent-current-class]`,
`verify_jwt = false` et les deux flags de tests dans
`supabase/functions/.env`.
Ce `verify_jwt = false` concerne **exclusivement la passerelle
Docker de test** afin de faire parvenir les JWT incorrects et révoqués
au véritable code Edge. **La vérification Auth `getUser`
et le RPC `auth.sessions` demeurent impératifs à l'intérieur
de la fonction.** Cette configuration ne doit **jamais**
être copiée dans le vrai `supabase/config.toml`
ou déployée en production, où la validation de JWT au niveau
du gateway doit rester active.

La pile Supabase est démarrée via CLI **3.0.0 épinglée**,
avec GoTrue, PostgreSQL, PostgREST, Storage et cette fois
**Edge Runtime**. Les scripts K/L `SANDBOX_ONLY` sont
installés seulement sur le Postgres jetable, avec les
gardes réseau, `application_name` et schéma fictif
déjà validés. Tous les conteneurs/volumes temporaires sont
supprimés par `supabase stop --no-backup`.

### Scripts de recette

- `scripts/test-schoolnet-lot5d-m-edge-http-contract.mjs` :
  **24 contrôles statiques/hors réseau** — isolations,
  origine, flag, non-déploiement, confidentialité, SQL
  service-only et non-écriture des dossiers historiques.
- `scripts/test-schoolnet-lot5d-m-edge-http-real.mjs` :
  **25 scénarios d'intégration HTTP** via de vrais
  comptes Auth fictifs, deux familles, deux années,
  des inscriptions et une fonction Edge réellement servie.
- `npm run qa:lot5d:m` : tests **hors réseau**,
  destinés à la recette sur Windows.
- `npm run qa:lot5d:m:integration` :
  tests **connectés uniquement à la pile Docker CI
  locale jetable** ; ne **jamais** l'exécuter contre
  Supabase principal ni sans l'environnement de tests.
- `.github/workflows/schoolnet-quality.yml` :
  nouveau job indépendant `lot5d_m_edge_http`,
  sans secrets hébergés ni commande de déploiement.

## 3. Résultats observés

[GitHub Actions #44501540891](https://github.com/ramon77777/schoolnet/actions/runs/44501540891) :
**11 jobs sur 11 SUCCESS**.

| Séquence | Vérification effectuée |
| --- | --- |
| M01–M02 | Précontrôle local `OPTIONS`, refus d'origine étrangère ; CORS du proxy Supabase local pris en compte. |
| M03–M05 | Cinq comptes Auth fictifs, deux familles, années 2025–2026 et 2026–2027 **fictives**, JWT distincts vérifiés par GoTrue. |
| M06–M12 | `GET`, absence de Bearer, JSON invalide, action incorrecte, injection d'IDs, corps trop volumineux ou content-type non conforme : requête rejetée avant toute lecture Parent. |
| M13–M14 | Parent A voit **uniquement** son enfant actif en `5e B`, Parent B uniquement son enfant en `4e C` ; la classe historique `6e A` n'est pas annoncée comme actuelle. |
| M15–M18 | Admin/Élève refusés ; RPC privé et `student_enrollments` inaccessibles directement au navigateur ; faux JWT refusé. |
| M19–M21 | Aucune consommation de quota sur les requêtes préalablement refusées ; **12 lectures HTTP Parent A autorisées, la 13e en 429** ; second JWT du même Parent **ne contourne pas le quota** ; Parent B garde son propre compteur. |
| M22–M23 | `auth.signOut` coupe immédiatement l'ancienne session Parent B ; changement du rôle en base vers Enseignant bloque un nouveau jeton valide. |
| M24 | Retrait du privilège SQL de test : la vraie fonction Edge renvoie **503** sans divulguer SQL ou famille ; privilège de test restauré ensuite. |
| M25 | Les dossiers annuels, liens familiaux, années et métadonnées documentaires fictifs restent inchangés par les essais de consultation. |

La CI qualité valide **24/24 contrôles M**,
les Lots A–L, la compilation Deno Edge,
ESLint et le build Vite. Le job HTTP M valide
**25/25 scénarios** (Node indique `tests 26 / pass 26`
en comptant le test parent), avec **0 échec**.

Le premier run de préparation avait découvert
deux assertions de test trop rigides :
un test I attendait l'expression syntaxique
d'origine exacte antérieure et le proxy local
normalisait l'en-tête `Access-Control-Allow-Origin`
du précontrôle `OPTIONS` à `*`.
La logique hébergée de refus d'origine a été
préservée, l'assertion I rendue compatible
avec son écriture équivalente et le test
précontrôle adapté au comportement du proxy.
**Le run final cité est intégralement vert.**
L'en-tête CORS `OPTIONS` du proxy local ne constitue
**pas**, à lui seul, une preuve de sécurité ;
les POST à origine étrangère et les droits internes
restent soumis aux vérifications applicatives.

## 4. Ce qui reste bloquant avant activation réelle

1. **Ne pas déployer** cette fonction avec la configuration
   test `verify_jwt=false`. Conserver le contrôle gateway JWT
   et revalider ses effets exacts, notamment sur les sessions
   révoquées et la gestion de CORS.
2. Tester la fonction contre une **copie fidèle du schéma
   complet** (43 migrations, RPC et privilèges), non la fixture
   K/L simplifiée.
3. Effectuer une revue du **court intervalle possible**
   entre autorisation de session et lecture, puis
   ajouter observabilité et protection des requêtes
   à JWT invalide, qui ne consomment pas encore
   le quota SQL par compte Parent.
4. Décider du **quota métier** (12 par minute est
   un seuil de test, non une politique validée)
   et de la rétention des compteurs SQL.
5. Valider le contrat frontend et raccorder la
   page Parent au service uniquement sous un
   **GO dédié**. Elle affiche toujours les
   données historiques sans invoquer l'Edge M.
6. Traiter séparément sauvegarde documentaire
   durable, restauration, demandes privées,
   validation des archives et finaliseur annuel.
7. La cible réelle **2026–2027 est toujours occupée**
   par un dossier actif distinct : toute
   bascule reste **interdite** sans décision métier.

## 5. Recette locale 5D-M — à effectuer

Dans PowerShell, depuis
`D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118

npm run qa:lot5d:m
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build

git status --short
```

**Attendu :** M **24/24 hors réseau**,
Parent 5.C **10/10 séparés**, lint
**0 erreur** (1 warning historique possible),
build Vite réussi, aucun changement imprévu
des scripts non suivis et de
`supabase/proposals/staged/`.

**Bilan local déjà validé A–L : 249/249**.
Après confirmation M : **A–M 273/273**,
sans addition des **25 intégrations M**,
des **21 intégrations K**, **21 L**
ou des tests historiques Parent 5.C.

**Interdictions :** ni `supabase db push`,
ni `supabase functions deploy`, ni copie
de la configuration temporaire
`verify_jwt=false` dans le vrai dépôt,
ni `git clean` ou `git reset --hard`,
ni fusion de `main` ni déploiement Vercel.
