-- SCHOOLNET C.1 — fixture historique pour Postgres LOCAL JETABLE uniquement.
-- A charger apres les scenarios B.4 (leur transaction ajoute puis retire certains champs).
-- Definitions originales capturees en lecture seule le 24/11/2026 ; aucun compte reel.
ALTER TABLE public.profiles ADD COLUMN class_name text;
ALTER TABLE public.profiles ADD COLUMN child_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.assessments ADD COLUMN description text;
ALTER TABLE public.assessments ADD COLUMN time_limit_minutes integer;
ALTER TABLE public.assessments ADD COLUMN submission_mode text;
ALTER TABLE public.assessments ADD COLUMN exam_window_minutes integer;
ALTER TABLE public.submission_answers ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.submission_question_grades ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- B.3 a deja cree un stub parent_links(parent_id,student_id).
ALTER TABLE public.parent_links
 ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN relation_type text,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ALTER COLUMN parent_id SET NOT NULL,
 ALTER COLUMN student_id SET NOT NULL,
 ADD CONSTRAINT parent_links_pkey PRIMARY KEY(id),
 ADD CONSTRAINT parent_links_distinct_chk CHECK(parent_id<>student_id),
 ADD CONSTRAINT parent_links_unique UNIQUE(parent_id,student_id);
ALTER TABLE public.parent_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.parent_links TO authenticated;
CREATE POLICY parent_links_admin_write ON public.parent_links
 FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY parent_links_select_admin_parent_student ON public.parent_links
 FOR SELECT TO authenticated USING(public.is_admin() OR parent_id=auth.uid() OR student_id=auth.uid());
