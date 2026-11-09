-- SCHOOLNET | Bloc 4.3.B | Confidentialite des notifications de correction
-- Fichier prepare sur GitHub ; NE PAS appliquer en production sans autorisation.
--
-- Les notifications de correction existaient deja : aucun nouveau trigger
-- n'est cree. Le correctif remplace uniquement la recherche du parent
-- via profiles.child_ids (potentiellement obsolete) par la relation parent_links
-- qui sert aussi aux droits de lecture parentaux.
--
-- Aucun historique de notification ni aucune note publiee n'est modifie.

DO $schoolnet_43b_preflight$
BEGIN
  IF to_regclass('public.parent_links') IS NULL
     OR to_regprocedure('public.notify_assessment_correction_published()') IS NULL
     OR to_regprocedure('public.notify_homework_correction_published()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = to_regclass('public.parent_links')
         AND conname = 'parent_links_unique'
         AND contype = 'u'
     )
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.B: objets de securite ou fonctions non conformes';
  END IF;

  IF position('parent.child_ids' IN pg_catalog.pg_get_functiondef(
       to_regprocedure('public.notify_assessment_correction_published()')
     )) = 0
  OR position('parent.child_ids' IN pg_catalog.pg_get_functiondef(
       to_regprocedure('public.notify_homework_correction_published()')
     )) = 0
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.B: fonctions deja modifiees; verification manuelle requise';
  END IF;
END;
$schoolnet_43b_preflight$;

-- Alignement de notify_assessment_correction_published sur parent_links.
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

-- Alignement de notify_homework_correction_published sur parent_links.
CREATE OR REPLACE FUNCTION public.notify_homework_correction_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_homework_title text;
  v_student_name text;
begin

  if new.status::text <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status::text = 'published' then
    return new;
  end if;


  select a.title
  into v_homework_title
  from public.assessments a
  where a.id = new.homework_id;


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
    'Correction du devoir disponible',
    'La correction de "'
      || coalesce(v_homework_title, 'votre devoir')
      || '" est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/student/homework/'
      || new.homework_id::text
  )
  on conflict do nothing;


  -- ----------------------------------------------------------
  -- Notification des parents
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
    'Correction du devoir disponible',
    'La correction de "'
      || coalesce(v_homework_title, 'un devoir')
      || '" de '
      || coalesce(v_student_name, 'votre enfant')
      || ' est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/parent/results/'
      || new.homework_id::text
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

-- Triggers, URLs, cles d'evenement et index anti-doublons inchanges.
