-- SCHOOLNET S4-B.3-N : schéma MINIMAL local / Postgres jetable exclusivement.
-- Les données réelles, l'authentification et Supabase principal ne sont pas accessibles.
CREATE TYPE public.notification_type AS ENUM ('info','warning','success','error');
CREATE TABLE public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 title text NOT NULL,body text,
 type public.notification_type NOT NULL DEFAULT 'info',
 is_read boolean NOT NULL DEFAULT false,
 event_key text,related_id uuid,action_url text,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz
);
CREATE UNIQUE INDEX idx_notifications_event_unique
 ON public.notifications(user_id,event_key,related_id)
 WHERE event_key IS NOT NULL AND related_id IS NOT NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.notifications TO authenticated;
CREATE POLICY notification_self ON public.notifications FOR SELECT TO authenticated
 USING(user_id=auth.uid());
CREATE TABLE public.class_students (
 class_id uuid NOT NULL REFERENCES public.classes(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 PRIMARY KEY(class_id,student_id)
);
-- Capturé dans le rollback SQL : l'ancien trigger est effectivement exécuté
-- sur les évaluations V1 pour vérifier sa non-régression.
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
$function$;
CREATE TRIGGER trg_notify_assessment_published
 AFTER INSERT OR UPDATE OF status ON public.assessments
 FOR EACH ROW EXECUTE FUNCTION public.notify_assessment_published();

-- Simuler les droits observes sur Supabase principal AVANT durcissement.
-- Contrairement au droit PUBLIC implicite PostgreSQL, la production
-- attribue explicitement EXECUTE aux trois roles suivants.
REVOKE ALL ON FUNCTION public.notify_assessment_published()
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_assessment_published()
 TO anon, authenticated, service_role;