CREATE FUNCTION public.is_parent() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT COALESCE(public.get_my_role()::text='parent',false);
$f$;
CREATE FUNCTION public.is_linked_parent_of(student_uuid uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT public.is_parent() AND EXISTS(
  SELECT 1 FROM public.parent_links pl
  WHERE pl.parent_id=auth.uid() AND pl.student_id=student_uuid);
$f$;
CREATE FUNCTION public.parent_can_read_child(p_child_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT public.is_linked_parent_of(p_child_id);
$f$;
REVOKE ALL ON FUNCTION public.is_parent(), public.is_linked_parent_of(uuid),
 public.parent_can_read_child(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent(), public.is_linked_parent_of(uuid),
 public.parent_can_read_child(uuid) TO authenticated,service_role;

-- Le corps des fonctions observees contient CRLF, contrairement a leur en-tete.
-- Reconstruire uniquement les fins de ligne du corps conserve pg_get_functiondef
-- a l'octet pres, tout en gardant ce fichier source LF lisible et portable.
DO $c1_load_original$
DECLARE definition text := $legacy_definition$CREATE OR REPLACE FUNCTION public.get_parent_child_assessment_detail(p_assessment_id uuid, p_child_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parent_id uuid := auth.uid();
  v_is_parent boolean := false;

  v_assessment jsonb;
  v_student jsonb;

  v_submission public.assessment_submissions%rowtype;
  v_questions jsonb := '[]'::jsonb;

  v_is_published boolean := false;
begin
  /*
   * 1. Authentification obligatoire
   */
  if v_parent_id is null then
    raise exception 'Utilisateur non authentifie'
      using errcode = '42501';
  end if;

  /*
   * 2. Le compte connecté doit réellement être un parent
   */
  select exists (
    select 1
    from public.profiles p
    where p.id = v_parent_id
      and p.role::text = 'parent'
  )
  into v_is_parent;

  if not v_is_parent then
    raise exception 'Acces reserve aux parents'
      using errcode = '42501';
  end if;

  /*
   * 3. L'enfant demandé doit être lié au parent connecté
   */
  if not public.is_linked_parent_of(p_child_id) then
    raise exception 'Cet eleve nest pas lie au compte parent'
      using errcode = '42501';
  end if;

  /*
   * 4. Profil de l'élève
   */
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'class_name', p.class_name
  )
  into v_student
  from public.profiles p
  where p.id = p_child_id
    and p.role::text = 'student';

  if v_student is null then
    return jsonb_build_object(
      'found', false,
      'reason', 'student_not_found'
    );
  end if;

  /*
   * 5. Evaluation.
   *
   * Elle doit :
   * - exister ;
   * - être publiée ;
   * - appartenir à un cours auquel l'enfant est inscrit.
   */
  select jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'description', a.description,
    'type', a.type::text,
    'status', a.status::text,
    'due_at', a.due_at,
    'time_limit_minutes', a.time_limit_minutes,
    'max_score', a.max_score,
    'course_id', a.course_id,
    'section_id', a.section_id,
    'course_title', c.title,
    'section_title', cs.title,
    'submission_mode', a.submission_mode,
    'exam_content_mode', a.exam_content_mode,
    'exam_window_minutes', a.exam_window_minutes,
    'exam_file_max_score', a.exam_file_max_score
  )
  into v_assessment
  from public.assessments a
  join public.courses c
    on c.id = a.course_id
  left join public.course_sections cs
    on cs.id = a.section_id
  where a.id = p_assessment_id
    and a.status::text = 'published'
    and exists (
      select 1
      from public.course_enrollments ce
      where ce.course_id = a.course_id
        and ce.student_id = p_child_id
    )
  limit 1;

  if v_assessment is null then
    return jsonb_build_object(
      'found', false,
      'reason', 'assessment_not_accessible'
    );
  end if;

  /*
   * 6. Dernière soumission correspondant à l'élève
   */
  select s.*
  into v_submission
  from public.assessment_submissions s
  where s.assessment_id = p_assessment_id
    and s.student_id = p_child_id
  order by s.created_at desc
  limit 1;

  /*
   * 7. Aucun enregistrement de soumission
   */
  if not found then
    return jsonb_build_object(
      'found', true,
      'student', v_student,
      'assessment', v_assessment,
      'submission', null,
      'questions', '[]'::jsonb
    );
  end if;

  v_is_published := v_submission.status::text = 'published';

  /*
   * 8. Les données de correction détaillée ne sont chargées
   *    QUE si l'enseignant a publié la correction.
   */
  if v_is_published then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'question_type', q.question_type::text,
          'prompt', q.prompt,
          'order_index', q.order_index,

          'answer_text', answer_row.answer_text,
          'choice_id', answer_row.choice_id,
          'answer_is_correct', answer_row.is_correct,

          'points_awarded', grade_row.points_awarded,
          'max_points', grade_row.max_points,
          'feedback', grade_row.feedback,

          'choices',
          case
            when q.question_type::text in ('mcq', 'true_false') then
              (
                select coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', qc.id,
                      'label', qc.choice_text,

                      'selected',
                      case
                        when q.question_type::text = 'mcq'
                          then answer_row.choice_id = qc.id

                        when q.question_type::text = 'true_false'
                          then lower(trim(coalesce(answer_row.answer_text, '')))
                               =
                               lower(trim(qc.choice_text))

                        else false
                      end,

                      'is_correct', coalesce(qc.is_correct, false)
                    )
                    order by
                      coalesce(qc.order_index, 2147483647),
                      qc.id
                  ),
                  '[]'::jsonb
                )
                from public.quiz_choices qc
                where qc.question_id = q.id
              )

            else '[]'::jsonb
          end
        )
        order by q.order_index, q.id
      ),
      '[]'::jsonb
    )
    into v_questions
    from public.quiz_questions q

    left join lateral (
      select
        sa.answer_text,
        sa.choice_id,
        sa.is_correct
      from public.submission_answers sa
      where sa.submission_id = v_submission.id
        and sa.question_id = q.id
      order by sa.created_at desc
      limit 1
    ) answer_row
      on true

    left join lateral (
      select
        sqg.points_awarded,
        sqg.max_points,
        sqg.feedback
      from public.submission_question_grades sqg
      where sqg.submission_id = v_submission.id
        and sqg.question_id = q.id
      order by sqg.updated_at desc
      limit 1
    ) grade_row
      on true

    where q.assessment_id = p_assessment_id;
  end if;

  /*
   * 9. Réponse finale.
   *
   * Les informations confidentielles sont conditionnées
   * par v_is_published.
   */
  return jsonb_build_object(
    'found', true,

    'student', v_student,

    'assessment', v_assessment,

    'submission',
    jsonb_build_object(
      'id', v_submission.id,
      'assessment_id', v_submission.assessment_id,
      'student_id', v_submission.student_id,

      'status', v_submission.status::text,

      'started_at', v_submission.started_at,
      'submitted_at', v_submission.submitted_at,
      'graded_at', v_submission.graded_at,
      'published_at', v_submission.published_at,

      'score',
      case
        when v_is_published then v_submission.score
        else null
      end,

      'feedback',
      case
        when v_is_published then v_submission.feedback
        else null
      end,

      'freeform_answer',
      case
        when v_is_published then v_submission.freeform_answer
        else null
      end,

      'freeform_score',
      case
        when v_is_published then v_submission.freeform_score
        else null
      end,

      'freeform_feedback',
      case
        when v_is_published then v_submission.freeform_feedback
        else null
      end
    ),

    'questions',
    case
      when v_is_published then v_questions
      else '[]'::jsonb
    end
  );
