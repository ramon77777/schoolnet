# SCHOOLNET V2 — S4-C.3-C.3.5.3.8
## Préparation de la cible indépendante de restauration — **AUCUNE RESTAURATION AUTORISÉE**

**Date : 26 novembre 2026.**  
**Nature :** préqualification documentaire, critères techniques et sécuritaires, matrice d'approbations.  
**État :** aucune cible choisie ou provisionnée, aucune archive consultée, aucune base de données restaurée.

**AUCUNE restauration réelle n'a été effectuée ni n'est autorisée par ce sous-lot.**

### 1. Origine et limites de l'autorisation

Après la réussite du sous-lot **C.3.5.3.7** (Windows : branche `local/schoolnet-c3537`, commit **`99943c1`**, **10/10** tests, build 934 modules, Git propre ; GitHub Actions : **138/138** tests et restauration fictive PostgreSQL 17.6), l'utilisateur a donné son **accord uniquement pour préparer la phase C.3.5.3.8**.

Cet accord **ne constitue pas** un GO pour :

- lire, copier, déchiffrer, téléverser, inspecter ou restaurer les archives privées `D:\SCHOOLNET_BACKUPS_PRIVES` ;
- créer un serveur ou projet hébergé, engager des frais, activer une option payante ou modifier les quotas ;
- toucher à Supabase principal, supprimer des comptes, changer Auth, Storage ou leurs règles RLS ;
- exécuter une commande SQL de migration/patch, `migration repair`, `db push`, fusionner `main`, publier Vercel ou ouvrir les exports de notes réelles.

Le seul livrable de cette phase est **un dispositif de décision et de tests statiques**. `SCHOOLNET_REAL_EXPORTS_RELEASED = false` doit rester inchangé. La PR est brouillon et sa branche est interdite de déploiement Vercel.

### 2. Choix de cible indépendant — non encore décidé

Le test précédent avait deux bases indépendantes **dans un même runner GitHub Actions** avec de faux élèves. Pour une archive réelle, cette plateforme CI et ses artefacts/logs sont **exclus**.

| Option à étudier | Intérêt | Prérequis obligatoires |
| --- | --- | --- |
| **A — Hôte ou VM isolé hors ligne** | Données privées maintenues sous contrôle local, sans création automatique de projet cloud. | Cible **différente de la base de production**, stockage chiffré, contrôle d'accès physique et logique, version PostgreSQL et extensions compatibles, capacité et intégrité disque, absence de réseau sortant et désactivation des notifications. |
| **B — Projet Supabase hébergé dédié** | Services intégrés Auth/Postgres/Storage disponibles pour une validation représentative. | **Accord distinct de création et du coût éventuel**, isolation stricte de l'environnement principal, région et durée de rétention approuvées, comptes/clés séparés, SMTP/SMS/webhooks bloqués, règles de confidentialité et suppression vérifiables. |

**Aucune option n'est choisie par défaut.** Même si l'option A peut être hors ligne, une VM sur le même PC et le même disque physique **n'est pas une sauvegarde indépendante du risque matériel**. Elle peut être une cible de recette si l'isolation est vérifiée, mais ne prouve pas la capacité de reprise après perte du PC.

La cible finale doit être approuvée **par l'utilisateur**, avec son identifiant technique consigné en privé et jamais dans le dépôt. Prévoir les ressources et versions **sans les acheter, installer ou réserver** à ce stade. Ne pas utiliser Supabase principal comme destination.

### 3. Conditions de sécurité à remplir **avant de toucher à une archive privée**

1. **Autorisation ciblée :** préciser ce qui est permis (simple `pg_restore -l` sur archive locale, copie chiffrée, restauration DB, Auth, Storage), les intervenants habilités et la période de test ; ne pas extrapoler d'une approbation à la suivante.
2. **Cible prête :** environnement séparé, authentification dédiée, contrôle des droits, disque chiffré, espace suffisant pour archive + restauration + journaux privés, version PostgreSQL et extensions compatibles. Ne pas supposer que `pg_dump` capture les rôles globaux ou les fichiers Storage.
3. **Réseaux et effets externes :** bloquer les sorties non nécessaires, les notifications e-mail et SMS, les webhooks, Edge Functions, CRON et intégrations tierces avant de charger de vraies données. Vérifier les blocages par une recette purement fictive et garder les preuves sans coordonnées personnelles.
4. **Secrets et comptes :** aucun `service_role` réel dans le navigateur, dans la CI, un journal, une capture ou un fichier Git ; ne pas réutiliser les clés de production dans la cible. Neutraliser les sessions/hook Auth et réaliser un plan de rotation des secrets si nécessaire.
5. **Storage :** identifier séparément la source et l'accès autorisés aux **octets réels** des objets, au-delà de `storage.objects`, puis valider les politiques des buckets sur la cible isolée. Ne pas considérer qu'un dump PostgreSQL protège ces octets.
6. **Données personnelles :** accès restreint, aucun affichage nominatif dans les logs, pas de données réelles envoyées vers GitHub Actions, PR, Issues, fichiers de démonstration ou service tiers.
7. **Fin de recette :** déterminer **à l'avance** qui supprime la cible, comment prouver la suppression, la durée maximale de conservation autorisée et le traitement des copies transitoires. Pas de valeur de durée imposée sans accord.
8. **Plan de retour arrière :** le simple fait de restaurer une cible ne démontre pas la réversibilité du projet principal ; une répétition doit être documentée sur une cible dédiée, sans action sur production.

Chaque condition demeure **non validée** dans `tests/s4c3c3538/isolated-target-readiness.json`. Les confirmations ne peuvent pas être déduites automatiquement du passage des tests GitHub.

