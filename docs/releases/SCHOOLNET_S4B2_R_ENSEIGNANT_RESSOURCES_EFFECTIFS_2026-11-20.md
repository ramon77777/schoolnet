# SCHOOLNET V2 — S4-B.2-R : Ressources et effectifs enseignant

**Date : 20 novembre 2026**  
**Base :** `main` `73bcbc394af44764b70cf2d18aef50e0cca1ddbf`  
**Statut :** migration SQL installee sur Supabase principal le 20 novembre 2026 (`20261120104039`), fonctions et permissions verifiees. Publication et fusion de la PR n° 21 autorisees, en cours de livraison.

## Constat verifie en lecture seule

Sur le cours « Mathematiques 6e A — Test SCHOOLNET V2 » :
- deux ressources existe en base : une dans le chapitre « Les nombres
  entiers », une sans section (« Ressources generales ») ;
- une seule ressource etait comptee dans la page enseignant ;
- un élève est officiellement affecte a la classe 6e A ;
- **aucun élève** n'est inscrit individuellement via
  `course_enrollments` pour ce cours ;
- la progression V1 `student_progress` est independante des
  affectations scolaires.

Ces chiffres n'impliquent aucune erreur de l'affectation ; seul
l'affichage enseignant doit distinguer les deux modeles.

## Correctif ressources (frontend uniquement)

Le detail enseignant reconstruit le compte **sur toutes les ressources
du cours** (`resources`), et non sur le seul sous-ensemble dont
`section_id` pointe vers un chapitre.

Trois zones :
- « Sections / Chapitres » : ressources associees a une section valide ;
- « Ressources generales » : ressources sans section ;
- « Ressources a verifier » : section absente du cours courant.

Les ressources liees a un chapitre inexistant ne sont **pas presentees
comme accessibles aux eleves** : les RPC S4-B.2 preservent leurs
propres restrictions. Les URLs et fichiers ne sont pas modifies.

## Correctif effectifs (fonction de lecture complementaire)

Proposition SQL de reference :
`supabase/proposals/s4b2r_teacher_course_class_summary.sql`.
Migration suivie et deja appliquee sur Supabase principal :
`supabase/migrations/20261120104039_schoolnet_s4b2r_teacher_course_class_summary_20261120.sql`.

Deux fonctions uniquement :
1. `schoolnet_private.teacher_course_class_summary(p_course_id)` :
   `SECURITY DEFINER`, `search_path=pg_catalog`, identite
   `auth.uid()` et role enseignant de `profiles` verifies.
   Exige la propriete du cours V1. Pour renvoyer un effectif officiel,
   exige de plus : ecole, cours, lien et affectation enseignant actifs,
   appartenance enseignante active, meme classe, annee, matiere et niveau,
   aucune matiere V1 incompatible. Les eleves sont comptes une seule
   fois, seulement si leur affectation, appartenance a l'ecole et role
   `student` sont actifs.
2. `public.schoolnet_teacher_course_class_summary(p_course_id)` :
   facade `SECURITY INVOKER` ; revocation explicite de `PUBLIC` et
   `anon` ; droit uniquement aux comptes `authenticated` avec
   controle autorisation dans le helper.

Reponse strictement agregee :
`{ "courseId": "<id>", "isOfficial": true, "officialStudentCount": 1 }`.
**Aucun identifiant, nom, resultat, email ni autre information sur les
eleves n'est retourne.**

Si un cours libre n'a pas de rattachement actif, la fonction retourne
`isOfficial=false` et `officialStudentCount=0`. Si la fonction
n'est pas encore active sur le serveur, l'interface affiche un
indicateur indisponible (« — ») et un message clair,
**jamais un zero officiel invente**.

## Affichage enseignant

En-tete du cours :
- « Ressources (total) » : toutes les ressources enregistrees ;
- « Eleves officiels » : compteur securise, ou « — » tant que
  la RPC n'est pas installee/autorisee ;
- « Inscriptions V1 » : ancien compteur d'inscriptions individuelles ;
- « Progression V1 » : ancienne moyenne de progression,
  non rebaptisee en progression de classe.

Panneaux distincts « Eleves de la classe officielle » et
« Inscriptions individuelles (V1) », avec bouton pour actualiser
le compteur officiel si la situation scolaire change.

Aucune requete directe sur
`schoolnet_school_student_class_assignments` dans le navigateur.
Aucune inscription, notation, progression ou ressource nouvelle.

## Garde-fous et recette

- `npm run qa:s4b2-r` : 20 tests de regroupement des ressources,
  de validation du JSON, de separation V1 / V2 et de contrat SQL.
- Les 39 tests existants S4-B.2 sont conserves.
- `npm run lint` et `npm run build`.
- Scenario multi-ecoles A/B dans le Supabase **jetable** GitHub Actions,
  avec refus interetablissements, role parent/eleve/admin/anonyme,
  revocation d'une affectation eleve et d'un lien de cours.
- Rollback dedie : `supabase/verification/s4b2r_teacher_course_class_summary_rollback_manual.sql`.
- Verification que les cours libres, leurs inscriptions
  `course_enrollments`, leurs progressions et les RPC S4-B.1/S4-B.2
  continuent de fonctionner.

**Activation SQL autorisee et realisee** le 20 novembre 2026 (migration version `20261120104039`). Controle effectue : fonction publique `SECURITY INVOKER`, helper prive `SECURITY DEFINER`, `search_path=pg_catalog`, EXECUTE reserve a `authenticated`, aucun droit `anon`. Lecture autorisee du cours Mathematiques 6e A : `officialStudentCount=1`, sans donnee nominative. Donnees existantes verifiees : 2 ressources et 0 inscription V1 pour ce cours. La fusion GitHub et la publication Vercel sont autorisees dans la presente livraison.
