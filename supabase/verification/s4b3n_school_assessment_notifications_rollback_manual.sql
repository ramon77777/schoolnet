-- SCHOOLNET S4-B.3-N — ROLLBACK MANUEL, NON EXECUTE.
-- Aucune notification ni information eleve n'est supprimee.
DO $preflight_rollback$
BEGIN
 IF to_regprocedure('schoolnet_private.emit_official_assessment_notification(uuid,text)') IS NULL
 OR to_regprocedure('schoolnet_private.notify_official_assessment_link_change()') IS NULL
 OR position('S4B3N_ROUTING_OFFICIEL' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))=0
 THEN RAISE EXCEPTION 'S4B3N_ROLLBACK_PREFLIGHT_FAILED'; END IF;
END;
$preflight_rollback$;

DROP TRIGGER trg_s4b3n_official_assessment_link_notifications
 ON schoolnet_private.school_assessment_links;
DROP FUNCTION schoolnet_private.notify_official_assessment_link_change();
DROP FUNCTION schoolnet_private.emit_official_assessment_notification(uuid,text);

-- Restauration du corps exact de la fonction historique V1 relevee avant S4-B.3-N.
CREATE OR REPLACE FUNCTION public.notify_assessment_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course_title text;
  v_notification_title text;
  v_notification_body text;
  v_action_url text;
begin

  -- Rien à faire si l'évaluation n'est pas publiée.
  if new.status::text <> 'published' then
    return new;
  end if;

  -- Sur UPDATE, on ne déclenche que lors du passage
  -- vers "published".
  if tg_op = 'UPDATE'
     and old.status::text = 'published' then
    return new;
  end if;


  select c.title
  into v_course_title
  from public.courses c
  where c.id = new.course_id;


  -- Texte et destination selon le type d'évaluation.
  case new.type::text

    when 'assignment' then
      v_notification_title := 'Nouveau devoir disponible';
      v_action_url :=
        '/app/student/homework/' || new.id::text;

    when 'quiz' then
      v_notification_title := 'Nouveau quiz disponible';
      v_action_url :=
        '/app/student/assessments/' || new.id::text;

    when 'exam' then
      v_notification_title := 'Nouvel examen disponible';
      v_action_url :=
        '/app/student/assessments/' || new.id::text;

    else
      v_notification_title := 'Nouvelle évaluation disponible';
      v_action_url :=
        '/app/student/assessments/' || new.id::text;

  end case;


  v_notification_body :=
    '"' || new.title || '"'
    || case
         when v_course_title is not null
           then ' est disponible dans ' || v_course_title || '.'
         else ' est maintenant disponible.'
       end;


  -- Destinataires :
  -- - élèves explicitement inscrits dans course_enrollments
  -- - élèves appartenant à la classe rattachée au cours
  --
  -- UNION empêche les doublons si un élève appartient
  -- aux deux groupes.
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
    recipients.student_id,
    v_notification_title,
    v_notification_body,
    'info',
    false,
    'assessment_published',
    new.id,
    v_action_url
  from (
    select ce.student_id
    from public.course_enrollments ce
    where ce.course_id = new.course_id

    union

    select cs.student_id
    from public.courses c
    join public.class_students cs
      on cs.class_id = c.class_id
    where c.id = new.course_id
      and c.class_id is not null
  ) recipients
  join public.profiles p
    on p.id = recipients.student_id
   and p.role = 'student'
  on conflict do nothing;


  return new;
end;
$function$


DO $verify_rollback$
BEGIN
 IF to_regprocedure('schoolnet_private.emit_official_assessment_notification(uuid,text)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.notify_official_assessment_link_change()') IS NOT NULL
 OR position('S4B3N_ROUTING_OFFICIEL' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))>0
 THEN RAISE EXCEPTION 'S4B3N_ROLLBACK_FAILED'; END IF;
END;
$verify_rollback$;
SELECT 'S4B3N_ROLLBACK_PASS' AS result;
