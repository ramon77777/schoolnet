# SCHOOLNET — Lot 5D-N : JWT de passerelle activé sur la véritable Edge Parent

**Date :** 19 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **en brouillon**, non fusionnée.  
**CI finale :** [#44506298347](https://github.com/ramon77777/schoolnet/actions/runs/44506298347) — **12/12 jobs SUCCESS**, dont **24/24 contrôles N hors réseau** et **22/22 scénarios HTTP N**, avec 23/23 sous-tests Node en incluant l'agrégateur.  
**Recette locale N :** **à recevoir**. Total A–M **273/273 validés localement** ; cible A–N **297/297 après validation des 24 contrôles N**. Les **10 tests Parent historiques 5.C** et les intégrations réelles K, L, M et N exécutées en CI restent distincts.  
**Production :** aucune modification de `schoolnet_2.0` ou de `schoolnet-auth-sandbox`, aucun SQL installé, aucune Edge déployée, aucun raccordement frontend, aucune fusion `main` et aucune publication Vercel.

## 1. Objectif du Lot N

Le Lot M a confirmé le fonctionnement HTTP réel de l'Edge
`schoolnet-parent-current-class` mais sa configuration **temporaire**
désactivait la vérification du JWT au niveau de la passerelle
(`verify_jwt=false`) afin d'observer les refus dans le code Deno.

Le Lot N conserve **exactement le même code de fonction Edge**
et crée **une autre pile Supabase locale jetable** où
`verify_jwt=true` est explicitement configuré.
Il teste donc deux barrières **distinctes** :

1. La validation d'accès côté **passerelle Supabase**
   sur les jetons de connexion (user JWT) ;
2. La validation **dans la fonction Edge** :
   `auth.getUser` serveur, correspondance d'identité,
   session encore présente dans `auth.sessions`,
   rôle vérifié dans `profiles`, quota SQL persistant,
   puis lecture uniquement des enfants liés au Parent.

La vérification par la passerelle **ne remplace pas**
la seconde barrière : suivant la génération des clés API,
certaines clés peuvent franchir le contrôle de passerelle
sans représenter une session utilisateur.
En particulier, ni une clé `apikey`, ni une valeur de
`user_metadata` ne donnent le droit de lire une famille.

Références publiques :
[Supabase — Authorization headers](https://supabase.com/docs/guides/functions/auth-headers),
[Function Configuration](https://supabase.com/docs/guides/functions/function-configuration),
[JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys),
[CLI v3](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).

## 2. Fichiers créés et protections

- `scripts/lot5d/5dn_prepare_jwt_verified_edge_fixture.mjs` :
  prépare dans `$RUNNER_TEMP/schoolnet-5dn-stack` la
  **copie octet pour octet** de l'Edge M et de ses helpers.
  Il refuse un dossier non autorisé, les variables
  de connexion hébergées et un environnement hors CI.
- **Uniquement dans ce dossier temporaire**, le script
  écrit la configuration de fonction :
  `[functions.schoolnet-parent-current-class]`,
  `enabled=true`, **`verify_jwt=true`** et
  les deux drapeaux de fixture locale nécessaires.
  Le vrai `supabase/config.toml` du dépôt
  **n'est pas modifié** ; la fonction hébergée
  **reste OFF et non déployée**.
- `scripts/test-schoolnet-lot5d-n-gateway-jwt-contract.mjs` :
  **24 tests hors réseau** des garde-fous,
  de la configuration et du workflow.
- `scripts/test-schoolnet-lot5d-n-gateway-jwt-real.mjs` :
  **22 scénarios HTTP** de la véritable
  route `/functions/v1/schoolnet-parent-current-class`
  sur une pile Docker Supabase jetable.
- `.github/workflows/schoolnet-quality.yml` :
  nouveau job `lot5d_n_gateway_jwt` distinct du M,
  Supabase CLI **3.0.0 épinglée**, Auth/GoTrue,
  PostgreSQL, PostgREST et runtime Edge,
  SQL **K/L `SANDBOX_ONLY`** appliqués uniquement
  au Postgres local `127.0.0.1:54322`.
  Suppression des conteneurs par `supabase stop --no-backup`.
- `package.json` : `qa:lot5d:n` (tests N
  hors réseau pour Windows) et
  `qa:lot5d:n:integration` (pile Docker CI seule).

**Aucun changement de l'Edge applicative** n'a été
nécessaire dans ce lot. Le mode test loopback déjà
préparé au Lot M reste confiné à Docker via les
gardes de projet, d'origine et de drapeau local.

## 3. Résultats vérifiés dans GitHub Actions

La CI corrigée [#44506298347](https://github.com/ramon77777/schoolnet/actions/runs/44506298347)
est **12/12 jobs SUCCESS**.

| Groupe | Résultat vérifié |
| --- | --- |
| N01–N04 | Config locale de fonction avec `verify_jwt=true`, GoTrue/Postgres opérationnels, 5 comptes fictifs et 2 familles créés, utilisateurs authentifiés avec de vrais JWT signés. |
| N05–N09 | Un JWT légitime franchit la passerelle et atteint le parseur Edge (réponse 400 à un JSON volontairement invalide). Requêtes sans clé/jeton et JWT modifié ou invalide refusés **401**, sans données familiales. |
| N10–N11 | Avec des JWT authentiques, Parent A ne voit que son enfant en `5e B`, Parent B que son enfant en `4e C` ; les anciennes classes et la famille voisine ne sont pas divulguées. |
| N12–N16 | Admin et Élève refusés **403** ; origine étrangère refusée **403** ; injection de `parent_id` refusée **400** ; jeton invalide refusé **401**. |
| N17–N18 | Contrôle du quota à travers le vrai HTTP avec passerelle active : 12 lectures admises pour le compte Parent A, 13e en **429** ; deuxième session du même Parent incapable de contourner la limite. |
| N19–N21 | Déconnexion réelle : une session révoquée reste refusée **401** malgré un JWT anciennement valide ; changement du rôle Parent vers Enseignant refusé **403** ; interruption du RPC privé provoque **503** sans fuite. |
| N22 | Les 3 inscriptions, 2 années et les métadonnées documentaires fictives sont intactes après les consultations. |

**22/22 scénarios N réussis ; le moteur Node affiche
23/23 tests en incluant le test agrégateur.**
Les **24/24 contrôles statiques N** passent également ;
les lots précédents, lint, build TypeScript/Vite
et compilation Deno restent validés dans les 12 jobs.

Au premier lancement, **N02 échouait uniquement**
parce que l'URL de santé Auth contenait
`54321auth` au lieu de `54321/auth`.
Le correctif utilise `new URL("/auth/v1/health", url)`.
Aucune règle Edge ou permission SQL n'a été
changée pour résoudre cet échec de test.
Le run final cité est **entièrement vert**.

## 4. Limites de sécurité encore ouvertes

**Cette recette démontre le bon fonctionnement
de `verify_jwt=true` avec les JWT de cette
pile Supabase CLI locale. Elle NE démontre PAS
que les clés de signature JWT du projet
Supabase hébergé sont compatibles.**
Des mécanismes de signature asymétrique et
des paramètres de passerelle peuvent différer.
Le type de clés et le comportement réel du
gateway hébergé exigent donc une revue
autorisée et un test séparé avant tout GO.

La validation par le gateway ne garantit
pas à elle seule l'autorisation d'un Parent :
la vraie autorité doit rester
`auth.getUser` + `auth.sessions` +
`profiles.role` + `parent_links`
et quota sur le serveur.

La fixture K/L ne reproduit pas le schéma
complet des **43 migrations principales**,
des politiques et RPC historiques.
La page Parent n'appelle toujours pas cette
Edge. L'année scolaire réelle 2026–2027
contient déjà un dossier actif d'un autre
Élève ; bascule toujours **interdite**.

Le seuil **12 lectures par minute** est
un paramètre de **test non validé métier**.
Rétention/restauration durable des pièces,
observabilité, quota d'entrée contre les
requêtes à JWT invalide et concurrence
révocation/lecture sont encore à traiter.

## 5. Recette locale N — à effectuer

Depuis PowerShell, dans
`D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118

npm run qa:lot5d:n
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build

git status --short
```

**Attendu : 24/24 contrôles N**, tests Parent
historiques **10/10** comptés séparément,
ESLint **0 erreur** (avertissement
React Hook existant possible) et build Vite réussi.

**Cumul local A–M déjà validé : 273/273.**
Après validation locale des 24 tests N :
**A–N 297/297**. Les 22 tests HTTP N
et les intégrations K, L et M, déjà
exécutés en CI sur de vrais services locaux,
restent distincts du total local.

**Ne pas lancer `qa:lot5d:n:integration`
sur le poste sans pile Docker locale dédiée.
Ne pas exécuter `supabase db push`,
`supabase functions deploy`,
`git clean` ni `git reset --hard`.
Aucune écriture Supabase hébergée,
fusion de `main` ou publication Vercel
sans accord nouveau et distinct.**
