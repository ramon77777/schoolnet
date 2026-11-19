# SCHOOLNET — Lot 5D-I : lecture annuelle Parent, revue documentaire et contrôle des reprises

**Date :** 18 novembre 2026  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**Pull request :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon**  
**CI :** [run #44353622841](https://github.com/ramon77777/schoolnet/actions/runs/44353622841), **8/8 jobs SUCCESS**, tests I **30/30**, compilation Deno, lint et Vite réussis.  
**Recette locale I :** **VALIDÉE LE 19 NOVEMBRE 2026, 30/30** ; cumul A à I **159/159 tests locaux validés** ; Parent 5.C **10/10 séparément**.  
**Production :** Supabase principal en **lecture seule**, `main` non fusionné, Vercel inchangé, aucune fonction Edge déployée, aucune proposition SQL installée.

## 1. Objectif et frontière de sécurité

Le Lot H suspendait la suppression directe des justificatifs dans le navigateur
et conservait le fichier distant en cas de réponse SQL incertaine.
Cela éliminait une voie d'effacement dangereuse **sur la branche de travail**,
mais ne constituait pas une procédure de suppression opérationnelle.

Le Lot I ajoute deux éléments préparatoires distincts et testables :

1. Un véritable **code de fonction serveur de consultation** destiné
   à donner au Parent la classe correspondant aux inscriptions
   actives **de l'année scolaire courante**, uniquement pour ses
   enfants reconnus par les liens familiaux autorisés.
2. Un **registre de demandes documentaires privé** en proposition
   SQL, qui journalise une demande, interdit la double création,
   vérifie l'Admin et le dossier annuel, et interdit une bascule
   d'année lorsqu'une demande reste en cours.

**Aucun de ces éléments n'est disponible en production.**
La fonction Parent n'est ni déployée ni appelée par le frontend
et son interrupteur serveur vaut refus par défaut. La proposition SQL
ne peut s'exécuter que dans une base fictive PostgreSQL 17.

## 2. Lecture annuelle Parent : code serveur, désactivé

### Fichiers

- `supabase/functions/_shared/lot5diParentAnnualRead.ts` :
  cœur de sélection annuel, sans accès réseau ni dépendance SQL.
- `supabase/functions/schoolnet-parent-current-class/index.ts` :
  véritable source Deno Edge Function, avec `getUser` et
  client serveur Supabase pour l'accès de lecture.
- `src/features/parent/lib/parentYearClassProposal.ts` :
  résolveur pur provenant du Lot H, réutilisé sans élargir les droits.

### Déroulement proposé

```text
Parent connecté (JWT Supabase Auth)
   │ POST { "action": "list_current_classes" }
   ▼
Fonction Edge NON DÉPLOYÉE — OFF PAR DÉFAUT
   1. Vérification origin / projet / flag serveur / méthode / JSON
   2. Supabase Auth getUser(jeton), identité réelle vérifiée
   3. Lecture serveur profiles.role = parent, sinon refus
   4. Lecture parent_links WHERE parent_id = identité authentifiée
   5. Une unique année is_current (sinon indisponible)
   6. Inscriptions actives seulement de l'année courante
      et uniquement des student_id de parent_links
   7. Recherche des classes de cette même année
   8. Résolution "current / unassigned / unavailable / conflict"
   ▼
Réponse minimale : student_id, class_name, state, school_year_id
   Pas de dossiers historiques complets, contacts ou parents tiers
```

Le corps JSON **n'accepte aucun identifiant de Parent ou d'enfant**,
aucun rôle ni nom de fonction SQL. Le client `service_role` reste
**exclusivement dans la fonction serveur**, jamais dans `VITE_*`.
La réponse ne contient pas le nom, téléphone, notes ou documents d'un enfant.

Les plafonds protègent contre les chargements inattendus :
100 liens familiaux uniques / 200 lignes annuelles au maximum.
Les lignes d'autres familles ou d'années précédentes sont
ignorées ; les classes non datées pour l'année ciblée ne sont pas
annoncées comme courantes. Les données indisponibles entraînent
`unavailable` et les doublons actifs contradictoires `conflict`.

### Conditions d'activation toujours NON remplies

- `SCHOOLNET_LOT5DI_PARENT_READ_ENABLED` est exigé à `true`
  côté serveur, **mais n'a pas été configuré**.
- L'URL Supabase et l'origine doivent correspondre exactement
  au projet principal et au domaine officiel ; les environnements
  locaux/Preview sont refusés, même si le JWT semble valide.
- Aucun bloc dans `supabase/config.toml` n'active cette fonction ;
  aucun appel `functions.invoke` n'est ajouté à `ParentChildren.tsx`.
- Avant tout déploiement : contrôle de session réellement révoquée,
  limitation persistante des requêtes, protections anti-abus,
  test de familles distinctes avec Auth et RLS sur sandbox fidèle,
  politique de cache, validation du contrat frontend et GO spécifique.

**Attention :** les politiques RLS de lecture des inscriptions
existent déjà mais le rôle `authenticated` **n'a pas le privilège
de table SELECT** sur `student_enrollments`. Le Lot I
**n'ajoute aucun GRANT direct au navigateur**. Seul le serveur
autorisé pourra effectuer cette lecture après validation.

## 3. Demande de suppression documentaire : audit privé sans effacement

### Fichiers

- `supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql`
- `scripts/lot5d/5di_document_review_postgresql17.sql`

Le SQL de proposition ajoute seulement sur une base éphémère :

- `schoolnet_private.document_deletion_reviews`, dont
  `operation_id` est unique et `document_id` ne peut faire
  l'objet de deux demandes concurrentes ;
- `schoolnet_private.document_deletion_review_events` pour la
  trace de l'auteur, de l'opération et de son état ;
- `schoolnet_private.request_document_deletion_review`, une
  fonction **privée**, jamais exposée aux rôles API, qui contrôle
  `auth.uid()`, l'Admin global, la justification, l'année
  courante et le statut du dossier avant d'écrire ;
- un garde sur la transition `is_current=true → false`
  qui bloque le passage d'année si une demande documentaire
  en attente est présente.

### Invariants de reprise vérifiés

1. Le verrou `school_years IN SHARE MODE` est acquis **avant**
   la lecture du dossier, compatible avec les règles de concurrence
   des Lots A–H ; le finaliseur possède un verrou incompatible.
2. Même `operation_id`, même document et même acteur :
   **rejeu idempotent**, sans nouvelle entrée d'audit.
3. Nouveau `operation_id` pour le même document :
   **refus**, pour éviter une double procédure.
4. Un apprenant ou autre acteur non Admin ne peut pas ouvrir
   cette demande ; aucun `GRANT EXECUTE` aux rôles
   `anon`, `authenticated` ou `service_role`.
5. Une demande non résolue bloque la clôture pour éviter
   de figer l'année au milieu d'une opération de conservation.
6. La demande ne supprime **aucune métadonnée**, **aucun objet Storage**,
   **aucune archive** et ne modifie aucun rattachement Parent.

**Limite importante :** ce registre prépare une procédure de
suppression mais **n'effectue encore ni sauvegarde, ni contrôle
d'intégrité réel, ni suppression physique, ni réconciliation**.
Ses états de secours (`needs_review`, `backup_attested`)
sont réservés à un futur flux serveur vérifiant effectivement
la copie privée et son empreinte. Le garde annuel demeure donc
délibérément conservateur et une demande en attente reste
bloquante jusqu'à une résolution ultérieure approuvée.

### Séquence future de conservation (non implémentée)

```text
Admin vérifié → demande tracée + année verrouillée (I, préparé)
  → Copie du fichier dans un espace de rétention privé
  → Lecture de contrôle + comparaison taille / empreinte cryptographique
  → Trace de la sauvegarde vérifiée et état de reprise
  → Autorisation métier distincte et suppression Storage via API serveur
  → Écriture finale atomique du registre et de l'audit
  → Rétention de la copie, reprise idempotente si étape incertaine
```

La suppression physique ne peut **jamais** précéder la preuve
de conservation ; toute panne entre Storage et SQL exige
une reprise, pas un nettoyage aveugle. Une future migration
devra ajouter un protocole de résolution des états et modifier
le finaliseur sous tests concurrents. **Ce flux n'est pas activé**.

## 4. Résultats CI

[GitHub Actions #44353622841](https://github.com/ramon77777/schoolnet/actions/runs/44353622841) :
**8 jobs / 8 SUCCESS**.

- Tests Node `npm run qa:lot5d:i` : **30/30 réussis**, dont
  refus des rôles non Parent, tentative de traversée de familles,
  année inconnue ou double, conflit d'affectations, absence de classe,
  rejets RLS/contrat et garde documentaire.
- Compilation Deno de `schoolnet-parent-current-class/index.ts` :
  **réussie**, sans déploiement.
- Nouveau job PostgreSQL 17 indépendant
  `lot5d_document_review` : **8 assertions SQL** en transaction
  `ROLLBACK`, couvrant Admin, idempotence, double demande,
  refus élève, blocage annuel, intégrité des métadonnées et
  privilèges privés.
- Tests antérieurs A–H, lint, build, vérifications famille
  et PostgreSQL fictif : **SUCCESS**.

Le test SQL reste une **fixture simplifiée**, pas une reproduction
complète de Supabase Auth et Storage ; aucune session réelle, aucun
fichier réel et aucune donnée scolaire du principal ne sont utilisés.

**Tests locaux A–I confirmés par l'utilisateur le 19 novembre 2026 :
159/159, dont I 30/30.** Les tests historiques du
Parent Lot 5.C sont également **10/10 réussis** en local
et comptés séparément ; les essais SQL PostgreSQL 17 sont
eux aussi distincts du total local.

## 5. Réserves et prochaine séquence

- Année 2026–2027 toujours occupée par un dossier actif distinct :
  **bascule réelle interdite sans qualification métier**.
- Finitions documentaires : vraie copie de rétention privée,
  empreinte, suppression via API Storage, transaction privée,
  mécanisme de résolution et scénario de panne au milieu de l'opération.
- Lecture Parent : Auth/session/rate-limit/permissions à tester
  sur un environnement isolé fidèle, puis raccordement UI
  **après un GO distinct**. Le frontend reste historique.
- Vraie passerelle Admin pour la finalisation annuelle :
  non implémentée, seul le contrat mock des lots précédents existe.
- Dossiers, Storage, RLS, triggers, RPC historiques et demandes
  publiques : recette de compatibilité exhaustive nécessaire
  avant toute migration canonique.

## 6. Recette locale — **VALIDÉE LE 19 NOVEMBRE 2026**

Journal transmis par l'utilisateur depuis PowerShell, dossier
`D:\Bakary\10 autres\schoolnet` :

- Branche attendue `feature/schoolnet-lot5d-a-securisation-20261118`.
- `git pull --ff-only` réussi (`c9ad909..cc466e6`),
  **sans conflit**.
- `npm run qa:lot5d:i` : **30/30 tests passés, 0 échec**.
- Test historique Parent 5.C lancé séparément :
  **10/10 réussis**, sans double comptage.
- `npm run lint` : **0 erreur** et 1 warning historique
  `react-hooks/exhaustive-deps` à
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : TypeScript et Vite **réussis**,
  Vite v7.3.1, **868 modules**.
  Avertissements de fraîcheur Browserslist et
  taille du bundle JavaScript non bloquants.
- `git status --short` final : état local **préservé** ;
  modification `tsconfig.app.tsbuildinfo`, trois scripts
  `scripts/schoolnet-student-auth-*.mjs` et
  `supabase/proposals/staged/` non suivis conservés.

**Cumul local Lots 5D-A à I : 159/159.**
Les 10 tests Parent 5.C et les assertions SQL CI
sont des recettes complémentaires distinctes.

Cette confirmation n'autorise pas la mise en production.
La fonction Parent annuelle reste **OFF et non déployée**,
les propositions SQL `SANDBOX_ONLY` restent **non installées**,
et aucune sauvegarde, suppression physique ou réconciliation
Storage réelle n'a été implémentée.
Le dossier actif déjà présent dans la cible 2026–2027
est toujours bloquant pour la bascule scolaire.

**Interdictions maintenues :** aucun SQL sur Supabase
principal, aucune installation `SANDBOX_ONLY`,
aucun `supabase db push`, `supabase functions deploy`,
aucune fusion dans `main` ni déploiement Vercel.
La suite requiert une nouvelle autorisation distincte.
