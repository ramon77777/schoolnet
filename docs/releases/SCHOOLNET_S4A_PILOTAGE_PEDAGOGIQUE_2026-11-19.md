# SCHOOLNET 2.0 — S4-A : pilotage pédagogique par établissement

**Date :** 19 novembre 2026  
**Module :** Gestion des établissements → S4 — première tranche fonctionnelle.  
**Branche :** `feature/schoolnet-s4a-pilotage-pedagogique-20261119`, créée depuis `main` au commit `2761d738`.  
**Statut :** développement sur GitHub, en attente des tests locaux, de la recette visuelle et de l'accord explicite de fusion/publication.  
**Hors périmètre :** PR #15 (5D-A à N), PR #16 (recette R0), migrations, comptes Auth, écriture PostgreSQL, Storage et déploiements Vercel.

## 1. Audit ciblé du code existant

Les modules S2-A/S2-B/S3-A/S3-B/S3-C existent déjà sur `main`,
avec les quatre routes de l'administrateur local : Classes,
Enseignants, Élèves et Affectations. La sécurité des affectations
S3-C repose sur la RPC
`public.schoolnet_school_assignment_catalog(p_school_id)`,
avec contrôle du rôle **school_admin** et de l'appartenance
active à l'établissement dans `schoolnet_private.assert_s3c_access`.
Le catalogue S3-C ne doit jamais être remplacé par une lecture
directe des anciennes tables pédagogiques.

Les autres modules pédagogiques existent, mais leur liaison
multi-établissements reste incomplète :

| Domaine | Existant | Reste à intégrer dans S4 |
| --- | --- | --- |
| Cours / ressources | `TeacherCourses` et `StudentCourses` lisent les anciennes tables `courses`, `course_teachers` et `course_enrollments` | Séparer explicitement les cours officiels d'un établissement des cours libres ; définir les relations, permissions et parcours |
| Classes enseignant | `TeacherClasses.tsx` affiche encore un jeu de démonstration statique | Connecter à une lecture sécurisée des affectations officielles de l'enseignant, **sans ouvrir la RPC réservée à school_admin aux autres rôles** |
| Évaluations / notes | Modules existants pour enseignants et élèves | Conditionner à l'école, la classe, l'enseignant affecté, l'élève affecté et l'année |
| Présences / emploi du temps / salles | Fonctionnalités historiques déjà disponibles | Séparer les données par établissement avant accès par l'administrateur local |
| Bulletins / documents | Modules historiques présents | Contrôler école, élève, année et accès Parent autorisé ; bloquer les liens Storage trop permissifs |
| LIVE / messagerie | Modules existants | Vérifier la séparation cours libres, groupe scolaire et communications d'établissement |

**Constat Supabase principal en lecture seule :** le 19/11/2026,
le catalogue S3-C existe, deux établissements sont actifs,
**aucune classe officielle S2/S3**, **aucune affectation officielle
élève/classe** et **aucune affectation enseignant/matière** ne sont
enregistrées. Cela ne signifie pas que les anciennes classes ou
cours n'existent pas : **ils ne doivent pas être reclassés ni supprimés**.

## 2. Réalisation précise de S4-A

Une première page de **pilotage pédagogique, consultation uniquement**,
utilise le catalogue tenant-scoped S3-C déjà autorisé.

- Route : `/app/school/pedagogy` ;
- Menu **Administrateur d'établissement → Pilotage pédagogique** ;
- Lien depuis **Mon établissement**, sans modifier les liens S2/S3 ;
- Sélecteur limité aux établissements **actifs et autorisés**,
  issus de `getAdminSchools()` et des permissions Supabase ;
- Lecture de `getLocalSchoolAssignmentsCatalog(schoolId)`
  (RPC S3-C existante, **pas** de SQL nouveau) ;
- Calcul des classes officielles, élèves/enseignants
  **affiliés**, élèves/enseignants **réellement affectés**
  et couples enseignant–matière–classe actifs ;
- Cartes de classes par **année scolaire propre à la classe**,
  avec effectifs et matières affectées ;