end;
$function$
$legacy_definition$;
parts text[];
BEGIN
 parts:=string_to_array(definition,'$function$');
 IF array_length(parts,1)<>3 THEN RAISE EXCEPTION 'C1_FIXTURE_INVALID_DEFINITION'; END IF;
 EXECUTE parts[1]||'$function$'||replace(parts[2],chr(10),chr(13)||chr(10))||'$function$'||parts[3];
END $c1_load_original$;
ALTER FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) TO postgres,authenticated,service_role;

DO $c1_load_original$
DECLARE definition text := $legacy_definition$CREATE OR REPLACE FUNCTION public.get_parent_child_assessment_submissions(p_child_id uuid)
 RETURNS TABLE(assessment_id uuid, status submission_status, score numeric, submitted_at timestamp with time zone, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  select
    s.assessment_id,
    s.status,

    case
      when s.status = 'published'
        then s.score
      else null
    end as score,

    s.submitted_at,
    s.published_at

  from public.assessment_submissions s

  where s.student_id = p_child_id

    and public.parent_can_read_child(
      p_child_id
    );

$function$
$legacy_definition$;
parts text[];
BEGIN
 parts:=string_to_array(definition,'$function$');
 IF array_length(parts,1)<>3 THEN RAISE EXCEPTION 'C1_FIXTURE_INVALID_DEFINITION'; END IF;
 EXECUTE parts[1]||'$function$'||replace(parts[2],chr(10),chr(13)||chr(10))||'$function$'||parts[3];
END $c1_load_original$;
ALTER FUNCTION public.get_parent_child_assessment_submissions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_assessment_submissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_assessment_submissions(uuid) TO postgres,authenticated,service_role;

DO $c1_load_original$
DECLARE definition text := $legacy_definition$CREATE OR REPLACE FUNCTION public.get_parent_child_homework_submissions(p_child_id uuid)
 RETURNS TABLE(homework_id uuid, status submission_status, score numeric, submitted_at timestamp with time zone, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  select
    s.homework_id,
    s.status,

    case
      when s.status = 'published'
        then s.score
      else null
    end as score,

    s.submitted_at,
    s.published_at

  from public.homework_submissions s

  where s.student_id = p_child_id

    and public.parent_can_read_child(
      p_child_id
    );

$function$
$legacy_definition$;
parts text[];
BEGIN
 parts:=string_to_array(definition,'$function$');
 IF array_length(parts,1)<>3 THEN RAISE EXCEPTION 'C1_FIXTURE_INVALID_DEFINITION'; END IF;
 EXECUTE parts[1]||'$function$'||replace(parts[2],chr(10),chr(13)||chr(10))||'$function$'||parts[3];
END $c1_load_original$;
ALTER FUNCTION public.get_parent_child_homework_submissions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_homework_submissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_homework_submissions(uuid) TO postgres,authenticated,service_role;

DO $originals$
BEGIN
 IF md5(pg_get_functiondef('public.get_parent_child_assessment_detail(uuid,uuid)'::regprocedure))<>'b609cd47364424e5b28eaa0f692f0db3' THEN RAISE EXCEPTION 'C1_FIXTURE_ORIGINAL_DRIFT_get_parent_child_assessment_detail'; END IF;
 IF md5(pg_get_functiondef('public.get_parent_child_assessment_submissions(uuid)'::regprocedure))<>'7bb34d159b8090d0104a43e6ccba9829' THEN RAISE EXCEPTION 'C1_FIXTURE_ORIGINAL_DRIFT_get_parent_child_assessment_submissions'; END IF;
 IF md5(pg_get_functiondef('public.get_parent_child_homework_submissions(uuid)'::regprocedure))<>'c784095a394514bbab780ac2ba6c1b77' THEN RAISE EXCEPTION 'C1_FIXTURE_ORIGINAL_DRIFT_get_parent_child_homework_submissions'; END IF;
END $originals$;
SELECT 'S4B3C1_LEGACY_FIXTURE_PASS' AS result;
