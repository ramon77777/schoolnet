# SCHOOLNET V2 — S4-B.1 : rattachement des cours aux établissements

**Date :** 19 novembre 2026  
**Module :** Gestion des établissements → S4-B.1  
**Branche :** `feature/schoolnet-s4b1-school-course-bridge-20261119`, issue de `main` `d00c1eee`  
**Statut :** développement en branche, **SQL non installé sur Supabase principal**, PR en brouillon après publication de la branche.

## Objectif

Réutiliser le moteur de cours, chapitres et ressources pédagogiques de SCHOOLNET V1
pour les établissements, sans dupliquer les modules, recopier les contenus, ni
confondre les cours libres avec les classes officielles.

## Audit factuel au départ

- V1 : `courses` (4 lignes sur le projet réel au 19 novembre), `course_sections`,
  `resources`, `course_teachers` (2 lignes), `course_enrollments` (2 lignes),
  `student_progress` et `course_subjects`.
- V2 : écoles et memberships locaux, classes officielles `classes.learning_context='school'`,
  affectations `schoolnet_school_teacher_subject_assignments` S3-C.
- Au 19 novembre, le projet principal ne contenait **aucune classe officielle**
  ni affectation enseignant/matière active. Il est donc normal que
  le catalogue de cours scolaires reste vide tant que l'établissement
  n'a pas créé ses classes et ses affectations.
- Les fonctions V1 `can_manage_course` et `can_access_course` ont leurs propres
  modèles de privilèges ; **elles ne doivent pas être étendues implicitement**
  aux utilisateurs d'une école à cette étape.

## Contrat B.1

Le SQL candidat `supabase/proposals/s4b1_school_course_bridge.sql` ajoute :

1. **Table privée** `schoolnet_private.school_course_links`, un cours unique
   à une école/classe/année/matière/enseignant/affectation officielle.
   Aucun accès direct `anon` ou `authenticated`, RLS activée sans policy.
2. **Contexte enseignant** `schoolnet_teacher_school_course_context()` :
   uniquement ses affectations actives et ses propres liens.
3. **Rattacher** `schoolnet_teacher_link_school_course(course_id,assignment_id)` :
   seul l'auteur du cours peut l'associer volontairement, s'il possède
   une affectation active dans une école active. Seul le domaine
   `schoolnet-snowy.vercel.app` autorise les écritures (jamais la Preview).
   Les cours archivés, affectés à une autre classe, déjà suivis en V1,
   avec coenseignant externe ou une matière incompatible sont refusés.
   La répétition exacte est idempotente ; un même cours ne peut jamais
   être réaffecté à un autre établissement ou à une autre matière.
4. **Retirer le lien** `schoolnet_teacher_unlink_school_course(course_id)` :
   seul le créateur retire son rattachement ; **le cours V1 et son
   contenu ne sont pas supprimés**.
5. **Catalogue d'établissement**
   `schoolnet_school_course_catalog(school_id)` :
   seulement le responsable `school_admin` autorisé peut voir les cours
   de l'établissement. Les appartenances et affectations révoquées
   en disparaissent immédiatement.

Toutes les façades `public` sont `SECURITY INVOKER`; les helpers
`SECURITY DEFINER` restent dans `schoolnet_private`, avec
`search_path=pg_catalog`, contrôles de rôle et `auth.uid()`, grants explicites.
Aucune policy RLS V1 ni aucun cours réel n'est modifié.

## Interface développée

- `/app/school/courses` : répertoire local des cours rattachés, filtre
  établissement et message clair en l'absence d'affectations.
- `/app/teacher/courses` : panneau « Cours d'établissement » ; enseignant
  choisit une affectation scolaire autorisée puis un cours dont il est
  le créateur ; lien révocable avec confirmation.
- L'interface est en lecture seule sur localhost et Preview. Si la
  nouvelle RPC n'est pas installée, elle affiche un état non activé sans
  casser les cours V1.

## Garde-fous de confidentialité et sécurité

- Les ressources existantes `resources` et chapitres ne sont **pas copiés**.
- Les identités/notes des apprenants ne sont pas exposées dans les nouveaux
  catalogues. Le responsable ne voit que l'enseignant affecté, le titre du cours,
  sa classe, son année et sa matière.
- Aucune inscription automatique des élèves de la classe et aucune écriture
  dans `course_enrollments`, `student_progress`, `courses`, `resources`.
- Le lien n'ajoute **aucun nouveau droit de lecture** sur les cours V1 :
  l'accès école/élèves/ressources nécessite une phase S4-B.2 distincte.
- Une future inscription libre dans un cours lié ne doit pas permettre
  d'ouvrir ses ressources aux autres écoles : les protections V1/RLS
  devront être revues avant d'activer la diffusion officielle aux élèves.
- La sécurité est garantie en SQL, pas seulement par l'origine navigateur.

## Validation

`npm run qa:s4b1` effectue 18 tests statiques et de contrat.
Le workflow `.github/workflows/schoolnet-s4b1-tenant-ci.yml` exécute
l'analyse locale + lint + build ET une recette PostgreSQL A/B sur
**Supabase local jetable** utilisant le SQL S3-C officiel et des
personnes/écoles entièrement fictives.

Scénarios : A/B, admin local, enseignant, élève, anonyme, Preview,
rattachement idempotent, mauvais auteur/classe/matière, anciennes
inscriptions V1, retrait, révocation S3-C, table privée, non-régression
des données V1 et `ROLLBACK`.

**Aucune migration n'est prévue sur Supabase principal sans une autorisation
distincte après les tests et la revue.** Ne pas fusionner ni publier en
production sans GO explicite. La branche ne doit pas remplacer le
dossier local Windows historique de l'utilisateur.

## Reprise S4-B

Après validation B.1, le volet B.2 devra permettre aux élèves
officiellement affectés à une classe d'accéder aux ressources et cours
correspondants, avec un système de permissions par établissement,
sans rouvrir les tables V1 à l'ensemble des utilisateurs.
Le parcours des cours libres restera indépendant.