- Étapes suivantes clairement signalées, mais **aucun
  raccourci vers des modules legacy non isolés** ;
- Messages distincts pour absence d'école, absence
  de classes officielles, chargement, accès interdit
  et mode démonstration.

**Mesures de confidentialité :** le modèle d'affichage
n'inclut aucun nom personnel d'enseignant ou d'élève.
Les affectations `revoked` et `effective_active=false`
ne sont pas comptées comme actives.
Une classe hors catalogue ou une année incorrecte
n'est jamais incluse. Un catalogue d'un autre
`school_id` est refusé. Les réponses tardives après
changement d'établissement sont ignorées.

**Aucune écriture :** l'écran n'appelle aucune RPC
de création, aucun `insert/update/delete`, aucune
fonction Edge ou route d'une autre école.

## 3. Fichiers du lot

| Fichier | Objet |
| --- | --- |
| `src/features/schools/lib/schoolPedagogyOverview.ts` | Modèle pur d'agrégation tenant-scoped, sans données nominatives |
| `src/features/schools/pages/LocalSchoolPedagogy.tsx` | Page responsive, états vides et sélecteur d'établissement |
| `src/routes/router.tsx` | Route sous `RoleGate allowed=["school_admin"]` |
| `src/layouts/DashboardLayout.tsx` | Nouvelle entrée du menu local |
| `src/features/schools/pages/LocalSchoolDashboard.tsx` | Lien depuis le tableau de bord local |
| `scripts/test-schoolnet-s4a-pedagogy.mjs` | 17 tests hors réseau |
| `package.json` | Commande `npm run qa:s4a` |
| `.github/workflows/schoolnet-quality.yml` | Tests S4-A intégrés dans la CI de la PR |

## 4. Méthode de travail et recette locale

**GitHub → mise à jour locale → tests techniques et visuels →
validation utilisateur → GO de fusion `main` → Vercel → revue en ligne**.

Le dossier principal `D:\Bakary\10 autres\schoolnet`
contient encore des fichiers personnels non suivis ;
le dossier `schoolnet-r0` est réservé à la PR #16.
Afin de préserver les deux, créer un **troisième worktree**
clairement intitulé **schoolnet-s4a**, uniquement si
ce répertoire n'existe pas déjà.

```powershell
cd "D:\Bakary\10 autres\schoolnet"
git status --short
git fetch origin
git worktree add -b review/schoolnet-s4a-20261119 "..\schoolnet-s4a" origin/feature/schoolnet-s4a-pilotage-pedagogique-20261119
cd "..\schoolnet-s4a"
git branch --show-current
npm ci
npm run qa:s4a
npm run qa:s3c
npm run lint
npm run build
git status --short
npm run dev
```

Ouvrir l'adresse affichée par Vite en local (souvent
`http://localhost:5173`). Se connecter uniquement avec
un compte **school_admin** que l'utilisateur est autorisé
à utiliser, puis ouvrir :

1. **Administration d'établissement → Mon établissement** :
   le lien **Pilotage pédagogique · S4-A** est visible.
2. **Pilotage pédagogique** :
   l'établissement de la session est proposé ; aucune école
   non autorisée ne doit apparaître.
3. La page affiche les **compteurs réels** du catalogue
   et, aujourd'hui, l'état « Aucune classe officielle »
   si aucune classe S2/S3 n'a été créée pour cette école.
4. **Actualiser** : pas de faux doublons ni de classes
   historiques requalifiées en classes officielles.
5. Sur un écran étroit : menu et cartes lisibles,
   aucun débordement horizontal.
6. **Rôle non autorisé** : ne pas essayer d'accéder aux
   données d'un autre compte ; la route d'admin local
   est réservée à `school_admin`.
7. Aucun bouton de création d'une nouvelle classe,
   d'inscription ou de mutation n'est présent dans
   **cet écran S4-A**. Les liens menant à S2/S3 existants
   doivent rester fonctionnels et leurs propres garde-fous actifs.

