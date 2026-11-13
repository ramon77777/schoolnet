# SCHOOLNET — Lot 5.C-B.2 — Étape 2.B : recette Auth locale sécurisée

Date : 13 novembre 2026
**État : script préparé, tests hors ligne réussis, recette Auth en ligne NON EXÉCUTÉE.**

## Pourquoi ce mode de test

Le déclencheur GitHub Actions de l'étape précédente n'a pas pu être créé. La fonction Edge temporaire `schoolnet-auth-sandbox-student-b2b` est **neutralisée** (v2, `verify_jwt=true`, réponse HTTP 410). Le contournement de ce blocage par un workflow alternatif ou une API publique privilégiée n'est pas une solution acceptable.

Le test se déroulera donc sur un PC de confiance avec Node.js 22, depuis le dépôt SCHOOLNET et avec les **clés strictement limitées à la sandbox**. Aucune clé n'est ajoutée au dépôt ni envoyée dans le chat, et aucun e-mail n'est envoyé automatiquement.

## Fichiers

Les nouveaux scripts sont livrés dans l'archive ZIP téléchargeable avec cette conversation ; ils ne sont pas encore ajoutés à GitHub. Extraire uniquement ces fichiers dans la racine du dépôt local SCHOOLNET, sans remplacer les fichiers existants.

- `scripts/schoolnet-student-auth-sandbox-local.mjs` : précontrôle en lecture seule puis recette Auth explicite.
- `scripts/test-schoolnet-student-auth-sandbox-local.mjs` : six tests hors ligne du verrou de projet et du roster.
- `scripts/test-schoolnet-student-identity.mjs` : six tests précédents sur les identifiants SCHOOLNET.

### Scénario couvert par `--run`

1. Vérifier que l'URL égale **exactement** `https://onqlsvphmrqhelislpry.supabase.co`.
2. Refuser le test si `auth.users` ne comporte pas exactement les deux comptes historiques B.3 ; refuser tout rejeu dès qu'un compte B2B est présent.
3. Générer deux liens `invite` pour des alias fixes `@schoolnet.invalid` sans e-mail envoyé.
4. Vérifier les deux liens `invite` via `verifyOtp`, définir des mots de passe aléatoires indépendants et refuser le rejeu des liens.
5. Vérifier l'échec des mauvais mots de passe, la connexion réussie et l'existence de deux sessions distinctes, validées avec `auth.getUser`.
6. Générer et consommer un lien `recovery`, changer le mot de passe du premier, rejeter son ancien mot de passe et le rejeu du lien, puis confirmer que le second peut toujours se connecter.
7. Contrôler que les comptes sont marqués fictifs dans `app_metadata`, utilisent un téléphone familial fictif commun **en métadonnée de test** et ne partagent pas le champ Auth `phone`.
8. En cas d'erreur, s'arrêter sans suppression automatique et **ne pas relancer** le scénario tant que la situation n'a pas été contrôlée.

**Important :** le test de cette étape ne valide ni la connexion composite téléphone + code scolaire, ni le rattachement Parent/Apprenant. Il valide uniquement le comportement de l'Auth de Supabase et la faisabilité des alias techniques en sandbox.

## Tests hors ligne effectués

Exécuté dans le runtime le 13/11/2026 :

```powershell
node --test scripts/test-schoolnet-student-auth-sandbox-local.mjs
node --experimental-strip-types --test scripts/test-schoolnet-student-identity.mjs
```

Résultat : **6/6 nouveaux tests réussis** et **6/6 tests d'identifiants réussis**. En l'absence de variables secrètes, `--preflight` s'arrête avant toute connexion.

## Instructions Windows PowerShell — UNIQUEMENT à l'étape de recette autorisée

Télécharger puis extraire le ZIP fourni dans cette conversation à la racine du dépôt SCHOOLNET : les dossiers `scripts/` et `docs/` se fusionnent sans écraser les fichiers déjà versionnés. Ouvrir ensuite un terminal PowerShell à cette racine, après `git status` et synchronisation prudente de la branche de travail. Installer les dépendances existantes du dépôt avec `npm ci` si nécessaire. Ne pas coller les clés dans la conversation, ne pas enregistrer de fichier `.env` dans Git.

```powershell
$env:SCHOOLNET_SANDBOX_URL = 'https://onqlsvphmrqhelislpry.supabase.co'
$env:SCHOOLNET_SANDBOX_PUBLISHABLE_KEY = Read-Host 'Clé publishable (ou anon) de la sandbox uniquement'
$clePrivee = Read-Host 'Clé service_role de la sandbox uniquement' -AsSecureString
$env:SCHOOLNET_SANDBOX_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $clePrivee).Password
Remove-Variable clePrivee

node scripts/schoolnet-student-auth-sandbox-local.mjs --preflight
```

**N'exécuter la suite que lorsque le précontrôle indique OK et après avoir constaté que la cible est bien la sandbox :**

```powershell
$env:SCHOOLNET_B2B_CONFIRMATION = 'OUI_TEST_SANDBOX_2_COMPTES_FICTIFS'
node scripts/schoolnet-student-auth-sandbox-local.mjs --run

Remove-Item Env:SCHOOLNET_B2B_CONFIRMATION, Env:SCHOOLNET_SANDBOX_SERVICE_ROLE_KEY, Env:SCHOOLNET_SANDBOX_PUBLISHABLE_KEY, Env:SCHOOLNET_SANDBOX_URL
```

Le script masque les identifiants et n'affiche qu'un statut agrégé. Ne jamais partager les liens, tokens, clés, mots de passe ou fichiers de capture du panneau de secrets.

## État des services après la préparation (lecture seule)

- Sandbox `onqlsvphmrqhelislpry` : **2 comptes Auth existants**, **0 compte B2B**, fonction `schoolnet-auth-sandbox-student-b2b` v2 neutralisée.
- Projet principal `anttmbhaphkhmkoqsofd` : **11 comptes Auth**, **1 invitation Parent activée**, **0 invitation Apprenant**.
- GitHub : `feature/schoolnet-student-sans-email`, branche de travail isolée de `main`.

## Suite

Après la véritable recette et le contrôle des comptes fictifs : choisir un domaine technique approprié pour la production, préparer une migration additive dans un schéma privé et concevoir le service de correspondance `téléphone familial + code SCHOOLNET → compte Auth`, avec limitation des tentatives, contrôle d'activation, liaison Parent/Apprenant et révocation. **Aucune modification de la base principale sans validation.**

### Vérification intégrée avec simulateur Auth

Le fichier supplémentaire `scripts/test-schoolnet-student-auth-flow-mock.mjs` exécute le parcours complet contre un **faux service Auth local et sans réseau**, avec deux comptes distincts. Trois tests sont réussis : (i) invitations + indépendance des sessions + rejet des liens consommés + changement de mot de passe ; (ii) refus des domaines `.invalid` simulé ; (iii) arrêt sans modification devant un compte Auth inattendu. Résultat cumulé : **9/9 tests B2B hors ligne réussis**, outre les six tests d'identifiants précédents.

```powershell
node --test scripts/test-schoolnet-student-auth-sandbox-local.mjs scripts/test-schoolnet-student-auth-flow-mock.mjs
```

**Attention :** un simulateur ne prouve jamais le comportement réel de Supabase GoTrue ; le test distant `--preflight`, puis `--run`, reste impératif.