# SCHOOLNET — Lot 5D-E : concurrence RPC historiques, archives, passerelle Admin (simulation)

**Date :** 18 novembre 2026  
**Statut :** PR #15, **GitHub uniquement**, CI PostgreSQL fictive **réussie**, **recette locale E à effectuer**  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**Production :** aucune intervention sur Supabase principal, `main` ou Vercel.

## 1. Mandat et règles

L'utilisateur a autorisé la phase 5D-E sur la branche actuelle :
vérification des conflits entre les anciennes inscriptions et une bascule,
préservation des archives/familles/classes, préparation d'une passerelle
Admin sécurisée, tests **exclusivement en environnement isolé**, workflow.

- Les consultations Supabase principal sont des `SELECT` uniquement.
- Les fichiers SQL sont sous `supabase/proposals/` et portent **SANDBOX_ONLY**.
- Les appels en écriture des scénarios ont lieu **uniquement** sur les services
  PostgreSQL 17 éphémères de GitHub Actions, avec données fictives.
- Le nouveau code Admin est dans `scripts/lot5d/` et **n'a ni HTTP,
  ni client Supabase, ni connexion SQL réelle** ; aucun endpoint n'est créé.
- La PR #15 reste **brouillon**, aucune migration n'a été installée,
  ni `main` fusionné, ni Vercel déployé.

## 2. Constat confirmé sur le schéma et le code existants

Le 18/11, les requêtes `SELECT` sur le projet `anttmbhaphkhmkoqsofd`
et la lecture de `pg_get_functiondef` établissent :

| Domaine | Observation réelle | Vigilance |
| --- | --- | --- |
| Calendrier | 43 migrations ; 2025–2026 courante, 1 actif ; 2026–2027 non courante, 1 actif | La destination a un dossier **d'un autre apprenant** ; interdit de basculer sans décision métier |
| `admin_upsert_student_enrollment` | Lit `sy.is_current` en déterminant la classe/année **avant** le premier verrou d'écriture ; `UPDATE/INSERT student_enrollments`, `DELETE/INSERT class_students` et éventuellement `profiles.class_name` | Risque d'utiliser une valeur `is_current` devenue obsolète après une bascule concurrente |
| `admin_set_student_enrollment_status` | `FOR UPDATE OF se` sur le dossier, puis contrôles de l'année, écriture du statut et parfois appel à l'upsert | Risque d'ordre de verrouillage incompatible avec le finaliseur année-d'abord |
| `admin_upsert_student_enrollment_with_gender` | Appelle l'upsert central et peut modifier une donnée de profil | Le correctif de l'upsert doit aussi couvrir son appel par ce wrapper |
| Privilèges des RPC historiques | Les trois fonctions ont `EXECUTE` pour `anon` et `authenticated` mais les fonctions centrales vérifient `is_admin()` | `GRANT` ne démontre pas une exploitation. Ne pas retirer les droits globalement sans audit métier |
| `class_students` | `authenticated` a des privilèges DML soumis à RLS ; les classes sont uniques par apprenant et par année selon trigger | Une suppression directe autorisée par policy pourrait détruire un lien historique en absence d'un garde post-clôture |
| Bulletins `report_cards` | 1 bulletin au compteur, références d'élève/classe/année, snapshots de noms, contraintes d'intégrité | Ne jamais remplacer les clés de classe/année ni supprimer un bulletin pendant 5D |
| Familles `parent_links` | 2 liens présents, clé unique parent-enfant | Ne pas supprimer ni recréer les liens familiaux lors des réinscriptions |
| Documents `student_enrollment_documents` | 0 document actuel ; FK vers `student_enrollments` avec `ON DELETE RESTRICT` | Conservation des anciens IDs d'inscription ; scénario testé avec une pièce fictive |
| Historique `student_enrollment_events` | 4 événements réels | Laisser les triggers enregistrer la clôture et l'inscription cible ; jamais effacer les anciens |
| `class_students` | 2 liens existants | Conserver l'affectation de l'année source ; ajouter une nouvelle classe seulement pour l'année cible |

