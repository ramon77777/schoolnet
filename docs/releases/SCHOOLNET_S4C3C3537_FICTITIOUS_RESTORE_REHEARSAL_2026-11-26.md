# SCHOOLNET V2 — S4-C.3-C.3.5.3.7
## Première répétition d'une restauration indépendante — données fictives uniquement

**Date : 26 novembre 2026 — PR brouillon empilée sur C.3.5.3.6.**

### Point de départ confirmé

La recette Windows précédente **C.3.5.3.6** est validée : branche `local/schoolnet-c3536`, commit `d16be6d`, **10 tests sur 10 réussis**, compilation TypeScript/Vite **934 modules** réussie, dépôt Git propre après nettoyage du cache TypeScript. Les constats de sécurité sur cinq fonctions et les portes DB/Auth/Storage restent documentés, sans modification de Supabase principal.

### Objectif et portée de cette répétition

Le test doit démontrer le fonctionnement **effectif** d'un `pg_dump -Fc` suivi d'un `pg_restore` sur deux instances PostgreSQL **17** indépendantes et jetables, ainsi que la restauration séparée d'**octets fictifs** pour reproduire le problème de Storage. Il ne recopie aucune archive privée et ne se connecte à aucun projet Supabase.

Ce test ne prouve pas une restauration complète du véritable environnement SCHOOLNET : les comptes `mock_auth_accounts` **ne sont pas GoTrue/Auth Supabase**, et les fichiers texte archivés avec `tar` **ne sont pas des objets du service Storage Supabase**. Le dispositif utilise de vrais mécanismes PostgreSQL, mais uniquement sur des données entièrement fictives.

### Exécution réelle par GitHub Actions, et non par le PC Windows

Le job `synthetic-postgres-restore` démarre **deux conteneurs PostgreSQL 17.6 distincts**, en réseaux locaux sur `127.0.0.1:55432` (source) et `127.0.0.1:55433` (cible). Les deux portent un nom de base fictif `schoolnet_synthetic` et un mot de passe de fixture sans valeur hors de la CI. Ils sont détruits automatiquement avec le job.

La commande `tests/s4c3c3537/run-disposable-restore.sh` **refuse de s'exécuter hors GitHub Actions Linux**, et refuse les variables de connexion distante typiques. Elle n'accepte aucun nom de serveur fourni par l'utilisateur : source et cible sont fixées à `127.0.0.1`. Aucune variable ou secret du véritable projet Supabase n'est utilisé.

La fixture SQL `tests/s4c3c3537/disposable-school-fixture.sql` crée exclusivement le schéma fictif `schoolnet_rehearsal`, trois tables simulées (élèves, comptes Auth fictifs, métadonnées Storage fictives), **six policies RLS** et des rôles d'établissement A/B/visiteur. Cinq élèves entièrement fictifs portent des moyennes illustratives, dont un **0,00 valide** et une **moyenne NULL** différente.

### Vérifications fonctionnelles prévues

| Contrôle | Résultat attendu |
| --- | --- |
| PostgreSQL source et cible | 17.x, instances distinctes, cible initialement vide |
| `pg_dump -Fc` / `pg_restore` | Archive binaire valide et restauration avec transaction + arrêt sur erreur |
| Élèves fictifs | 5 lignes identiques et zéro valide distinct d'une note absente |
| Faux comptes Auth | 4 lignes fictives, ne constituent PAS des identifiants GoTrue |
| Permissions restaurées | 3 tables RLS activées et 6 politiques présentes |
| Étanchéité scolaire | A voit 3 élèves A ; B voit 2 élèves B ; A ne voit aucun élève B et réciproquement |
| Visiteur | Aucun droit de lecture des élèves |
| Métadonnées de faux Storage | 2 enregistrements restaurés dans PostgreSQL |
| Octets de faux Storage | Deux fichiers texte restaurés **séparément**, SHA-256 vérifié et concordance avec métadonnées |
| Archive ou blob modifié | Discordance SHA-256 détectée ; le fichier corrompu est rejeté |
| Éléments de production | Aucun, ni URL, secret, note, compte ou fichier réel |

La CI ajoute en parallèle les tests précédents et le build. Le dossier temporaire contenant l'archive et les octets de la répétition est détruit sur le runner ; aucun fichier de sauvegarde n'est ajouté dans GitHub ou publié comme artefact.

### Ce que ce test ne certifie pas

- Aucune restauration de la sauvegarde privée du PC Windows. Ne pas transmettre ou téléverser `D:\SCHOOLNET_BACKUPS_PRIVES`.
- Aucun test de GoTrue Auth réel (sessions, stratégies de chiffrement, identités ou fournisseurs externes).
- Aucune API Storage Supabase réelle, aucun bucket ou policy `storage.objects` restitués.
- Aucune compatibilité garantie entre le vrai dump SCHOOLNET et son schéma/les extensions/les rôles Supabase hébergés.
- Aucune certification de restauration de WAL, de continuité de service, de RPO/RTO ou de reprise après sinistre complète.
- Aucune autorisation de `migration repair`, `db push`, de changement de politiques RLS, de fusion `main` ou de déploiement Vercel.

**Une réussite de ce sous-lot marque seulement la répétition PostgreSQL + octets de stockage fictifs comme fonctionnelle, pas les portes de sécurité de production.**

### Recette Windows à effectuer après CI

Depuis `D:\Bakary\10 autres\schoolnet-tests`, récupérer la branche `feature/schoolnet-s4c3c3537-fictitious-pg-restore-20261126`, puis `npm run qa:s4c3c3537`, `npm run build`, restaurer `tsconfig.app.tsbuildinfo` et vérifier `git status -sb`. **Aucun Docker ni PostgreSQL à installer sur Windows** pour cette vérification : les vrais tests `pg_dump/pg_restore` s'exécutent déjà dans GitHub Actions.

### Portes de restauration à garder fermées

Une future utilisation de la sauvegarde réelle SCHOOLNET exigera un **GO explicite et séparé**, une cible indépendante sécurisée, les contrôles de configuration Auth, la sauvegarde **des octets** Storage et les règles d'isolement des webhooks, des SMS et des e-mails. La restauration sera mesurée et attestée, sans données personnelles publiées dans GitHub.

**AUCUNE restauration réelle, aucune intervention sur Supabase principal, aucun import de données réelles, aucune fusion `main`, aucun Vercel et aucun export de notes réelles.** Le verrou `SCHOOLNET_REAL_EXPORTS_RELEASED = false` reste en place.

Référence officielle : [Supabase — Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
