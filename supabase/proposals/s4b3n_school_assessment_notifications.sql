-- SCHOOLNET V2 / S4-B.3-N — PROPOSITION CI ISOLEE, NON INSTALLEE.
-- NOTER: Aucun SQL ne doit etre applique sur Supabase principal sans GO distinct.
-- Routage notifications scolaires, sans nouvelle table, inscription, note ou remise.
-- Fonction V1 snapshot du 20 novembre 2026 conservee dans le rollback manuel.

DO $preflight$
BEGIN
 IF to_regclass('schoolnet_private.school_assessment_links') IS NULL
  OR to_regclass('schoolnet_private.school_course_links') IS NULL
  OR to_regclass('public.assessments') IS NULL
  OR to_regclass('public.notifications') IS NULL
  OR to_regclass('public.class_students') IS NULL
  OR to_regclass('public.course_enrollments') IS NULL
  OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
  OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
  OR to_regclass('public.schoolnet_school_memberships') IS NULL
  OR to_regprocedure('public.notify_assessment_published()') IS NULL
  OR to_regprocedure('schoolnet_private.emit_official_assessment_notification(uuid,text)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.notify_official_assessment_link_change()') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3N_PREFLIGHT_OBJECTS_MISMATCH'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='public.assessments'::regclass
     AND t.tgname='trg_notify_assessment_published'
     AND t.tgenabled='O'
 )
 OR position('from public.course_enrollments' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))=0
 OR position('join public.class_students' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))=0
 OR position('S4B3N_ROUTING_OFFICIEL' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))>0
 THEN RAISE EXCEPTION 'S4B3N_LEGACY_FUNCTION_DRIFT'; END IF;
END;
$preflight$;