**Nuance importante :** le mode `FOR UPDATE` de la RPC de statut ne
verrouille **pas** la table `school_years` en premier. Une simple
transaction dans le nouveau finaliseur ne suffit pas à prouver l'absence
de **lecture obsolète** ou de **deadlock** avec les RPC historiques.
Il faudra auditer aussi toute écriture directe via RLS et les autres RPC.

Les interfaces Parent `ParentChildren.tsx` et
`parentChildViews.ts` s'appuient sur les liens parentaux vérifiés
et les lignes `class_students`, notamment leur ordre
`created_at` pour la dernière classe connue. L'historique reste
disponible, mais **« dernière classe connue » n'équivaut pas toujours
à « classe active de l'année courante »**. Les bulletins sont rattachés
à une période, une année et une classe distinctes : revoir les écrans
Parent et Enseignant avant d'ouvrir la bascule réelle.

## 3. Garde-fous proposés — uniquement en sandbox

### A. Barrière de lecture avant toute modification d'inscription

`scripts/lot5d/legacy_rpc_guarded_fixture_postgresql17.sql` reproduit
**partiellement et synthétiquement** les trois fonctions historiques.
Le correctif d'ordre de verrouillage à soumettre plus tard prévoit :

1. Vérifier le rôle Admin côté serveur.
2. Acquérir `LOCK TABLE public.school_years IN SHARE MODE`
   **avant de lire** `sy.is_current` ou de verrouiller un dossier élève.
3. Calculer l'état de l'année **après** acquisition du verrou.
4. Faire l'inscription, la synchronisation et les écritures du profil,
   en une transaction cohérente.

Cela impose un ordre **année avant dossier** compatible avec celui
du finaliseur 5D, qui acquiert un verrou incompatible
`SHARE ROW EXCLUSIVE` sur `school_years`.

**Cette protection n'est pas appliquée aux anciennes RPC réelles.**
Le fichier sandbox est une représentation partielle et n'est
**pas un remplacement à copier en production**. Une migration canonique
devra conserver toutes les signatures, validations, retours, effets
de bord autorisés et droits existants, avec revue de deadlocks.

### B. Protection des archives après finalisation

`supabase/proposals/20261118_schoolnet_lot5de_history_guards_SANDBOX_ONLY.sql`
prépare deux triggers privés :

- `trg_lot5de_freeze_closed_year_enrollment` : rejette la création,
  modification et suppression d'un dossier d'une **année source**
  possédant déjà un run 5D.
- `trg_lot5de_freeze_closed_year_class_link` : rejette la création,
  modification ou suppression d'une affectation classe-élève historique
  liée à cette année source.

Les nouvelles inscriptions de l'année **cible courante** restent autorisées,
et les historiques ne peuvent être modifiés après clôture par
une ancienne RPC Admin ou une écriture directe. Les éventuelles
corrections d'archives nécessiteront un **circuit exceptionnel audité**,
à définir avant l'installation. Les fonctions de triggers sont
`SECURITY DEFINER` dans le schéma privé, sans `EXECUTE`
accordé aux rôles API.

Ces fichiers **ne sont pas des migrations installables séparément** :
la version finale devra réunir 5D-A+B+D+E et réussir une recette
sur schéma fidèle, avant autorisation de toute installation.

### C. Passerelle Admin — prototype de simulation seulement

`scripts/lot5d/admin_gateway_dryrun.mjs` prend des **adaptateurs fictifs**
`verifyAuthToken`, `findProfileById`, `mockDbTransaction`.
La simulation illustre :
- refus si mode non isolé, base/host inconnus ou préconditions absentes ;
- refus de session non vérifiée, profil non Admin global, origine
  non autorisée ou requête contenant `actorId`, `role` ou nom de fonction ;
