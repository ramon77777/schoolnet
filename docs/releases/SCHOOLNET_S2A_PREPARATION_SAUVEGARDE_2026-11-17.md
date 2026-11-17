# SCHOOLNET 2.0 - Lot S2-A : préparation et sauvegarde

**État : PR #14 en brouillon - NON INSTALLÉ EN BASE - AUCUN DÉPLOIEMENT VERCEL.**  
**Date : 17 novembre 2026.**  
**Branche :** `feature/schoolnet-s2a-classes-tenant-qa` ; **base :** `integration/schoolnet-lot5c-local-first`.  
**Prochaine autorisation requise :** l'utilisateur doit approuver séparément toute application permanente sur Supabase principal.

## 1. Objectif et périmètre verrouillé

Rendre possible la distinction d'une classe officielle propre à une école, d'un
groupe indépendant et des classes SCHOOLNET historiques sans établissement
attribué. La proposition S2-A, déjà rédigée et testée, ajoute dans
`public.classes` : `school_id` et `learning_context`, une FK, une contrainte
de contexte, les index uniques partiels legacy/écoles, et une policy RLS
SELECT réservée aux responsables actifs de leur école.

**S2-A ne crée aucun compte, n'affecte aucun élève, n'ouvre aucune écriture
directe à `school_admin` et n'active pas S2-B.**

Les classes existantes gardent `learning_context='legacy_unclassified'`
et `school_id=NULL`. Ne jamais les rattacher artificiellement à une école.

## 2. État de référence vérifié en lecture seule

| Objet | État vérifié le 17/11/2026 |
|---|---|
| PostgreSQL distant | 17.6 |
| `schoolnet_schools` | 2 écoles actives |
| `schoolnet_school_memberships` | 1 administrateur local actif |
| `classes` | 2 classes historiques |
| `classes.school_id`, `learning_context` | absentes |
| `classes_unique_per_year` | contrainte unique présente |
| `idx_classes_unique_name_school_year_id` | index unique présent |
| RLS `classes` | 3 policies existantes |
| SQL S2-A installé | non |
| PR Lot 5.C #13 | ouverte en brouillon / distincte de S2-A |

**Ces effectifs ne sont pas des constantes pour une migration.**
Recommencer le précontrôle si les données ou le schéma changent.

## 3. Recette de sécurité déjà exécutée

