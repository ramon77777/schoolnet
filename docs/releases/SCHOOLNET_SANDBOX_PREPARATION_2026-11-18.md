# SCHOOLNET — Préparation de l'environnement de recette isolé

**Date : 18 novembre 2026**  
**Statut : conception et garde-fous de configuration uniquement ; aucun bac à sable créé, pas de déploiement manuel.**  
**Branche :** `feature/schoolnet-s2a-classes-tenant-qa`, PR n° 14 en brouillon.

## 1. Décision de sécurité

**La production demeure inchangée.** Le site officiel et le projet Supabase
principal restent les seuls couples autorisés par les protections actuelles des
modules S2-B, S3-A, S3-B et S3-C. Aucune migration, Edge Function, ressource
Supabase, application Vercel ou compte de test n'a été créé pour ce lot.

La préparation **ne rend PAS les écrans sandbox inscriptibles**. Les fichiers
présents sur GitHub fournissent un modèle, un validateur hors ligne et des
tests de non-régression. Une deuxième autorisation sera nécessaire pour créer
et configurer de vrais environnements isolés, et une troisième pour toute
activation des écritures et recette métier.

**L'origine HTTP ne constitue pas une preuve d'identité** : les contrôles
réels doivent continuer à vérifier Auth, rôle `school_admin`,
appartenance active à l'établissement, classe, année, élève/enseignant,
matière et privilèges RLS côté serveur.

## 2. Architecture cible (PAS déployée)

```text
PRODUCTION EXISTANTE                          SANDBOX FUTUR (non créé)
Site officiel Vercel                         Nouveau projet Vercel distinct
       |                                                   |
       v                                                   v
Supabase principal                            Supabase de recette DISTINCT
- Auth / comptes réels                        - Auth / comptes synthétiques
- classes & inscriptions historiques          - schéma de test audité
- stockage / Edge Functions                    - stockage isolé / fonctions isolées
- RPC S2-B à S3-C : Origin prod                 - RPC adaptées au domaine test
- lecture Preview, écriture prod                - écriture désactivée par défaut
``` 

**Ne pas réutiliser** le projet Supabase principal dans le nouveau Vercel,
ni connecter une Preview de production à un bac à sable inscriptible par
déduction d'un suffixe de domaine. Une Preview est un build de production
pour Vite, mais elle ne bénéficie d'aucun droit d'écriture sans contrôles
explicites et exacts.

Nous privilégions un **projet Supabase distinct** (ou une branche réellement
isolée après étude des garanties de données du plan Supabase) avec
**données 100 % synthétiques** : ne jamais dupliquer des profils, jetons,
liens parents/enfants, médias ou fichiers d'élèves réels.

## 3. Fichiers préparés sur GitHub

| Fichier | Rôle |
|---|---|
| `config/schoolnet-sandbox.env.example` | Modèle de valeurs factices, sans aucune clé de projet réelle |
| `scripts/lib/schoolnet-sandbox-env.mjs` | Validation fail-closed de la configuration sandbox |
| `scripts/check-schoolnet-sandbox-env.mjs` | Vérification locale hors ligne, sans affichage des clés |
| `scripts/test-schoolnet-sandbox-preparation.mjs` | Tests de non-régression : séparation prod/sandbox |
| `package.json` | Commandes `qa:sandbox:prepare` et `sandbox:check` |
| `.github/workflows/schoolnet-s2b-qa.yml` | Exécution des tests sans déploiement ni secret |

**Le module applicatif actuel n'a PAS été reconfiguré pour écrire sur une
autre base.** Les 4 politiques de frontend continuent d'appeler
`canWriteSchoolClassesFromRuntime` et d'exiger simultanément
l'origine officielle exacte, l'URL Supabase principale exacte et
`import.meta.env.PROD === true`.

## 4. Modèle de configuration future (pas de vrais identifiants)

Le fichier `config/schoolnet-sandbox.env.example` contient exactement :

```dotenv
VITE_SCHOOLNET_ENVIRONMENT=sandbox
VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED=false
VITE_SCHOOLNET_SANDBOX_APP_ORIGIN=https://recette-schoolnet.example.invalid
VITE_SCHOOLNET_SANDBOX_PROJECT_REF=REPLACE_WITH_SANDBOX_REF
VITE_SUPABASE_URL=https://REPLACE_WITH_SANDBOX_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_REPLACE_WITH_SANDBOX_PUBLIC_KEY
```

Les domaines `.invalid` et les valeurs `REPLACE_WITH` sont
**volontairement inutilisables**. Aucun projet ne doit être déduit des
placeholders. Les variables Vite commençant par `VITE_` sont visibles
dans le navigateur : **JAMAIS** de clé `service_role`, clé
`sb_secret_`, mot de passe, jeton de récupération ou secret JWT.

Quand une base de recette distincte sera autorisée, le fichier local à
créer sera **uniquement** `.env.sandbox.local` à la racine ;
`.gitignore` exclut déjà les fichiers `.env*`.
Les clés doivent provenir de ce **nouveau projet**, sans copie depuis
le projet principal.

Le validateur impose :
- environnement `sandbox` exact et indicateur d'écritures
  `false` obligatoire ;
- référence Supabase test (20 caractères alphanumériques minuscules)
  différente du projet principal ;
- URL `https://<ref>.supabase.co` correspondant exactement à la
  référence, sans redirection ni sous-domaine usurpé ;
- origine HTTPS canonique exacte et distincte du site officiel
  (ni localhost, ni placeholder `.invalid`, ni chemin, port ou query) ;
- clé de navigateur publique de type `sb_publishable_` ou ancien JWT
  dont le rôle est explicitement `anon` ;
