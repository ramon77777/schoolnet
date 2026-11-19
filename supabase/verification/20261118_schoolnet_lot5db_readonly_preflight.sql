-- SCHOOLNET 2.0 | Lot 5D-B | INVENTAIRE SQL LECTURE SEULE.
-- Verification de projet uniquement : Supabase principal, JAMAIS une migration.
-- Ne contient QUE WITH/SELECT; aucune alteration des annees ou des dossiers.
-- Parametre de lecture : annee cible 2026-2027, a adapter seulement
-- apres validation expresse de la periode a etudier.
-- Execution facultative lors de la future recette, pas demandee maintenant.
--
-- Important : ce rapport ne constitue PAS un feu vert de bascule.
-- La procedure finale devra interroger les donnees verrouillees cote serveur.

WITH current_year AS (
  SELECT id, name, starts_on FROM public.school_years
  WHERE is_current = true
  ORDER BY starts_on DESC LIMIT 1
),
target_year AS (
  SELECT id, name, starts_on FROM public.school_years
  WHERE name = '2026-2027'
  LIMIT 1
),
context AS (
  SELECT
    (SELECT id FROM current_year) AS source_id,
    (SELECT name FROM current_year) AS source_name,
    (SELECT id FROM target_year) AS target_id,
    (SELECT name FROM target_year) AS target_name
)
SELECT
  ctx.source_name AS annee_actuelle,
  ctx.target_name AS annee_cible,
  (SELECT count(*) FROM public.school_years WHERE is_current) AS nombre_annees_actives,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.school_year_id=ctx.source_id AND e.status::text='active')
    AS dossiers_actifs_source,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.school_year_id=ctx.target_id) AS dossiers_existants_cible,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.school_year_id=ctx.target_id AND e.status::text IN ('active','completed'))
    AS dossiers_cibles_actifs_ou_termines,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.school_year_id=ctx.target_id AND e.status::text='draft')
    AS brouillons_cible,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.school_year_id=ctx.target_id
     AND EXISTS (SELECT 1 FROM public.student_enrollments src
                 WHERE src.school_year_id=ctx.source_id
                 AND src.student_id=e.student_id AND src.status::text='active'))
    AS conflits_meme_apprenant_deux_annees,
  (SELECT count(*) FROM public.student_enrollments e
   LEFT JOIN public.classes c ON c.id=e.class_id
   WHERE e.school_year_id=ctx.source_id AND e.status::text='active'
     AND (c.id IS NULL OR c.school_id IS NOT NULL OR c.learning_context='school'
       OR NOT (c.school_year_id=ctx.source_id OR
         (c.school_year_id IS NULL AND c.school_year=ctx.source_name))))
    AS dossiers_source_hors_legacy,
  (SELECT count(*) FROM public.classes c
   WHERE c.school_id IS NOT NULL
   AND c.school_year_id IN (ctx.source_id,ctx.target_id))
    AS classes_officielles_source_ou_cible,
  (SELECT count(*) FROM public.schoolnet_school_student_class_assignments a
   WHERE a.school_year_id IN (ctx.source_id,ctx.target_id)
     AND a.status='active') AS affectations_eleves_officielles_actives,
  (SELECT count(*) FROM public.schoolnet_school_teacher_subject_assignments a
   WHERE a.school_year_id IN (ctx.source_id,ctx.target_id)
     AND a.status='active') AS affectations_enseignants_officielles_actives,
  (SELECT count(*) FROM public.student_enrollments e
   WHERE e.status::text='active' AND e.school_year_id NOT IN
     (SELECT id FROM public.school_years WHERE is_current))
    AS dossiers_actifs_hors_annee_actuelle,
  (to_regclass('public.school_year_rollover_decisions') IS NOT NULL)
    AS decisions_5d_installees,
  (to_regclass('public.school_year_rollover_runs') IS NOT NULL)
    AS executions_5d_installees,
  (to_regprocedure('public.admin_finalize_school_year_rollover(uuid,uuid,text)') IS NOT NULL)
    AS finalisation_5d_installee,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid='public.school_years'::regclass
      AND t.tgname IN (
        'trg_schoolnet_guard_school_year_rollover',
        'trg_schoolnet_lot5da_block_direct_year_switch'
      )
      AND t.tgenabled='O' AND NOT t.tgisinternal
  ) AS garde_annee_5d_actif
FROM context ctx;