-- Ce helper est prive et n'a PAS de facade RPC. Seuls les triggers du
-- cycle de vie des evaluations et des liens peuvent l'appeler.
-- Autorisations alignees sur S4-B.2 : ecole/classe/annee/cours/enseignant/
-- matiere/affectations et memberships actifs + role student du destinataire.
CREATE FUNCTION schoolnet_private.emit_official_assessment_notification(
 p_assessment_id uuid,p_event text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $emit$
BEGIN
 IF p_assessment_id IS NULL OR p_event NOT IN ('published','withdrawn') THEN
   RETURN;
 END IF;
 INSERT INTO public.notifications(
   user_id,title,body,type,is_read,event_key,related_id,action_url
 )
 SELECT DISTINCT
   student_a.student_id,
   CASE
     WHEN p_event='withdrawn' THEN 'Evaluation scolaire retiree'
     WHEN a.type::text='quiz' THEN 'Nouveau quiz de '||sub.name
     WHEN a.type::text='assignment' THEN 'Nouveau devoir de '||sub.name
     WHEN a.type::text='exam' THEN 'Nouvel examen de '||sub.name
     ELSE 'Nouvelle evaluation de '||sub.name
   END,
   CASE WHEN p_event='withdrawn' THEN
     'L''evaluation "'||pg_catalog.left(a.title,180)||
     '" n''est plus disponible dans votre cours officiel.'
   ELSE
     'Votre enseignant a publie "'||pg_catalog.left(a.title,180)||
     '" pour votre classe. Consultez votre cours pour l''echeance.'
   END,
   CASE WHEN p_event='withdrawn' THEN 'warning'::public.notification_type
     ELSE 'info'::public.notification_type END,
   false,
   CASE WHEN p_event='withdrawn' THEN 'assessment_withdrawn'
     ELSE 'assessment_published' END,
   a.id,
   '/app/student/school-courses/'||l.course_id::text
 FROM public.assessments a
 JOIN schoolnet_private.school_assessment_links al ON al.assessment_id=a.id
 JOIN schoolnet_private.school_course_links l
   ON l.id=al.school_course_link_id
   AND l.course_id=a.course_id
   AND l.teacher_id=a.created_by AND l.status='active'
 JOIN public.courses co ON co.id=l.course_id AND co.status='active'
   AND co.created_by=l.teacher_id
 JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
 JOIN public.classes c ON c.id=l.class_id AND c.school_id=l.school_id
   AND c.school_year_id=l.school_year_id AND c.learning_context='school'
   AND (co.class_id IS NULL OR co.class_id=l.class_id)
   AND (co.level_id IS NULL OR co.level_id=c.level_id)
 JOIN public.profiles teacher ON teacher.id=l.teacher_id AND teacher.role::text='teacher'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
   ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
   AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
   AND ta.teacher_id=l.teacher_id AND ta.subject_id=l.subject_id
   AND ta.status='active'
 JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active=true
 JOIN public.schoolnet_school_memberships teacher_m
   ON teacher_m.school_id=l.school_id AND teacher_m.user_id=l.teacher_id
   AND teacher_m.member_role='teacher' AND teacher_m.status='active'
 JOIN public.schoolnet_school_student_class_assignments student_a
   ON student_a.school_id=l.school_id AND student_a.class_id=l.class_id
   AND student_a.school_year_id=l.school_year_id AND student_a.status='active'
 JOIN public.schoolnet_school_memberships student_m
   ON student_m.school_id=l.school_id AND student_m.user_id=student_a.student_id
   AND student_m.member_role='student' AND student_m.status='active'
 JOIN public.profiles student ON student.id=student_a.student_id
   AND student.role::text='student'
 WHERE a.id=p_assessment_id
   AND (a.section_id IS NULL OR EXISTS(
     SELECT 1 FROM public.course_sections sec
     WHERE sec.id=a.section_id AND sec.course_id=a.course_id
   ))
   AND NOT EXISTS(
     SELECT 1 FROM public.course_subjects cs
     WHERE cs.course_id=l.course_id AND cs.subject_id<>l.subject_id
   )
   AND (
     (p_event='published' AND a.status::text='published' AND al.status='active')
     OR
     (p_event='withdrawn' AND
       (a.status::text<>'published' OR al.status='revoked'))
   )
   AND (
     p_event='published' OR EXISTS(
       SELECT 1 FROM public.notifications n
       WHERE n.user_id=student_a.student_id
         AND n.event_key='assessment_published'
         AND n.related_id=a.id
         AND n.action_url='/app/student/school-courses/'||l.course_id::text
     )
   )
 ON CONFLICT DO NOTHING;
END;
$emit$;

REVOKE ALL ON FUNCTION
 schoolnet_private.emit_official_assessment_notification(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Un lien en brouillon ne notifie pas. Un lien actif deja publie notifie,
-- meme quand l'enseignant publie AVANT de rattacher.
CREATE FUNCTION schoolnet_private.notify_official_assessment_link_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $link_event$
BEGIN
 IF TG_TABLE_SCHEMA<>'schoolnet_private'
   OR TG_TABLE_NAME<>'school_assessment_links'
   OR TG_OP NOT IN ('INSERT','UPDATE')
 THEN RAISE EXCEPTION 'S4B3N_TRIGGER_MISUSE'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status='active' THEN
     PERFORM schoolnet_private.emit_official_assessment_notification(
       NEW.assessment_id,'published');
   END IF;
 ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
   IF NEW.status='active' THEN
     PERFORM schoolnet_private.emit_official_assessment_notification(
       NEW.assessment_id,'published');
   ELSIF OLD.status='active' AND NEW.status='revoked' THEN
     PERFORM schoolnet_private.emit_official_assessment_notification(
       NEW.assessment_id,'withdrawn');
   END IF;
 END IF;
 RETURN NEW;
END;
$link_event$;
REVOKE ALL ON FUNCTION
 schoolnet_private.notify_official_assessment_link_change()
 FROM PUBLIC,anon,authenticated;

-- La fonction V1 conserve son corps initial pour les cours libres.
-- Pour les cours du referentiel officiel, aucun ancien class_students
-- ni course_enrollments ne peut recevoir de notification par erreur.
CREATE OR REPLACE FUNCTION public.notify_assessment_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_course_title text;
  v_notification_title text;
  v_notification_body text;
  v_action_url text;
begin

  -- S4B3N_ROUTING_OFFICIEL: un cours scolaire ne doit pas utiliser
  -- course_enrollments ou class_students pour notifier.
  IF EXISTS (
    SELECT 1 FROM schoolnet_private.school_course_links sl
    WHERE sl.course_id=NEW.course_id
  ) THEN
    IF TG_OP='INSERT' THEN
      IF NEW.status::text='published' THEN
        PERFORM schoolnet_private.emit_official_assessment_notification(NEW.id,'published');
      END IF;
    ELSIF TG_OP='UPDATE' THEN
      IF NEW.status::text='published' AND OLD.status::text<>'published' THEN
        PERFORM schoolnet_private.emit_official_assessment_notification(NEW.id,'published');
      ELSIF OLD.status::text='published' AND NEW.status::text<>'published' THEN
        PERFORM schoolnet_private.emit_official_assessment_notification(NEW.id,'withdrawn');
      END IF;
    END IF;
    RETURN NEW;
  END IF;


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
$function$;

CREATE TRIGGER trg_s4b3n_official_assessment_link_notifications
AFTER INSERT OR UPDATE OF status
ON schoolnet_private.school_assessment_links
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.notify_official_assessment_link_change();

DO $postflight$
BEGIN
 IF to_regprocedure('schoolnet_private.emit_official_assessment_notification(uuid,text)') IS NULL
 OR to_regprocedure('schoolnet_private.notify_official_assessment_link_change()') IS NULL
 OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgname='trg_s4b3n_official_assessment_link_notifications'
     AND tgrelid='schoolnet_private.school_assessment_links'::regclass
     AND tgenabled='O'
 )
 OR position('S4B3N_ROUTING_OFFICIEL' IN pg_catalog.pg_get_functiondef(
     'public.notify_assessment_published()'::regprocedure))=0
 OR has_function_privilege('anon',
      'schoolnet_private.emit_official_assessment_notification(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
      'schoolnet_private.emit_official_assessment_notification(uuid,text)','EXECUTE')
 OR has_function_privilege('anon',
      'schoolnet_private.notify_official_assessment_link_change()','EXECUTE')
 OR has_function_privilege('authenticated',
      'schoolnet_private.notify_official_assessment_link_change()','EXECUTE')
 THEN RAISE EXCEPTION 'S4B3N_POSTFLIGHT_FAILED'; END IF;
END;
$postflight$;