**Ne pas modifier l'année scolaire**, ne pas installer
de migration, ne pas créer de faux élèves ou
affectations sur le projet principal pour « remplir »
cet écran. Des scénarios multi-écoles avec données
synthétiques devront être réalisés ultérieurement
sur une pile jetable autorisée.

Si `npm ci` signale des vulnérabilités npm,
conserver la sortie ; **aucun `npm audit fix --force`**.
Il faudra classer les vulnérabilités avant le GO
de publication, indépendamment des tests fonctionnels.

## 5. Portes de sortie

- **S4-A code et CI** : lint, TypeScript/Vite,
  17 tests spécifiques et non-régression S3-C.
- **S4-A UI locale** : contrôle rôle, état vide,
  sélection autorisée, actualisation et mobile,
  après retour explicite de l'utilisateur.
- **Publication** : revoir la PR et les vulnérabilités
  npm ; demander un nouveau **GO explicite**
  de fusion dans `main` et de déploiement Vercel.
  Une fusion peut déclencher automatiquement Vercel.
- **S4-B** : après clôture de S4-A seulement,
  concevoir le rattachement réel des **cours
  et ressources pédagogiques** aux écoles,
  aux classes et aux intervenants, avec politiques
  RLS et migrations **revues séparément** ;
  ne pas casser les cours libres existants.
- **S4-C à S4-F** : évaluations et notes, présences,
  bulletins, salles/emplois du temps, LIVE et
  communications, selon les mêmes règles multi-écoles.

**Aucun déploiement et aucune modification des
projets Supabase hébergés à ce stade.**


## Mise a jour V5 — 19 novembre 2026 : minimisation de S4-A

La recette S4-A a valide 22 tests locaux et une CI A/B sur Supabase jetable.
Le correctif de confidentialite est soumis a de nouveaux controles en PR #17.

**Nouveau contrat serveur, PREPARE mais non installe sur la production :**
- `supabase/proposals/s4a_school_pedagogy_overview.sql` : RPC
  `public.schoolnet_school_pedagogy_overview(p_school_id)`, lecture seule,
  facade SECURITY INVOKER et agregation SECURITY DEFINER privee,
  protegee par `schoolnet_private.assert_s3c_access`.
- La reponse ne contient que `schoolId`, les 6 indicateurs chiffrés
  et les classes officielles avec effectifs et matieres.
  Aucun nom ou UUID personnel, aucune ligne de journal S3-C n'est transmis.
- `src/features/schools/lib/schoolPedagogyApi.ts` : appel strict a la nouvelle
  RPC ; le format JSON est valide avant affichage.
- `LocalSchoolPedagogy.tsx` : consomme la synthese sans appeler
  `schoolnet_school_assignment_catalog`. Une RPC manquante ou refusee
  bloque l'affichage ; il n'existe aucun fallback de donnees nominatives.
- Les RPC et interfaces S3-C restent INCHANGEES. Les cours libres restent
  strictement distincts des classes officielles.

**Ordre de livraison obligatoire :** recette SQL / tests / revue, validation
explicite de l'installation du RPC S4-A sur Supabase principal, activation
securisee, validation du navigateur, puis accord distinct de fusion et de
publication. A ce stade, S4-A ne doit PAS etre considere installe :
une Preview candidate peut afficher « synthese non encore activee ».
Le nouveau RPC ne doit jamais etre applique par `supabase db push`
sur les migrations historiques deja enregistrees.


## Préparation à l'activation SQL — Workflow V5

Le plan d'installation, le précontrôle de production en lecture seule,
le contrôle après activation et le rollback limité aux deux fonctions
S4-A sont documentés dans
`docs/releases/SCHOOLNET_S4A_PLAN_ACTIVATION_ET_ROLLBACK_2026-11-19.md`.

**Précontrôle principal au 19/11/2026 : `S4A_PRECHECK_PASS`.**
Ce résultat ne vaut pas autorisation d'installer : le précontrôle doit
être refait le jour de la migration. Aucune modification du projet
Supabase principal n'a été réalisée pendant cette préparation.
