# SCHOOLNET — Lot 5D-H | Conservation des justificatifs et sémantique des classes

**Date :** 18 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**  
**CI vérifiée :** [run #44349058440](https://github.com/ramon77777/schoolnet/actions/runs/44349058440) — **7/7 jobs SUCCESS**, `qa:lot5d:h` **24/24** en CI, lint et build réussis.  
**Recette locale H :** **VALIDÉE LE 18/11/2026, 24/24** ; total Lots 5D-A à H : **129/129** et tests Parent Lot 5.C **10/10** séparément.  
**Déploiement :** aucun SQL Supabase principal, aucune migration installée, aucune fusion `main`, aucun déploiement Vercel.

## 1. Motif et risques observés

Sur la branche précédente, le formulaire
`src/features/enrollments/components/AdminEnrollmentDocuments.tsx`
supprimait l'objet Storage **avant** la suppression de sa métadonnée
`student_enrollment_documents`. Si le SQL refusait ou échouait,
l'archive aurait conservé une ligne pointant vers un fichier disparu.
La compensation automatique d'un échec de création présentait un
risque analogue : une réponse SQL non confirmée ne garantit pas que
l'INSERT n'a pas été commité.

La lecture **SELECT uniquement** des politiques du serveur principal
a confirmé que le bucket `student-enrollment-documents` autorise
actuellement au rôle `authenticated` une policy `DELETE`
`schoolnet_enrollment_docs_storage_admin_delete` sous contrôle Admin.
La restriction n'est pas liée à une clôture annuelle.
`student_enrollments` ne confère pas de privilège SELECT direct
à `authenticated` alors que plusieurs policies Storage
référencent cette table : **la compatibilité du chemin d'upload et de
download doit être testée dans un environnement Auth/Storage isolé**.
Nous n'affirmons pas qu'il échoue réellement sans test API.

La documentation actuelle de Supabase indique que
`storage.objects` porte les règles RLS Storage ; le SQL sur ses
lignes n'est pas un substitut à l'API d'objets.
Voir [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
et [The Storage Schema](https://supabase.com/docs/guides/storage/schema/design).

## 2. Correctifs d'interface sur la branche, non déployés

### 2.1 Suppression document : refus local explicite

Dans `src/features/enrollments/components/AdminEnrollmentDocuments.tsx` :

- **Suppression directe navigateur retirée** : plus aucun appel
  `storage.remove()` pour un justificatif déjà présent,
  ni `student_enrollment_documents.delete()` depuis ce composant.
- Le bouton devient **« Suppression suspendue »**, désactivé, avec
  une information visible à l'Admin.
- Le téléchargement authentifié reste disponible. Le formulaire de
  dépôt conserve les formats et la limite de 10 Mo existants.
- Aucun endpoint de suppression privé n'est encore disponible :
  **il ne faut pas réactiver le bouton via un simple flag frontend**.

### 2.2 Dépôt et incertitude réseau

`src/features/enrollments/lib/enrollmentDocumentSafety.ts`
introduit `persistEnrollmentDocumentSafely` :

1. Téléversement du fichier via Storage.
2. Enregistrement de métadonnées avec `.select("id").single()`.
3. Confirmation uniquement quand les deux opérations réussissent.
4. Si le téléversement échoue, aucune écriture SQL n'est tentée.
5. Si la confirmation SQL est incertaine, **ne pas supprimer l'objet
   distant**. Effacer la sélection locale et afficher un message
   de vérification administrative, sans prétendre que l'inscription a
   réussi et sans encourager un double dépôt.

**Limite :** cette stratégie privilégie la conservation plutôt qu'une
suppression potentiellement irréversible. Elle peut laisser un
objet privé **non référencé** en cas d'échec réel du registre ;
une future procédure serveur doit le rechercher et le réconcilier,
après journalisation, contrôle des droits, vérification des références
et politique de conservation. Ne pas faire de nettoyage automatique.

## 3. Candidat Storage RLS H — **SANDBOX_ONLY**

[`supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql`](../../supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql)

Le SQL candidat vérifie strictement `schoolnet_lot5d_ci`, PostgreSQL
17 ou plus, l'existence du schéma Storage fictif et de la policy
historique. Dans **cette base jetable uniquement**, il remplace la
policy `DELETE` du bucket par `USING (false)` :

- Les rôles clients, y compris Admin via `authenticated`, ne peuvent
  plus supprimer directement les objets de ce bucket.
- Les policies `SELECT` et `INSERT` ne sont **pas modifiées**
  par le candidat H.
- Les rôles serveur privilégiés peuvent contourner RLS :
  seul un backend Admin privé, audité et testé pourra ultérieurement
  orchestrer une suppression.
- En cas de déclenchement d'un garde ou d'une erreur SQL,
  l'installation fictive est annulée atomiquement.

**Ne jamais exécuter ce fichier dans Supabase principal ni le déplacer
dans `supabase/migrations`.** Son application réelle nécessite de
revoir toutes les policies potentiellement permissives du bucket,
les privilèges des services, la disponibilité des objets Storage et
le parcours de reprise après erreur.

### CI PostgreSQL 17 isolée

Le job `lot5d_storage_hardening` installe un
`storage.objects` **simplifié** avec RLS, sans contacter le service
Storage. Il vérifie l'ancienne possibilité de suppression Admin
**avant** le garde et son refus **après**, la lisibilité des objets,
la poursuite de l'insertion et la conservation de métadonnées pendant
une bascule fictive. Toutes les manipulations expérimentales d'objets
sont dans des transactions **ROLLBACK**.

**Attention :** un `DELETE` sur la fixture n'est pas un appel Storage
réel et ne prouve ni le comportement de l'API, ni celui des objets S3,
ni l'intégrité d'un stockage de production. Cette simulation teste
strictement la décision RLS.

## 4. Parent et Enseignant : information annuelle non falsifiée

### Parent

La page `ParentChildren.tsx` indique désormais
« Dernière classe connue (année non confirmée) » lorsque la
liste historique `class_students` est utilisée.
Une précision rappelle que ce n'est **pas** une confirmation de
l'inscription dans l'année active.

[`src/features/parent/lib/parentYearClassProposal.ts`](../../src/features/parent/lib/parentYearClassProposal.ts)
prépare un **résolveur pur**, non relié à la page :

- seuls les IDs réellement présents dans les `parent_links`
  déjà validés déterminent le périmètre familial ;
- seules les inscriptions annuelles de l'**année courante** au
  statut `active` peuvent établir la classe courante ;
- les années anciennes, `draft`, `completed`, `withdrawn`,
  `cancelled` et les lignes d'autres élèves ne prouvent rien ;
- données non visibles ou année non connue : `unavailable` ;
  doublon actif contradictoire : `conflict`, jamais choix par
  `created_at`.

**Important : le résolveur ne donne aucun droit d'accès.**
Il faudra une RPC **lecture seule**, autorisant l'accès par
`parent_links` au serveur, avant de brancher ces résultats.
La page actuelle ne tente pas un SELECT direct
sur `student_enrollments`, interdit à `authenticated`.

### Enseignant

`src/features/teacher/pages/TeacherClasses.tsx` affiche encore
une liste de classes/élèves codée en dur. Un libellé précise maintenant
qu'il s'agit d'un **aperçu illustratif**, non des effectifs ni
affectations de l'année courante.

Les bulletins et les résultats utilisant déjà des instantanés d'années
doivent continuer à identifier explicitement leur année de référence.
Un écran « Mes classes » réellement connecté nécessitera une lecture
autorisée à l'Enseignant sur ses propres affectations et dossiers actifs,
à tester indépendamment de la branche Parent.

## 5. Tests et preuve GitHub

[Run #44349058440](https://github.com/ramon77777/schoolnet/actions/runs/44349058440) :
**7/7 jobs SUCCESS**. Le job de qualité exécute
`npm run qa:lot5d:h` : **24 tests, 24 réussis** et
`npm run lint`/`npm run build` sans erreur bloquante.
Le nouveau job PostgreSQL 17 vérifie les politiques Storage dans une
base indépendante ; les jobs A à G restent verts.

Les tests hors réseau couvrent la conservation lors des réponses SQL
incertaines, l'absence de suppression navigateur, le maintien du
téléchargement, le refus Storage en RLS, la cohérence des
`parent_links`, l'année active, les statuts non actifs,
les conflits, les informations indisponibles et l'avertissement
Enseignant fictif.

**Cumul A à H : 129/129 tests validés localement par l'utilisateur,
dont H24/24.** Les **10/10 tests Parent historiques du Lot 5.C**
ont également été relancés et réussis localement : ils sont
comptés séparément, tout comme les scénarios SQL CI.
La CI H reste confirmée à **7/7 jobs SUCCESS**.

## 6. Blocages avant toute future activation réelle

1. **Année cible déjà occupée** : un dossier actif d'un autre
   élève existe en 2026–2027 ; décision métier indispensable.
2. **Storage privé** : valider les policies réelles
   (dont le SELECT indirect de `student_enrollments`),
   le comportement API de la policy DELETE, la gestion des objets
   sans métadonnée et la récupération après panne, en sandbox.
3. **Suppression sécurisée future** : définir un workflow serveur
   à privilèges minimaux, avec conservation, audit,
   idempotence et procédure de réparation ; ne pas donner de
   service key au navigateur.
4. **Lectures annuelles** : créer puis tester une lecture Parent
   strictement liée à `parent_links`, et un parcours Enseignant
   fondé sur ses classes réelles avec RLS ; ne pas transformer
   l'affectation historique en inscription courante.
5. **Compatibilité et sécurité** : tester un schéma réellement fidèle
   aux migrations, RLS, Auth et Storage, revérifier les RPC
   historiques, la finalisation des demandes publiques et le
   changement d'année concurrent.
6. **Validation distincte** pour la migration canonique,
   son installation sur Supabase principal, puis la fusion PR
   et enfin le déploiement Vercel.

## 7. Recette locale H — **VALIDÉE LE 18 NOVEMBRE 2026**

L'utilisateur a exécuté les commandes dans
`D:\Bakary\10 autres\schoolnet` et transmis le journal complet :

- `git pull --ff-only` : **fast-forward réussi**
  `20125ba..c9ad909` sans conflit.
- `npm run qa:lot5d:h` : **24 tests réussis / 24**.
- `node --experimental-strip-types --test scripts/test-schoolnet-lot5c-parent-children.mjs` :
  **10/10 tests Parent du Lot 5.C réussis** séparément.
- `npm run lint` : **0 erreur**, 1 avertissement
  `react-hooks/exhaustive-deps` déjà connu
  (`EnrollmentRecordsPage.tsx:161`).
- `npm run build` : **réussi**, Vite v7.3.1,
  **868 modules**. Avertissements Browserslist et
  taille du bundle non bloquants.
- État Git final **inchangé** : `tsconfig.app.tsbuildinfo` modifié,
  trois scripts locaux non suivis et `supabase/proposals/staged/`
  **conservés**, aucun fichier local supprimé.

**Cumul local A à H : 129/129 tests validés** ; les 10 tests
Parent historiques sont séparés de ce chiffre. Les tests
SQL PostgreSQL 17 restent une preuve **CI uniquement sur
des données fictives**.

**Blocages subsistants :** la suppression réelle nécessite
un backend privé, des tests Storage API/permissions sur environnement
fidèle et un mécanisme de réconciliation ; le résolveur Parent
de classe annuelle n'est pas encore connecté à un service autorisé ;
la passerelle Admin est un mock et l'année 2026–2027 possède
toujours un dossier actif distinct.

**Interdictions :** aucune installation SQL sur Supabase
principal (y compris fichiers `SANDBOX_ONLY`), aucun
`supabase db push`, aucune activation du flag d'écriture,
aucune fusion `main` ni déploiement Vercel. Tous exigent
un nouveau GO spécifique.