- action SQL mappée côté serveur uniquement, acteur issu de
  l'identité validée, refus en cas d'échec de transaction ;
- aucune donnée SQL brute ou sensible renvoyée au navigateur.

**Ce prototype ne met pas en œuvre l'authentification réelle.**
La vraie passerelle devra vérifier la session via Auth,
les rôles via la base, les protections CSRF/origine, le débit,
les permissions SQL privées et le journal d'opération. Elle ne
devra pas accorder `EXECUTE` au rôle `authenticated` sur les fonctions
de finalisation. Le backend réel n'est **pas** livré dans ce lot.

## 4. Tests réels de concurrence, sans donnée de production

[GitHub Actions — run #44329876560](https://github.com/ramon77777/schoolnet/actions/runs/44329876560)
: **3 jobs SUCCESS**, commit `40b2565`.

| Test | Résultat CI | Portée |
| --- | --- | --- |
| Job qualité : `qa:lot5d:e` | **20/20** | Refus des requêtes et de la fausse identité, mock Admin, garde SQL, absence de déploiement |
| PG17 classique 5D-A+B+D | **SUCCESS** | 18 cas SQL, 2 sessions, permissions, RLS de fixture et garde classe unique |
| PG17 5D-E — nouveau job isolé | **SUCCESS** | Ancienne RPC simulée en concurrence avec finaliseur, gel des archives après run, réinscription cible autorisée |
| Cas historiques supplémentaires | **11 assertions SQL** | Parent, bulletin, document, ancienne classe, refus des modifications de l'année clôturée |
| Déploiement Supabase / Vercel | **AUCUN** | Aucune connexion aux bases réelles ni déploiement |

Dans le nouveau job, la session A finalise et garde sa transaction ouverte.
La RPC legacy **simulée et équipée du verrou en lecture** attend avant de
consulter l'année ; la session B reçoit `lock timeout`.
Après le commit A, une nouvelle inscription dans l'année courante est
`active`, sans doublon et sans modifier les archives synthétiques.

**Limites :** ce résultat teste un **modèle corrigé** des anciennes
fonctions, pas le code historique exact de production. Les scripts ne
démontrent donc **pas** que le serveur principal est déjà protégé.
Les transactions isolées et la proposition de guards restent à
consolider et à vérifier sur une **copie fidèle** avant toute activation.

## 5. Prochaine recette locale et décisions

L'utilisateur doit récupérer la branche puis lancer ces tests **sans SQL** :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:e
npm run lint
npm run build
git status --short
```

**Attendu : `qa:lot5d:e` 20/20**, lint 0 erreur avec avertissement
React Hook connu, build réussi. Les scripts locaux non suivis doivent
rester intacts. En cas de conflit Git, s'arrêter et transmettre
le message ; **pas de `git clean`, `reset --hard`, `supabase db push`**.

Après ce GO local, resteront à décider séparément :
1. La qualification métier du dossier actif 2026–2027.
2. Le traitement des archives et de la classe affichée côté Parent/
   Enseignant après passage annuel ; pas de suppression d'historique.
3. La préparation des RPC legacy **complètes** protégées par la barrière
   année d'abord, avec tests de courses croisées sur une copie de schéma.
4. La vraie passerelle Admin (choix d'hébergement, auth, session, rôle
   SQL dédié et audit), sans exporter les secrets vers Vite.
5. La migration **canonique consolidée**, le préflight, la sauvegarde,
   les tests ROLLBACK, et **un autre accord explicite** avant installation.
6. Enfin seulement, validation PR, fusion `main` et publication sur
   le **Vercel SCHOOLNET existant** après accord distinct.

**INTERDITS ACTUELS :** modifier les années ou inscriptions réelles,
installer les propositions SQL `SANDBOX_ONLY`, activer le flag
`VITE_SCHOOLNET_LOT5D_WRITES_ENABLED`, fusionner `main`
ou publier Vercel avant GO explicite.
