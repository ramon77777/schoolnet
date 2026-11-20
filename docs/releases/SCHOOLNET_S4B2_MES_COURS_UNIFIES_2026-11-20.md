# SCHOOLNET V2 — S4-B.2 UX : « Mes cours » unifié

**20 novembre 2026** · Correctif de navigation **frontend uniquement**.
**Branche** : `feature/schoolnet-s4b2-unified-student-courses-20261120`.
**Socle** : S4-B.2 déjà publié, commit `a7b0be2c`.
**Statut** : développement et recette en PR brouillon, aucune fusion ni
publication Vercel sans autorisation distincte.

## Décision validée

L'espace étudiant présente **un seul menu « Mes cours »**, avec :
1. **Cours de mon établissement** : cours liés aux classes officielles
   et aux affectations actives via `schoolnet_student_school_courses()`.
   Aucun élève n'est inscrit automatiquement aux cours V1.
2. **Cours complémentaires** : cours libres du parcours V1 inscrits
   individuellement, progression inchangée via
   `course_enrollments` et `student_progress`.

Les deux onglets sont réunis sur `/app/student/courses`, avec
`?tab=official` et `?tab=complementary` comme liens profonds.

## Comportement

- Un élève ayant au moins un cours officiel est dirigé par défaut
  sur « Cours de mon établissement ».
- Un élève indépendant avec un catalogue officiel vide est dirigé
  par défaut sur « Cours complémentaires ».
- Un paramètre explicite `tab=official` ou `tab=complementary`
  garde toujours la priorité, même si la liste est vide.
- Durant la détermination de la catégorie, une attente de lecture
  du catalogue officiel est visible ; les cours libres ne sont
  pas transformés en cours officiels.
- Plusieurs écoles : cours **regroupés par identifiant d'établissement**,
  puis triés par classe et titre ; aucune fusion accidentelle de deux
  écoles ayant le même nom.
- Le changement d'onglet est une navigation d'interface, pas une mutation
  des inscriptions ou de la progression.
- L'ancien lien `/app/student/school-courses` est **redirigé** vers
  `/app/student/courses?tab=official`, tandis que le lien vers le détail
  `/app/student/school-courses/:courseId` est conservé.
- Le bouton de retour depuis un détail renvoie vers `Mes cours` avec
  l'onglet scolaire sélectionné.
- Le menu latéral ne comporte plus l'entrée séparée
  « Cours de mon établissement » ; « Mes cours » reste actif
  depuis le détail officiel.

## Garde-fous

- **Aucune migration SQL, aucune modification Supabase**.
- Aucune nouvelle permission, aucune mutation `course_enrollments`,
  `student_progress`, `courses` ou `school_course_links`.
- Les RPC S4-B.2 continuent à vérifier les droits sur chaque lecture.
- Les cours complémentaires V1 continuent à utiliser leurs tables et
  leur écran de détail d'origine.
- Les ressources pointant vers un URL de stockage déjà public ne sont
  **pas** rendues privées par ce correctif : le risque connu S4-B.2
  est inchangé.
- Contrôle de non-mélange entre les identités utilisateur lors de la
  restitution du catalogue officiel : l'état est lié à `user.id`.

## Recette prévue

- 16 tests ciblés `npm run qa:s4b2-ui` (navigation, choix initial,
  plusieurs écoles, liens anciens et préservation des parcours).
- 23 tests S4-B.2 existants (contrats + RLS documentées).
- `npm run lint`, `npm run build`.
- Recette A/B en base CI éphémère inchangée.
- Test navigateur Preview : élève scolarisé dans Collège Test Code Auto
  voit Mathématiques dans l'onglet scolaire, élève indépendant voit
  les cours libres ; détail et retour vers le bon onglet.

**Déploiement en production et fusion : uniquement après validation
explicite du résultat de la recette.**
