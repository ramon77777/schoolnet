-- SCHOOLNET B.3 - retour arriere MANUEL (non execute sans autorisation).
DO $guard$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_copies(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B3B3_NOT_INSTALLED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_teacher_official_copies(uuid);
DROP FUNCTION public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text);
DROP FUNCTION public.schoolnet_student_official_published_result(uuid,uuid);
DROP FUNCTION schoolnet_private.teacher_official_copies(uuid);
DROP FUNCTION schoolnet_private.teacher_official_grade(uuid,uuid,text,numeric,text);
DROP FUNCTION schoolnet_private.student_official_published_result(uuid,uuid);
DROP FUNCTION schoolnet_private.teacher_official_grading_link(uuid);
CREATE OR REPLACE FUNCTION public.notify_assessment_correction_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment_title text;
  v_student_name text;
begin

  -- Seulement lorsque la correction devient publiée.
  if new.status::text <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status::text = 'published' then
    return new;
  end if;


  select a.title
  into v_assessment_title
  from public.assessments a
  where a.id = new.assessment_id;


  select coalesce(
    nullif(trim(p.full_name), ''),
    'Élève'
  )
  into v_student_name
  from public.profiles p
  where p.id = new.student_id;


  -- ----------------------------------------------------------
  -- Notification de l'élève
  -- ----------------------------------------------------------

  insert into public.notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    event_key,
    related_id,
    action_url
  )
  values (
    new.student_id,
    'Correction disponible',
    'La correction de "'
      || coalesce(v_assessment_title, 'votre évaluation')
      || '" est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/student/assessments/'
      || new.assessment_id::text
      || '/result'
  )
  on conflict do nothing;


  -- ----------------------------------------------------------
  -- Notification des parents liés à cet élève
  -- ----------------------------------------------------------

  insert into public.notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    event_key,
    related_id,
    action_url
  )
  select
    parent.id,
    'Correction disponible',
    'La correction de "'
      || coalesce(v_assessment_title, 'une évaluation')
      || '" de '
      || coalesce(v_student_name, 'votre enfant')
      || ' est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/parent/results/'
      || new.assessment_id::text
      || '?childId='
      || new.student_id::text
  from public.profiles parent
  join public.parent_links pl
    on pl.parent_id = parent.id
   and pl.student_id = new.student_id
  where parent.role = 'parent'
  on conflict do nothing;


  return new;
end;
$function$;
DO $post$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_copies(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3B3_ROLLBACK_FAILED'; END IF;
END $post$;
SELECT 'S4B3B3_OFFICIAL_GRADING_ROLLBACK_PASS' AS result;
