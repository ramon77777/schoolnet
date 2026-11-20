# SCHOOLNET V2 — S4-B.2 : cours et ressources des eleves d'etablissement

**Date :** 20 novembre 2026  
**Socle livre :** S4-B.1 / PR n° 18 / `main` `41f1b420`  
**Statut S4-B.2 :** branche de developpement, **proposition SQL non installee**,
PR en brouillon, pas de fusion ni de publication de production.

## Objectif et perimetre

Permettre aux apprenants officiellement affectes a une classe
d'acceder aux cours lies a leurs affectations, puis a leurs chapitres
et ressources existantes. Ne pas recreer le moteur de cours V1,
ne pas importer de cours libres, ne pas inscrire automatiquement des
eleves et ne pas recalculer les progressions, devoirs ou notes.

## Contrat technique

`supabase/proposals/s4b2_student_school_courses.sql` ajoute
**cinq fonctions seulement**, aucune table ni policy :

- `schoolnet_private.student_school_course_access(course_id)` :
  autorisation personnalisee en fonction de **auth.uid()** et du
  role `student` reel dans `profiles`. Exige l'eleve membre
  actif de l'ecole, affecte activement a la classe et l'annee,
  une ecole active, le cours/lien actifs, une affectation
  professeur-matiere active, un enseignant encore affilie,
  une matiere active, la coherence du createur V1 du cours, de sa classe,
  de son niveau, de ses matieres V1 et du role actuel de l'enseignant.
- `public.schoolnet_student_school_courses()` : catalogue
  JSON minimal (titres, etablissements, classes, niveaux de matiere,
  annee, descriptions) ; **aucun nom ni ID d'eleve ou d'enseignant**.
- `public.schoolnet_student_school_course_detail(p_course_id)` :
  valide a nouveau tous les droits pour chaque lecture, puis
  livre les sections et ressources `public_to_course` du cours.
  Les URLs non HTTPS et les ressources privees restent exclues.

Les fonctions helpers restent dans `schoolnet_private` sous
`SECURITY DEFINER`, `search_path=pg_catalog`, avec droits et
contrôles d'identite explicites. Les facades `public` sont
`SECURITY INVOKER`. `anon` est revoque. Aucun `service_role`
n'est utilise dans le navigateur.

## Interface

- `/app/student/school-courses` : carte par cours officiellement
  affecte a l'eleve, avec son etablissement et sa classe.
- `/app/student/school-courses/:courseId` : chapitres et ressources
  visibles, charges exclusivement par la RPC S4-B.2.
- Une entree de navigation et un lien depuis `Mes cours` V1,
  sans toucher au parcours `/app/student/courses/:courseId`.
- Erreur d'acces ou RPC manquante : **pas de fallback** vers
  `course_enrollments`, `courses` ou `resources` V1.

## Limitation importante des fichiers publics existants

L'audit du projet principal montre que le bucket historique
`course-resources` est **public**. Les ressources sont creees via
`supabase.storage.getPublicUrl()`. Le nouveau controle d'acces
protege **la decouverte des URL et des metadonnees** par la RPC ;
il **ne garantit pas la confidentialite d'un fichier deja
accessible par son URL publique**, ni d'une ressource externe.

Ne pas utiliser ce bucket pour les documents personnels d'eleves,
notes, bulletins, pieces d'identite ou donnees scolaires sensibles.
Basculer ce stockage en prive sans etude casserait les cours V1 :
une migration du mode de stockage et de l'acces aux documents doit
etre traitee separement et explicitement autorisee.

## Isolation, tests et validation

`npm run qa:s4b2` : 23 tests de contrat et non-regression frontend.
Le workflow `.github/workflows/schoolnet-s4b2-tenant-ci.yml`
construit une base Supabase **jetable** et teste les ecoles A et B,
les roles, les revocations, les niveaux de visibilite des
ressources, l'integrite du parcours V1 et le rollback.

Apres tests reussis : revue de la proposition SQL, controle du
projet principal **en lecture seule**, puis accord distinct pour
l'installation SQL. La fusion et la publication Vercel necessitent
une seconde autorisation specifique. Les tests avec des eleves
reels seront effectues sans creer d'inscriptions fictives en V1.

## Points volontairement exclus

- Publication d'evaluations/notes officielles par classe :
  lot distinct d'integration pedagogique.
- Ecriture de progression et carnet de notes officiel :
  pas de mutation implicite de `student_progress`.
- Paiements scolaires, vie scolaire et documents officiels :
  lots prevus apres la partie pedagogique.