Exécution transactionnelle : `BEGIN;` + proposition S2-A + recette de cinq
rôles + recette complémentaire (révocation de l'appartenance, suspension de
l'école, accès anonyme) + `ROLLBACK;`.

**Résultat : PASS.** Après `ROLLBACK` : 2 classes historiques, 2 écoles
actives et une appartenance active conservées, les 3 policies initiales
restaurées, aucune nouvelle colonne ou index S2-A persistant.

Fichiers :
- `supabase/proposals/s2_school_classes_tenant_foundation.sql` ;
- `supabase/verification/20261110_s2_school_classes_tenant_rollback.sql` ;
- `supabase/verification/20261117_s2a_school_membership_revocation_rollback.sql`.

La recette réussie **ne remplace pas une sauvegarde indépendante**.

## 4. Préparer la migration versionnée SANS l'activer

Depuis VS Code, sur la branche S2-A après synchronisation GitHub :

```powershell
git status --short
git fetch origin
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
node scripts/prepare-schoolnet-s2a-migration.mjs
git status --short
```

Le script invoque localement la **CLI officielle** avec
`npx supabase migration new schoolnet_s2a_classes_tenant_foundation`,
vérifie qu'un seul fichier a été créé, y copie la proposition SQL validée et
l'entoure de `BEGIN/COMMIT` et de délais de verrouillage, **puis déplace la
migration vers `supabase/proposals/staged/`**.

Ainsi **aucun nouveau fichier exécutable ne reste dans
`supabase/migrations/`**. Le script ne contacte pas la base distante.
Ne pas exécuter une deuxième fois si une version a déjà été créée ; ne
pas renommer manuellement l'horodatage donné par la CLI.

**Interdictions tant que la sauvegarde et l'accord ne sont pas obtenus :**
`supabase db push`, `supabase migration up --linked`, collage du SQL de
migration dans SQL Editor, fusion dans `main`, promotion Vercel.

## 5. Sauvegarde indépendante : préalable obligatoire

Le projet Supabase Free n'a pas de sauvegarde programmée incluse. GitHub
conserve le code SQL, **pas** les comptes Auth, les lignes PostgreSQL ou
les fichiers Storage.

**Méthode préférée pour cet environnement Windows 11 sans Docker :
installer les outils clients PostgreSQL 17 (ou une version de `pg_dump`
compatible, non antérieure au serveur 17).** Pas besoin de Docker pour
`pg_dump` brut. La méthode Supabase CLI `db dump`, en revanche,
nécessite Docker dans l'implémentation documentée.

1. Installer uniquement les outils clients PostgreSQL, puis vérifier
   `pg_dump --version` et `pg_restore --version`.
2. Dans Supabase **Connect** du projet `schoolnet_2.0`, récupérer
   séparément l'hôte, le port, l'utilisateur et le nom de base de la
   connexion **directe ou session pooler**. Ne transmettre **aucun
   mot de passe** dans ChatGPT ou GitHub.
3. Définir ces paramètres en local, dans PowerShell. Remplacer
   exclusivement les espaces réservés par les valeurs du Dashboard :

```powershell
$env:PGHOST = "<hote de Supabase Connect>"
$env:PGPORT = "<port de Supabase Connect>"
$env:PGUSER = "<utilisateur de Supabase Connect>"
$env:PGDATABASE = "<nom de base de Supabase Connect>"
$env:PGSSLMODE = "require"

$privateDir = Join-Path $env:USERPROFILE "SCHOOLNET-private-backups"
New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $privateDir "SCHOOLNET_pre_S2A_$stamp.dump"

pg_dump --format=custom --no-owner --no-privileges --password --file "$backupFile"
if ($LASTEXITCODE -ne 0) { throw "La sauvegarde PostgreSQL a echoue." }
if (-not (Test-Path "$backupFile")) { throw "Fichier de sauvegarde absent." }
if ((Get-Item "$backupFile").Length -lt 1000) { throw "Archive vide ou incomplete." }
pg_restore --list "$backupFile" | Select-Object -First 20
if ($LASTEXITCODE -ne 0) { throw "Archive pg_dump illisible." }
Write-Host "Archive PostgreSQL creee. Conserver hors du depot GitHub."
```

Le mot de passe est demandé de façon interactive par `--password`.
**Ne jamais stocker de secret ou d'archive de données dans le dépôt.**
Protéger et chiffrer le dossier de sauvegarde.

**Limite importante :** un `pg_dump` brut peut inclure des objets internes
Supabase et ne constitue **pas automatiquement** un plan de restauration
complet sur une autre instance Supabase managée. `pg_restore --list`
vérifie la lisibilité de l'archive, **pas** sa restaurabilité.
Valider la restauration sur une instance PostgreSQL isolée ou réaliser
un second export adapté, avant de qualifier la sauvegarde de restaurable.
La sauvegarde SQL ne contient pas les octets des fichiers dans
Supabase Storage : sauvegarder les objets indispensables séparément.

En cas d'échec de `pg_dump`, de permissions refusées ou de restauration
non vérifiée : **ne pas installer la migration**. Examiner la méthode
de sauvegarde supportée avant de poursuivre.

Documentation Supabase : https://supabase.com/docs/guides/self-hosting/restore-from-platform

## 6. Précontrôle obligatoire avant installation

Confirmer par requêtes **SELECT uniquement** :
- état du projet, liste des migrations, absence des colonnes S2-A ;
- contraintes historiques et index attendus ;
- exactement les policies de classes sur lesquelles la proposition
  est conditionnée ;
- écoles actives, nombre de classes, rôle et affiliation du responsable ;
- absence de dépendance `ON CONFLICT ON CONSTRAINT classes_unique_per_year`
  dans les procédures et chemins d'écriture ;
- sauvegarde réalisée, contrôlée hors GitHub, stratégie de restauration.

**Point d'attention :** des fonctions d'inscription et de bulletin
utilisent `classes` ; elles doivent faire l'objet d'une recette de
non-régression après l'installation. Leur existence ne prouve pas
que les fonctions S2-A exposent déjà les inscriptions scolaires locales.

## 7. Installation future - seulement sur autorisation distincte

1. Valider explicitement que la sauvegarde existe et que l'utilisateur
   autorise l'installation de S2-A sur `schoolnet_2.0`.
2. Déplacer alors le fichier généré `supabase/proposals/staged/<version>_...`
   sous `supabase/migrations/`, sans changer son horodatage ni son texte.
3. Exécuter **cette seule migration S2-A**, en contrôlant le mode
   d'enregistrement de l'historique Supabase ; ne pas appliquer
   automatiquement toutes les migrations en attente.
4. Relever `classes.school_id`, les index, les policies RLS et les
   effectifs de lignes ; tester les rôles `admin`, `school_admin`,
   `teacher`, `student`, `parent`, puis la suspension et la révocation.
5. Tester les anciennes créations de classes et les inscriptions
   scolaires avant d'entamer S2-B.

**Attention au rollback :** avant `COMMIT`, toute erreur annule
la transaction. Après `COMMIT`, ne pas déposer une "migration inverse"
naïve : une restauration ou correction spécifique à l'état réel
doit être préparée et testée. Ne pas écraser de nouvelles classes
officielles créées entre-temps.

## 8. Critères de clôture S2-A

- Aucun élève / compte / invitation / lien familial modifié.
- Deux classes historiques encore `legacy_unclassified` au moment
  de la recette de référence (ou toutes les lignes legacy préservées si
  les effectifs ont évolué).
- Les écoles A et B peuvent posséder des classes homonymes, mais pas
  deux fois la même classe dans une seule école et la même année.
- Aucune lecture inter-écoles ; accès immédiatement révoqué après
  suspension ou retrait de l'appartenance.
- Pas de droits d'écriture directs nouveaux pour `school_admin`.
- Aucune régression sur le Super Admin et les quatre rôles scolaires.
- Validation utilisateur puis passage **S2-B** : fonctions RPC
  sécurisées et formulaire `/app/school/classes`.

## 9. Reprise en cas de changement de conversation

Projet : SCHOOLNET, GitHub `ramon77777/schoolnet`, branche
`feature/schoolnet-s2a-classes-tenant-qa`, PR #14 **draft**.
Lot 5.C dans PR #13 **draft**, publication Vercel distincte.
S2-A : SQL proposé et tests `BEGIN/ROLLBACK` validés ; **non installé**.
Préparation via `node scripts/prepare-schoolnet-s2a-migration.mjs`.
Sauvegarde PostgreSQL restaurable et autorisation distincte exigées
avant toute application durable. Ne pas ouvrir S2-B prématurément.