### 4. Architecture de contrôle de la restauration (à réaliser seulement après les GO)

```text
  Production SCHOOLNET (NON TOUCHÉE)
              │
              │ Aucun transfert dans cette phase
              ╳
  Archives privées sous garde de l'utilisateur
              │
              │ Après GO explicite + canal chiffré approuvé
              ▼
  Cible dédiée, isolée, non reliée à la production
  ├── PostgreSQL compatible : schémas + permissions + RLS + RPC
  ├── Auth contrôlé : comptes, sessions, hooks et clés spécifiques
  ├── Storage contrôlé : buckets + métadonnées + octets
  └── Egress bloqué : e-mail, SMS, webhooks, CRON, Edge Functions
              │
              ▼
  PV de vérification non nominatif, gardé en privé
              │
              ▼
  Suppression contrôlée selon durée approuvée
```

**Attention :** une restauration d'archive PostgreSQL seule peut valider une partie DB ; elle ne couvre pas automatiquement GoTrue/Auth, les configurations hors base, les octets Storage, ni les services tiers.

### 5. Matrice d'essais et preuves d'acceptation futures

| Domaine | Mesure à relever **sans données personnelles** | Critère de réception |
| --- | --- | --- |
| PostgreSQL | Version, extensions nécessaires, noms/signatures/fonctions/RLS/policies/trigger et décomptes agrégés | Aucune absence inexpliquée ; écarts examinés |
| Migrations | Comparaison des 62 inscriptions distantes et des dix SQL historiques SHA-256 retrouvés ; deux versions Git-only à décider séparément | Aucune réparation de registre improvisée |
| Écoles A et B | JWT de comptes **de recette** et permissions classe/matière, révocation, refus A→B | Refus systématique des opérations non autorisées |
| Notes | Uniquement valeurs fictives de vérification : `0,00` différent de `NULL` | Sémantique préservée |
| Auth | Vérification des comptes et hooks sur cible sans emails envoyés, sans session de production | Aucune authentification transférée vers production, intégrations neutralisées |
| Storage | Nombre d'objets, intégrité SHA-256 de fichiers autorisés, buckets et RLS | Octets vérifiés **séparément** du dump DB |
| Notifications | Compteurs de tests factices ; aucune adresse de contact réelle | Aucun e-mail, SMS ou webhook émis |
| Retour arrière | Début/fin, traitement des erreurs et capacité de repartir de zéro sur la cible | Résultat reproductible et documenté |
| Suppression | Procès-verbal de nettoyage et de révocation d'accès | Cible et copies temporaires supprimées suivant le plan approuvé |

Les PV doivent contenir **uniquement** les statuts, métriques et sommes de contrôle permises. Les données scolaires, listes de comptes Auth, secrets, journaux SQL de production et octets d'objets sont interdits dans GitHub.

### 6. Mises en garde techniques issues de la documentation Supabase

- La restauration du **fichier téléchargé depuis le Dashboard**, d'un **dump SQL CLI** et d'une **sauvegarde physique** ne suit pas nécessairement la même procédure. **Identifier le format exact** avant de choisir un outil ; ne pas présumer que `pg_restore` convient à tous les fichiers.
- Les sauvegardes de **base de données** n'incluent **pas les octets** des fichiers de l'API Storage. Il faut traiter la reprise Storage séparément.
- Les mots de passe des **rôles PostgreSQL personnalisés** ne sont pas nécessairement compris dans les sauvegardes quotidiennes ; les rôles, leurs droits et leurs mots de passe doivent être évalués sans réutiliser les secrets.
- Les serveurs de développement locaux Supabase sont des environnements de test, pas des installations prêtes pour la production.
- Les versions des outils (CLI, PostgreSQL, extensions, images) seront **identifiées et figées** avant une future recette ; aucun `latest` implicite ni commande sur `--remote` ou `--linked` en phase préparatoire.

Sources officielles : [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups), [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup), [Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase) et [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### 7. Procédure de décision (non exécutée)

**GO 0 — Préparer les documents : AUTORISÉ dans cette PR.** Créer le manifeste de critères, la matrice d'acceptation, une CI sans accès distant et la recette Windows des fichiers.

**GO 1 — Choisir et éventuellement provisionner la cible : EN ATTENTE.** Approbation explicite de l'option A ou B, du coût éventuel, de l'emplacement, des limites d'accès et de la durée de conservation.

**GO 2 — Examiner ou déplacer une vraie sauvegarde : NON ACCORDÉ.** Doit préciser la source et les seules opérations de lecture éventuellement autorisées. Ne jamais téléverser les archives dans GitHub.

**GO 3 — Restaurer la DB réelle, Auth puis Storage : NON ACCORDÉ.** Une autorisation par périmètre, une cible isolée déjà certifiée, un protocole de neutralisation des sorties et une politique de nettoyage sont obligatoires.

**GO 4 — Toute modification de Supabase principal, fusion `main`, Vercel et export réel : NON ACCORDÉ.** Décisions séparées, même si une restauration indépendante réussit.

### 8. Recette Windows du seul plan préparatoire

Après validation de GitHub Actions, depuis `D:\Bakary\10 autres\schoolnet-tests` sur une branche locale propre :

```powershell
git fetch origin
git switch -c local/schoolnet-c3538 --track origin/feature/schoolnet-s4c3c3538-isolated-restore-preflight-20261126
git log -1 --oneline
npm run qa:s4c3c3538
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
```

Aucun `pg_dump`, `pg_restore`, Docker, Supabase CLI ou transfert d'archive nécessaire sur Windows pour valider cette **préparation**. Le verdict attendu des vérifications est **« plan cohérent, restauration réelle toujours bloquée »**, jamais un faux GO de déploiement.
