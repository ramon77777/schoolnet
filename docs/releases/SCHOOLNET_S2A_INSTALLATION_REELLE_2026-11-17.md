# SCHOOLNET 2.0 - S2-A : installation controlee sur Supabase principal

**Date :** 17 novembre 2026.  
**Statut :** **S2-A installee et recette PostgreSQL PASS**. S2-B **non installee**.  
**Projet principal :** `schoolnet_2.0` (Supabase).  
**Migration distante :** `20261117123824_schoolnet_s2a_classes_tenant_foundation`.  
**Source GitHub canonique :** `supabase/migrations/20261117123824_schoolnet_s2a_classes_tenant_foundation.sql`.  
**Branche :** `feature/schoolnet-s2a-classes-tenant-qa`, PR #14 **draft**.  
**Lot 5.C :** PR #13 distincte, non fusionnee. Aucune publication Vercel de cette intervention.

## 1. Autorisation et sauvegarde

Le 17/11/2026, l'utilisateur a autorise **l'installation permanente de S2-A sur Supabase principal**, apres explication que la sauvegarde disponible etait **partiellement restauree**, et non une restauration integrale d'un projet Supabase.

Sauvegarde creee en local hors GitHub :

`D:\SCHOOLNET_BACKUPS_PRIVES\SCHOOLNET_AVANT_S2A_20261117_112138.dump`

- `pg_dump` PostgreSQL 17.9 : **code retour 0** ; archive de **1 482 428 octets**.
- `pg_restore --list` : archive lisible.
- Restauration **ciblee** dans la base locale de test `schoolnet_s2a_restore_test_20261117`, via `pg_restore -n public -t classes -t schoolnet_schools -t schoolnet_school_memberships --single-transaction --exit-on-error` : **code 0**, **2 classes, 2 etablissements, 1 appartenance**.
- Restauration brute **complete** sur PostgreSQL Windows : **non validee**, notamment car l'extension Supabase `pg_cron` manque localement.
- **IMPORTANT :** les politiques RLS, fonctions, Auth, extensions et fichiers Storage n'ont pas ete valides par une restauration complete. L'archive locale est une securite complementaire, pas un plan de reprise globale certifie.
- Ne pas televerser cette sauvegarde ni ses journaux vers GitHub.

## 2. Controle du schema AVANT

Sur Supabase principal juste avant l'installation :
- 2 classes historiques, les deux avec `school_year_id` valide ;
- 2 etablissements actifs, 1 administrateur d'ecole actif ;
- RLS `public.classes` activee, 3 policies existantes ;
- absence de `classes.school_id` et `classes.learning_context` ;
- contrainte `classes_unique_per_year` et index
  `idx_classes_unique_name_school_year_id` presents ;
- `schoolnet_private.is_school_admin_for(uuid)` presente ;
- aucune migration S2-A deja enregistree dans l'historique.
- recherches effectuees dans les procedures `admin_upsert_student_enrollment`
  et `generate_report_card` : aucune reference aux NOMS des contraintes retirees.

La proposition source `supabase/proposals/s2_school_classes_tenant_foundation.sql`
etait a la version GitHub SHA de blob
`cf5d9201e6a7fca771f36feee44804147f2ce371`.

## 3. Installation reelle

Via l'outil de migration Supabase, sous le nom
`schoolnet_s2a_classes_tenant_foundation`, avec :
- delai de verrouillage `3s` et delai SQL `30s` ;
- garde-fou de **concordance des effectifs de sauvegarde**
  (2 classes, 2 ecoles actives et 1 administrateur actif) ;
- precontrole strict des policies et contraintes d'origine ;
- migration SQL S2-A existante ;
- controle final des classes historiques, indexes, FK et policies.

**Retour de l'outil :** `success: true`.  
**Historique distant verifie :** version `20261117123824` avec nom
`schoolnet_s2a_classes_tenant_foundation`.

La migration canonique commitee pour les futures installations reprend
le DDL de la proposition S2-A, mais **pas le garde-fou d'effectifs
propres a la production du 17/11** : les environnements vierges ne
doivent pas exiger exactement 2 classes et 2 etablissements.

## 4. Verification du schema APRES

| Objet | Apres installation |
|---|---|
| Classes historiques | **2**, sans `school_id` et avec `learning_context='legacy_unclassified'` |
| Nouvelles classes officielles | **0** (S2-B pas active) |
| Etablissements actifs | **2** |
| Rattachement administrateur actif | **1** |
| Colonne `classes.school_id` | presente, nullable, FK vers `schoolnet_schools(id)` avec RESTRICT |
| Colonne `classes.learning_context` | presente, contrainte de coherente active |
| Index `classes_legacy_level_name_year_idx` | present |
| Index `classes_legacy_name_year_id_idx` | present |
| Index `classes_school_unique_name_year_idx` | present |
| Index `classes_school_filter_idx` | present |
| Policies `public.classes` | **4**, RLS active |
| Ancienne contrainte `classes_unique_per_year` | retiree et remplacee par une unicite partielle legacy |
| Migration historique | **1** entree pour S2-A |

