# SCHOOLNET — Lot 5D-J | Recette de sécurité Auth / sessions Parent et conservation Storage par HTTP isolé

**Date :** 19 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**  
**Résultat CI :** [GitHub Actions #44488437331](https://github.com/ramon77777/schoolnet/actions/runs/44488437331), **9/9 jobs SUCCESS** ; `qa:lot5d:j` **40/40 réussis** dans le job isolé, également lancé dans le job général de qualité.  
**Recette locale :** **J non encore validé par l'utilisateur** ; A à I **159/159 déjà validés**. Objectif A à J après validation locale : **199/199**, les **10/10 tests Parent 5.C** étant décomptés séparément.  
**Protection :** aucun SQL d'écriture sur Supabase principal, aucun `supabase db push`, aucun déploiement Edge, aucun changement de `main` ni du site Vercel production.

## 1. Ce que vérifie le Lot J

La fonction Edge `schoolnet-parent-current-class` préparée au Lot I vérifie
déjà l'identité à l'aide de `supabase.auth.getUser(token)`, le rôle
Parent stocké dans `profiles` et les seuls liens `parent_links`
appartenant au compte. Elle reste **non déployée et désactivée**.

**Écart de sécurité confirmé :** vérifier le JWT et l'utilisateur
ne garantit pas nécessairement qu'une session a été révoquée
avant expiration du jeton. La version préparée du Lot I
n'effectue pas encore de vérification autoritative de présence
de la session dans `auth.sessions`, ni de limitation persistante
des requêtes. Cela doit rester un **critère d'interdiction de GO**.

Un audit **SELECT uniquement des métadonnées du serveur principal**
a confirmé l'existence de `auth.sessions` avec au minimum
`id`, `user_id` et `not_after`.
Aucune session réelle ni contenu personnel n'a été lu.
**Aucune connexion à cette table depuis la fonction Edge réelle
n'a été ajoutée ni activée dans le Lot J.**

Pour Storage, l'upload et ses métadonnées ne participent pas à
une transaction interservices unique. La documentation Supabase
demande expressément de manipuler les objets via l'**API Storage**,
pas par une suppression SQL directe de `storage.objects`.
Une erreur HTTP de copie ou un succès SQL non confirmé
doit être rapproché d'une lecture de contrôle avant tout changement
irréversible.

## 2. Contrat de session Parent — HTTP local uniquement

**Fichier :**
`scripts/lot5d/5dj_parent_http_security_reference.mjs`.

Il s'agit d'un **modèle de contrôle testable**, pas d'une
fonction Edge déployable. Ses dépendances d'Auth, session,
limitation et lecture des classes sont **injectées**.

Le modèle rejette par défaut toute requête si la configuration
n'est pas exactement une fixture de test à `127.0.0.1`,
avec origine `https://schoolnet-test.invalid`
et activation locale explicite. Il n'accepte que :

- une requête `POST` au format JSON ;
- un unique champ de corps `action=list_current_classes` ;
- un Bearer reçu dans le transport, jamais un rôle, un Parent
  ou un enfant choisi par le navigateur.

Le contrôle prévu a lieu dans cet ordre : jeton vérifié par
l'**adaptateur Auth fictif** → `userId` et `sessionId`
fournis par cet adaptateur → présence et appartenance de
la session active, non révoquée et non expirée → limitation
des requêtes → rôle `parent` relu via l'adaptateur de profil
→ lecture annuelle autorisée → reconstruction d'une réponse
publique minimale.

Les erreurs de service Auth, de vérification des sessions,
de rate-limit, de profil ou de lecture entraînent un **refus**.
La réponse ne révèle ni erreur SQL, ni données d'une autre famille,
ni contact privé. Le résolveur de classes annuelles du Lot I
reste limité à `parent_links`, à l'unique année courante et
aux inscriptions `active`.

**Limitations de sécurité :**

- Le transport HTTP simule Supabase Auth et `auth.sessions` :
  **aucune vérification cryptographique de vrai JWT, aucun vrai refresh
  token, aucune session Auth réelle n'est impliquée.**
- Le stockage des limites de fréquence est fictif. Une solution
  persistante et résistante aux appels concurrents reste à choisir.
- Il faudra sécuriser le traitement du `session_id` issu d'un JWT
  vérifié, son rattachement à l'acteur Auth, la lecture privée
  `auth.sessions` sous privilèges minimaux et la gestion des
  jetons expirés/révoqués. Aucune autorisation depuis
  `user_metadata`.
- Le véritable endpoint du Lot I n'a pas été modifié, raccordé
  à ce modèle ni déployé. Son flag reste **OFF**.

## 3. Conservation documentaire — vérification de copie en mémoire

**Fichier :**
`scripts/lot5d/5dj_retention_recovery_reference.mjs`.

Le modèle travaille sur un document **fictif** dont l'identifiant
et les métadonnées sont fournis par un adaptateur serveur simulé,
pas par le navigateur. Le contrôle refuse les dossiers inactifs,
les années clôturées ou en cours de clôture, les acteurs non Admin
et toute configuration non isolée.

La séquence mise à l'épreuve est la suivante :

1. Lire l'objet source fictif et vérifier sa taille
   par rapport aux métadonnées, sous limite de 10 Mo.
2. Construire un chemin de rétention **privé** à partir de
   `documentId` et `operationId` contrôlés.
3. Copier l'objet sans effacer le fichier original.
4. Relire intégralement la copie depuis l'adaptateur Storage.
5. Comparer nombre d'octets et **empreinte SHA-256**.
6. Exiger un accusé d'enregistrement durable de l'attestation
   **simulé** ; refuser l'attestation si la copie ou le journal
   ne sont pas confirmés.
7. Retourner seulement `backup_attested` ou une décision de
   contrôle ; **`delete_allowed=false` dans TOUS les cas**.

Une erreur HTTP après l'écriture de la copie est volontairement
traitée comme **incertaine** : la lecture de contrôle peut confirmer
la copie, mais jamais déclencher une suppression. Si les octets
ne correspondent pas, le processus échoue sans journaliser
de sauvegarde validée.

Le module `classifyDocumentReconciliation` signale séparément :
**archive intacte**, **original absent avec copie contrôlée**,
**original absent sans copie**, **objet orphelin** et
**copie conservée sans métadonnées**.
Il ne répare, ne restaure et n'efface rien automatiquement.

**Limites :** ces opérations sont exécutées contre un fournisseur
fictif en mémoire et, pour les tests de transport, un serveur HTTP
local. Il n'existe **aucun bucket de rétention réel**, aucun
workflow de suppression réel, aucune empreinte persistée dans
Supabase, ni protocole complet de reprise interservices.

## 4. Validation : 40 cas hors réseau et HTTP loopback

**Fichier :**
`scripts/test-schoolnet-lot5d-j-isolated-http.mjs`.

Les **40 tests** couvrent :

- **J01–J06** : activation par défaut désactivée, hôte local strict,
  origine, méthode et corps JSON, refus d'injection ou de Bearer absent.
- **J07–J18** : Auth indisponible ou non vérifiée, session manquante,
  révoquée, différente, expirée, panne du service de session,
  refus de rate-limit et de rôle Parent.
- **J19–J23** : réponse minimale, suppression de champs sensibles,
  absence de fuite SQL, données contradictoires ou d'une autre famille.
- **J24–J31** : conservation, taille, empreinte, vérification après
  timeout, copie altérée ou absente, preuve d'audit manquante,
  **zéro suppression automatique**.
- **J32–J34** : diagnostics de réconciliation sans réparation aveugle.
- **J35–J37** : fonction Parent I toujours OFF, interdiction
  d'accès réseau externe et CI sans déploiement.
- **J38–J40** : véritables requêtes HTTP sur le port éphémère
  `127.0.0.1` : vérification de session puis révocation,
  rate-limit et changement de rôle, copie binaire qui
  réussit mais retourne une erreur HTTP simulée.

### CI vérifiée

[Run #44488437331](https://github.com/ramon77777/schoolnet/actions/runs/44488437331)
: **9/9 jobs SUCCESS**.

Le job général teste lint, TypeScript/Vite, les Lots A–J et
les fonctions Edge non déployées ; les jobs PostgreSQL 17
fictifs A–I restent verts. Le nouveau job
`lot5d_http_isolation` utilise **Node 24**, sans secrets
Supabase, sans données personnelles et sans accès cloud,
et confirme `tests 40 / pass 40 / fail 0`.

Ces résultats démontrent la cohérence des **contrats simulés**,
pas la sécurité d'une vraie intégration Supabase Auth ou Storage.

## 5. Travail encore nécessaire avant un véritable GO

1. **Auth Parent :** implémenter et tester réellement la
   vérification de session non révoquée côté serveur, la
   lecture de `auth.sessions` via un accès privé à
   privilèges minimaux et un rate-limit persistant.
2. **Familles :** tester deux vrais comptes Parents fictifs
   sur un Supabase de préproduction isolé et vérifier les
   demandes croisées, la session expirée et la lecture
   des données `parent_links`/inscriptions.
3. **Storage :** provisionner un environnement Storage
   de test isolé, vérifier ses policies, l'API d'upload/copie,
   les clés, les pannes et les lectures de contrôle.
4. **Conservation :** définir et valider un bucket de rétention
   privé, audit persistant des empreintes, résolution
   idempotente des demandes, autorisation métier, restauration
   et séparation des rôles ; **pas de suppression physique** avant.
5. **Année scolaire :** résoudre avec une décision métier
   le dossier actif déjà présent en 2026–2027, contrôler les
   RPC historiques, les demandes publiques et une migration
   SQL canonique après revue des droits.
6. **Déploiements :** nouveau GO distinct pour tout schéma ou
   fonction sur Supabase principal, puis seulement
   fusion de la PR dans `main` et Vercel production.
7. **Technique :** les avertissements React Hook,
   Browserslist et taille du bundle restent non bloquants
   mais doivent être traités dans un lot séparé.

## 6. Recette locale 5D-J — à recevoir

Depuis `D:\Bakary\10 autres\schoolnet` dans PowerShell :

```powershell
git status --short
git branch --show-current

git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118

npm run qa:lot5d:j
node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs
npm run lint
npm run build

git status --short
```

**Attendu :** J **40/40**, Parent 5.C **10/10 séparément**,
ESLint **0 erreur** (1 warning React Hook historique possible),
build Vite réussi, fichiers locaux préexistants et
`supabase/proposals/staged/` préservés.

**Bilan local déjà obtenu : 159/159 (A–I).**
Après validation J, **199/199 (A–J)**, sans inclure
les 10 tests historiques Parent ni les assertions SQL CI.

**Interdits :** aucune connexion ou migration Supabase principale,
aucun `supabase db push`, `supabase functions deploy`,
aucun `git reset --hard`, `git clean`, aucune fusion
`main`, aucun déploiement Vercel, aucun changement
du flag de passage d'année.
