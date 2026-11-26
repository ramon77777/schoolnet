# SCHOOLNET V2 — S4-C.3-C.3.5.3.3
## Réconciliation des migrations et préparation d'une sauvegarde/restauration vérifiable

**Référence :** 26 novembre 2026 · **Statut :** PR en brouillon / aucune écriture hébergée autorisée.
**Dépendance :** S4-C.3-C.3.5.3.2 (PR #46, commit Windows validé `941358a`).
**Source figée :** `tests/s4c3c353/migration-reconciliation.manifest.json`.
**Registre de blocage :** `tests/s4c3c3533/recovery-readiness.json`.

### 1. Constat vérifié (pas une migration restaurée)

L'historique distant consulté en lecture seule comporte **62 versions** ; le dossier Git `supabase/migrations` du commit de référence contient **54 fichiers**. Il existe **10 versions de l'historique qui n'ont pas de migration Git correspondante**, et **2 fichiers Git absents de l'historique distant**. Ces chiffres sont une photographie du 26/11/2026, non une surveillance permanente.

- **9 groupes sur 10** ont des propositions SQL candidates vérifiées par empreinte Git (10 fichiers candidats), mais **aucune identité avec les octets SQL exécutés n'a été prouvée**.
- La version `20261113124329` (sécurisation des élèves sans e-mail, 13 novembre) n'a **aucune source SQL originale certifiée**. Les propositions `REVIEW_ONLY` ultérieures ne sont pas une preuve équivalente.
- Les versions Git `20261109140104` et `20261110090000` n'apparaissent pas dans l'historique consulté ; cela **ne prouve pas** qu'aucun SQL correspondant n'a été appliqué manuellement.

**Conséquence :** aucun fichier candidat ne devient une migration exécutable, et aucune réparation d'historique n'est autorisée. Les propositions C3C3 de moyenne générale restent inchangées et ne sont pas installées sur Supabase principal.

### 2. Preuves nécessaires pour lever l'écart historique

| Objet | Preuve à obtenir | Situation |
| --- | --- | --- |
| 9 groupes candidats | Original d'exécution ou archives fiables, rapprochement par version, revue des différences de définitions et autorisation métier | Non certifié |
| Version `20261113124329` | Script original exécuté ou preuve historique suffisamment probante ; à défaut, conserver la réserve explicite | Source non retrouvée |
| 2 migrations Git uniquement | Inventaire non destructif des objets réels, éventuelles preuves d'exécution manuelle et décision de traitement | Non statué |
| Ensemble du schéma | Contrôle des dépendances, types ENUM, RLS, GRANT, fonctions Auth et API à un instant précis | Compatibilité partielle documentée, pas équivalence intégrale |

Une ligne d'historique distante (numéro/nom) ne contient pas les octets SQL d'origine. Un résultat `pg_get_functiondef` ou une définition de table actuelle peut aider au diagnostic, mais ne certifie pas, à lui seul, tout le script exécuté. Chaque nouvelle preuve doit être datée, reliée à une source contrôlable et examinée avant changement de statut.

### 3. Sauvegardes — couverture à distinguer

Les données SCHOOLNET incluent des mineurs. Il est impératif de conserver séparément les preuves de protection suivantes :

1. **PostgreSQL applicatif :** schémas, données, fonctions, RLS, GRANT, extensions, état des versions et journaux nécessaires, selon la méthode de sauvegarde retenue.
2. **Auth :** comptes, liens d'identité, configuration d'authentification et comportement de restauration ; ne pas supposer qu'un export SQL applicatif couvre les données gérées par Auth.
3. **Storage :** métadonnées ET octets des objets privés. Une sauvegarde de base de données seule **ne sauvegarde pas les fichiers Storage**.
4. **Configuration :** variables sensibles et paramètres des Edge Functions, politiques de publication, domaines, accès et secrets ; inventaire confidentiel sans copier les valeurs dans GitHub.
5. **Restaurabilité :** test sur une cible isolée, contrôle fonctionnel d'identité et de droits, refus A/B, absence de données de production dans les environnements GitHub Actions.

Supabase recommande sur les projets Free des exports réguliers ; les sauvegardes automatiques ont des conditions liées au plan. La commande `supabase db dump` filtre certains schémas gérés, notamment `auth` et `storage` : ses fichiers « roles », « schema » et « data » ne constituent **pas à eux seuls** une restauration intégrale Auth + DB + Storage.

Documentation officielle :
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

**Statut réel au 26/11/2026 :** aucun nouvel export de production effectué dans ce lot, aucune archive Auth/DB/Storage complète ni restauration réelle vérifiée. Les précédents fichiers de taille 0 Ko ne doivent jamais être présentés comme des sauvegardes exploitables.

### 4. Contrôles Windows sans accès à Supabase

Dans un terminal PowerShell, pour **inventorier** les fichiers existants sur le PC, sans rien créer, restaurer, ni transmettre de données privées :

~~~powershell
$backupDir = 'D:\SCHOOLNET_BACKUPS_PRIVES'
Get-ChildItem -LiteralPath $backupDir -File |
  Select-Object Name, Length, LastWriteTime
~~~

Pour une archive approuvée existante, obtenir une empreinte locale sans exposer son contenu (remplacer par un chemin effectivement constaté) :

~~~powershell
Get-FileHash -LiteralPath 'D:\SCHOOLNET_BACKUPS_PRIVES\<archive-verifiee>.dump' -Algorithm SHA256
~~~

Si cette archive est au format PostgreSQL personnalisé (et seulement dans ce cas), la commande suivante **liste** la table des matières, sans restaurer ni se connecter au serveur :

~~~powershell
& 'D:\Program Files\PostgreSQL\17\bin\pg_restore.exe' -l 'D:\SCHOOLNET_BACKUPS_PRIVES\<archive-verifiee>.dump'
~~~

**Attention :** la taille non nulle, le hash et la liste d'objets ne suffisent pas à prouver que la sauvegarde est complète ou restaurable. Ne pas envoyer de copie d'archive ni d'extrait contenant des noms d'élèves ou des données privées.

### 5. Préparation du GO sauvegarde/restauration réelle — NON EXÉCUTÉ

Une opération hébergée ne pourra être préparée qu'après autorisation explicite distincte et définition de :
- la source exacte, la méthode d'export (CLI avec environnement adapté ou méthode alternative revue), le stockage privé chiffré, la durée de conservation et les responsables ;
- les éléments couverts par les exports et les exclusions documentées, notamment Auth et objets Storage ;
- le contrôle de taille, empreinte SHA-256, permissions du répertoire, traçabilité horodatée et seconde copie hors site autorisée ;
- une **cible de restauration indépendante et non productive**, compatible Supabase, avec isolation réseau et accès strictement limité ;
- les contrôles après restauration (objets, comptes techniques appropriés, liens de familles, RLS/GRANT, refus entre établissements A/B, Storage et consultation restreinte) ;
- un plan de retour arrière testé ; aucune restauration dans `anttmbhaphkhmkoqsofd` comme méthode d'essai.

L'environnement Windows historique possède PostgreSQL local, mais la disponibilité de Docker n'est pas acquise. **Ne pas improviser `supabase db dump` ni une connexion de production** pour contourner cette contrainte. Les secrets/URI complets ne doivent pas être placés dans un script, dans GitHub ou dans une capture.

### 6. Ce que prouve la CI de ce sous-lot

La recette GitHub Actions construit uniquement trois lignes fictives dans une base PostgreSQL **17 jetable** du runner, effectue un `pg_dump -Fc` d'un schéma synthétique, vérifie que l'archive est non vide, en calcule une empreinte SHA-256, affiche son inventaire puis restaure ce schéma dans une **seconde base jetable**. Le contrôle compare les lignes, les totaux et vérifie l'absence d'objets SCHOOLNET réels.

Ce test prouve uniquement le fonctionnement de la **méthode de test PostgreSQL avec ces données fictives**. Il ne prouve PAS une restauration de la base hébergée, d'Auth ou des fichiers Storage. Aucune clé Supabase, donnée réelle ni connexion à un projet distant n'est utilisée. La suppression des archives temporaires est prévue, y compris en cas d'échec.

### 7. Portes de décision

| Porte | Situation au démarrage du sous-lot |
| --- | --- |
| Branches et SQL proposés | Isolés ; non fusionnés |
| Original des 10 migrations absentes de Git | Non certifié |
| Les 2 versions Git uniquement | Non arbitrées |
| Sauvegarde réelle vérifiée | Non réalisée |
| Restauration réelle Auth/DB/Storage | Non prouvée |
| Tests de restauration synthétiques | À exécuter dans la CI |
| GO SQL Supabase principal | **NON** |
| GO fusion `main` / publication | **NON** |

Après CI et recette Windows, consigner les preuves dans l'issue #39 puis décider **uniquement de la prochaine action**. La présente préparation n'autorise ni `supabase migration repair`, ni `db push`, ni reprise du sandbox hébergé, ni fusion.

**Workflow utilisateur :** enregistrer sur GitHub → synchroniser `schoolnet-tests` → effectuer les tests Windows → valider → demander explicitement, au moment opportun, les GO nécessaires avant toute fusion ou action hébergée.