## 5. Recette post-installation - transaction ANNULEE

Depuis la proposition d'essai deja validee avant installation, nous avons
rejoue **sans la migration DDL** les deux suites :
1. `supabase/verification/20261110_s2_school_classes_tenant_rollback.sql` ;
2. `supabase/verification/20261117_s2a_school_membership_revocation_rollback.sql`.

Execution : `BEGIN;` + les suites QA + `ROLLBACK;`.

Cas verifies :
- classes homonymes autorisees dans les deux ecoles distinctes ;
- refus du doublon dans une ecole et doublon legacy ;
- interdiction d'une classe `school` sans rattachement d'ecole ;
- Super Admin voit toutes les classes ;
- Administrateur local A ne voit que les classes de A ;
- Enseignant, apprenant et parent voient les anciennes classes
  mais pas les nouvelles classes privees de A/B ;
- refus d'INSERT, UPDATE, DELETE directs pour l'admin d'ecole ;
- revocation d'appartenance retire immediatement la lecture ;
- suspension de l'ecole retire la lecture ;
- restauration des acces seulement au bon etablissement ;
- refus de lecture anonyme.

**Resultat final apres ROLLBACK :** **2 classes**, **4 policies**,
**2 ecoles actives**, **1 appartenance admin active**.
Aucune fixture QA n'a ete conservee.

**Security Advisor Supabase :** aucun finding ciblant
`classes` ou la migration S2-A dans le controle post-installation.
D'autres avertissements generaux du projet existent (functions
`SECURITY DEFINER`, `search_path`, etc.) et devront etre audites
dans un chantier distinct. Les policy/GRANT de S2-A ne valent
pas securisation de tous les autres modules.

## 6. Synchronisation GitHub / PC local

Migration **canonique** ajoutee sur la branche de PR #14 :

`supabase/migrations/20261117123824_schoolnet_s2a_classes_tenant_foundation.sql`

Il existe **egalement** sur le poste Windows un fichier d'attente
prepare **avant** l'installation :

`supabase/proposals/staged/20261117103321_schoolnet_s2a_classes_tenant_foundation.sql`

Le second est un **ancien brouillon local**, et sa version NE figure PAS
dans l'historique Supabase principal. **Ne jamais le copier vers
`supabase/migrations/`** : cela produirait une deuxieme migration
incompatible / un risque de reapplication.
On peut le conserver hors du dossier actif jusqu'a la prochaine revue.
Ne pas rerun `scripts/prepare-schoolnet-s2a-migration.mjs`.

Mise a jour locale non destructive :

```powershell
git status --short
git fetch origin
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
git log -1 --oneline
npm run lint
npm run build
```

Les scripts locaux non suivis et `tsconfig.app.tsbuildinfo` modifies
restent a conserver (ne pas faire `git clean -fd` ni `git reset --hard`).

## 7. Etape suivante : S2-B

S2-A installe la fondation mais **ne permet pas encore** de creer
des classes depuis le profil administrateur local.

Prochaine intervention sous-lot S2-B :
1. Auditer le SQL deja prepare dans
   `supabase/proposals/s2b_school_class_rpc_and_catalog.sql` et
   `src/features/schools/lib/schoolClassesApi.ts`.
2. Tests de creation/suppression selon annee scolaire, droits JWT,
   etablissement actif, niveau et catalogue.
3. Eviter tous les acces croises aux donnees eleves/enseignants avant
   que les autres tables soient cloisonnees.
4. Tester localement et demander autorisation distincte pour toute
   migration S2-B ou ouverture effective des droits.
5. Pas de publication Vercel sans validation.

## 8. Reprise de conversation

Projet SCHOOLNET, depot `ramon77777/schoolnet`.
Migration **S2-A installee en production Supabase**, version **20261117123824**
et enregistree dans GitHub sur branche
`feature/schoolnet-s2a-classes-tenant-qa`, PR #14 **draft**.
Tests de 5 profils + suspension/revocation/anonyme **PASS**, `ROLLBACK`.
Classes historiques 2, ecoles actives 2, membre admin actif 1.
Sauvegarde `pg_dump` locale et restauration PARTIELLE 2/2/1 verifiees,
mais pas restauration integrale Supabase.
Ne pas installer a nouveau S2-A, ne pas fusionner PR #13 ou PR #14
sans recette et autorisation, ne pas lancer `db push` sans revoir
l'historique de migration.
**Prochain lot : S2-B.**