- absence de variable inattendue, de doublon, d'interpolation et d'override
  différent depuis le shell (prioritaire dans Vite).

**Même une vérification positive du fichier n'autorise aucune écriture.**
Le validateur n'interroge pas Supabase, ne prouve pas que le projet existe
et ne modifie aucun droit côté navigateur ou serveur.

## 5. Verrous SQL existants : à adapter UNIQUEMENT dans le futur sandbox

Les fonctions serveur déjà installées contiennent **six vérifications**
d'origine exacte sur le site de production :

| Module | Vérifications Origin | Statut |
|---|---:|---|
| S2-B — création classe | 1 | Ne pas modifier la production |
| S3-A — enseignant : rattacher/statut | 2 | Ne pas modifier la production |
| S3-B — élève : rattacher/statut | 2 | Ne pas modifier la production |
| S3-C — affectation : écriture | 1 | Ne pas modifier la production |

La future création du sandbox exigera une revue des **migrations initiales
et de leurs dépendances**, puis une **configuration SQL spécifique au projet
test** pour ces 6 verrous, conservant tous les contrôles
`auth.uid()`, `school_admin`, RLS, isolation des écoles,
privilèges SQL et journal d'audit.

**Interdictions :**
- ne pas appliquer de migration « sandbox » au Supabase principal ;
- ne pas éditer/réexécuter les migrations canoniques déjà appliquées sur
  la production ;
- ne pas modifier le SQL pour accepter `localhost`, `*.vercel.app`
  ou toute origine arbitraire ;
- ne jamais utiliser `Origin` comme seul critère d'autorisation ;
- ne pas utiliser une clé administrative dans React.

Le protocole d'adaptation SQL, la vérification des 6 fonctions et leur
recette RLS feront l'objet d'un **lot distinct soumis à autorisation**.

## 6. Étapes futures, chacune soumise à autorisation

**Phase T1 — Provisionner un bac à sable :** nouveau projet Supabase
physiquement distinct et nouveau projet/application Vercel distincte ;
vérifier quotas et accès, définir le domaine exact, Auth URL/redirect
whitelist, e-mails de test et fonctions externes. Isoler Storage,
Edge Functions et secrets propres au test. Ne pas pointer les flux de
messagerie, paiements ou notifications vers de vrais destinataires.

**Phase T2 — Reconstruire schéma et données factices :** faire l'audit des
migrations de SCHOOLNET, tenir compte des changements Supabase
(la mise à disposition Data API des nouvelles tables n'est pas implicite),
restaurer uniquement des fixtures synthétiques ; prévoir une sauvegarde
et une restauration testée du **bac à sable**.

**Phase T3 — Autoriser l'écriture sandbox sous contrôle :** ajouter un
couple « domaine test exact + URL base test exacte » dans une configuration
de test isolée et vérifier que le code de production ne peut jamais
activer cette branche. Adapter seulement les fonctions SQL du bac à sable ;
tester les refus d'accès et les cas négatifs (notamment Preview, rôle,
élève hors établissement, matière inactive).

**Phase T4 — Recette métier réelle R06–R28 :** utiliser les comptes
synthétiques `ADMIN_A`, `ADMIN_B`, élèves, enseignants, parent
et parcours sans e-mail du plan E2E. Préserver l'historique et les
journaux et contrôler le nettoyage de la base test.

**Phase T5 — Décision métier :** seulement après signatures et nouvelles
autorisations, envisager une promotion ciblée des changements sur
production. La présente phase ne donne aucune permission de le faire.

**Attention aux automatisations existantes :** un commit sur cette branche GitHub
peut déclencher automatiquement une Preview du projet Vercel actuel,
même si nous ne demandons aucun déploiement. Aucune nouvelle ressource
Vercel, aucune promotion vers Production, aucun changement de variables
Vercel et aucune publication manuelle ne sont autorisés ici.

Le plan E2E détaillé est
`docs/releases/SCHOOLNET_RECETTE_E2E_S2B_S3C_PREPARATION_2026-11-18.md`.
Les 28 scénarios et les règles d'isolation existants restent la référence.

## 7. Recette GitHub autorisée maintenant (sans réseau)

Depuis PowerShell dans le dossier Schoolnet :

```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:sandbox:prepare
npm run qa:e2e:readiness
npm run lint
npm run build
```

L'outil de vérification d'un futur fichier local peut être lancé
**uniquement après provisionnement et configuration approuvés** :

```powershell
Copy-Item config/schoolnet-sandbox.env.example .env.sandbox.local
# Renseigner ensuite seulement les valeurs du PROJET TEST autorisé
npm run sandbox:check -- --file .env.sandbox.local
```

Un échec du validateur **bloque**, il ne faut pas le contourner.
Ne pas essayer maintenant de connecter le modèle de test à la production.
Ne pas lancer `supabase db push` ni les RPC mutatrices.

## 8. Critères de sortie de cette préparation

- [x] La politique runtime de production n'a pas été assouplie.
- [x] Les 6 restrictions SQL d'origine de production ont été recensées.
- [x] Modèle .env factice et hors dépôt des secrets défini.
- [x] Validateur fail-closed préparé et tests hors réseau écrits.
- [x] PR n°14 conservée ouverte en brouillon, sans fusion.
- [ ] Tests `qa:sandbox:prepare`, lint et build à confirmer sur Windows.
- [ ] Projet Supabase distinct : **non créé**.
- [ ] Projet Vercel distinct / domaine : **non créé / non déployé**.
- [ ] Comptes synthétiques, données de recette et écriture SQL : **non créés**.
- [ ] RLS et parcours fonctionnel sur base sandbox : **non testés en réel**.

La **production inchangée** et une **recette sans données personnelles**
restent des conditions non négociables.
