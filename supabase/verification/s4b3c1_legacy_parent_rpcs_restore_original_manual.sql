-- SCHOOLNET S4-B.3-C.1 - RESTAURATION HISTORIQUE SEPAREE, GO EXPLICITE REQUIS.
-- ATTENTION : retablit les trois RPC V1 AVANT leur exclusion des objets officiels.
-- Ce script peut donc rouvrir le chemin historique insuffisamment cloisonne.
-- Il ne doit JAMAIS etre execute automatiquement pour retirer le nouveau module.
-- Prerequis : les cinq nouvelles fonctions C.1 ont deja ete retirees.
-- Apres GO distinct uniquement, dans la MEME transaction :
-- SET LOCAL schoolnet.c1_allow_legacy_restore='yes';
-- Executer atomiquement avec ON_ERROR_STOP=1. Aucune table/donnee n'est modifiee.
DO $c1_distinct_restore_go$
BEGIN
 IF current_user<>'postgres'
  OR current_setting('schoolnet.c1_allow_legacy_restore',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'S4B3C1_LEGACY_RESTORE_REQUIRES_DISTINCT_GO'; END IF;
END $c1_distinct_restore_go$;

DO $c1_new_absent$
BEGIN
 IF to_regprocedure('schoolnet_private.parent_official_result_rows(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_results()') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_result(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_results()') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_result(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_ALREADY_EXISTS'; END IF;
END $c1_new_absent$;

DO $c1_legacy_restore_guard$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b89c4719c8b5b5fa427cf634328da45e','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','56a21d53edfc0dc8b5eb5addfe0e8a0c','s'),
  ('public.get_parent_child_homework_submissions(uuid)','deddc10f89c5f3d7623161440d7922e7','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_restore_guard$;

-- Definitions d'origine conservees en JSON pour preserver exactement les CRLF.
DO $c1_restore_original_definitions$
DECLARE saved record;
BEGIN
 FOR saved IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b609cd47364424e5b28eaa0f692f0db3','"CREATE OR REPLACE FUNCTION public.get_parent_child_assessment_detail(p_assessment_id uuid, p_child_id uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''public''\nAS $function$\r\ndeclare\r\n  v_parent_id uuid := auth.uid();\r\n  v_is_parent boolean := false;\r\n\r\n  v_assessment jsonb;\r\n  v_student jsonb;\r\n\r\n  v_submission public.assessment_submissions%rowtype;\r\n  v_questions jsonb := ''[]''::jsonb;\r\n\r\n  v_is_published boolean := false;\r\nbegin\r\n  /*\r\n   * 1. Authentification obligatoire\r\n   */\r\n  if v_parent_id is null then\r\n    raise exception ''Utilisateur non authentifie''\r\n      using errcode = ''42501'';\r\n  end if;\r\n\r\n  /*\r\n   * 2. Le compte connecté doit réellement être un parent\r\n   */\r\n  select exists (\r\n    select 1\r\n    from public.profiles p\r\n    where p.id = v_parent_id\r\n      and p.role::text = ''parent''\r\n  )\r\n  into v_is_parent;\r\n\r\n  if not v_is_parent then\r\n    raise exception ''Acces reserve aux parents''\r\n      using errcode = ''42501'';\r\n  end if;\r\n\r\n  /*\r\n   * 3. L''enfant demandé doit être lié au parent connecté\r\n   */\r\n  if not public.is_linked_parent_of(p_child_id) then\r\n    raise exception ''Cet eleve nest pas lie au compte parent''\r\n      using errcode = ''42501'';\r\n  end if;\r\n\r\n  /*\r\n   * 4. Profil de l''élève\r\n   */\r\n  select jsonb_build_object(\r\n    ''id'', p.id,\r\n    ''full_name'', p.full_name,\r\n    ''class_name'', p.class_name\r\n  )\r\n  into v_student\r\n  from public.profiles p\r\n  where p.id = p_child_id\r\n    and p.role::text = ''student'';\r\n\r\n  if v_student is null then\r\n    return jsonb_build_object(\r\n      ''found'', false,\r\n      ''reason'', ''student_not_found''\r\n    );\r\n  end if;\r\n\r\n  /*\r\n   * 5. Evaluation.\r\n   *\r\n   * Elle doit :\r\n   * - exister ;\r\n   * - être publiée ;\r\n   * - appartenir à un cours auquel l''enfant est inscrit.\r\n   */\r\n  select jsonb_build_object(\r\n    ''id'', a.id,\r\n    ''title'', a.title,\r\n    ''description'', a.description,\r\n    ''type'', a.type::text,\r\n    ''status'', a.status::text,\r\n    ''due_at'', a.due_at,\r\n    ''time_limit_minutes'', a.time_limit_minutes,\r\n    ''max_score'', a.max_score,\r\n    ''course_id'', a.course_id,\r\n    ''section_id'', a.section_id,\r\n    ''course_title'', c.title,\r\n    ''section_title'', cs.title,\r\n    ''submission_mode'', a.submission_mode,\r\n    ''exam_content_mode'', a.exam_content_mode,\r\n    ''exam_window_minutes'', a.exam_window_minutes,\r\n    ''exam_file_max_score'', a.exam_file_max_score\r\n  )\r\n  into v_assessment\r\n  from public.assessments a\r\n  join public.courses c\r\n    on c.id = a.course_id\r\n  left join public.course_sections cs\r\n    on cs.id = a.section_id\r\n  where a.id = p_assessment_id\r\n    and a.status::text = ''published''\r\n    and exists (\r\n      select 1\r\n      from public.course_enrollments ce\r\n      where ce.course_id = a.course_id\r\n        and ce.student_id = p_child_id\r\n    )\r\n  limit 1;\r\n\r\n  if v_assessment is null then\r\n    return jsonb_build_object(\r\n      ''found'', false,\r\n      ''reason'', ''assessment_not_accessible''\r\n    );\r\n  end if;\r\n\r\n  /*\r\n   * 6. Dernière soumission correspondant à l''élève\r\n   */\r\n  select s.*\r\n  into v_submission\r\n  from public.assessment_submissions s\r\n  where s.assessment_id = p_assessment_id\r\n    and s.student_id = p_child_id\r\n  order by s.created_at desc\r\n  limit 1;\r\n\r\n  /*\r\n   * 7. Aucun enregistrement de soumission\r\n   */\r\n  if not found then\r\n    return jsonb_build_object(\r\n      ''found'', true,\r\n      ''student'', v_student,\r\n      ''assessment'', v_assessment,\r\n      ''submission'', null,\r\n      ''questions'', ''[]''::jsonb\r\n    );\r\n  end if;\r\n\r\n  v_is_published := v_submission.status::text = ''published'';\r\n\r\n  /*\r\n   * 8. Les données de correction détaillée ne sont chargées\r\n   *    QUE si l''enseignant a publié la correction.\r\n   */\r\n  if v_is_published then\r\n    select coalesce(\r\n      jsonb_agg(\r\n        jsonb_build_object(\r\n          ''id'', q.id,\r\n          ''question_type'', q.question_type::text,\r\n          ''prompt'', q.prompt,\r\n          ''order_index'', q.order_index,\r\n\r\n          ''answer_text'', answer_row.answer_text,\r\n          ''choice_id'', answer_row.choice_id,\r\n          ''answer_is_correct'', answer_row.is_correct,\r\n\r\n          ''points_awarded'', grade_row.points_awarded,\r\n          ''max_points'', grade_row.max_points,\r\n          ''feedback'', grade_row.feedback,\r\n\r\n          ''choices'',\r\n          case\r\n            when q.question_type::text in (''mcq'', ''true_false'') then\r\n              (\r\n                select coalesce(\r\n                  jsonb_agg(\r\n                    jsonb_build_object(\r\n                      ''id'', qc.id,\r\n                      ''label'', qc.choice_text,\r\n\r\n                      ''selected'',\r\n                      case\r\n                        when q.question_type::text = ''mcq''\r\n                          then answer_row.choice_id = qc.id\r\n\r\n                        when q.question_type::text = ''true_false''\r\n                          then lower(trim(coalesce(answer_row.answer_text, '''')))\r\n                               =\r\n                               lower(trim(qc.choice_text))\r\n\r\n                        else false\r\n                      end,\r\n\r\n                      ''is_correct'', coalesce(qc.is_correct, false)\r\n                    )\r\n                    order by\r\n                      coalesce(qc.order_index, 2147483647),\r\n                      qc.id\r\n                  ),\r\n                  ''[]''::jsonb\r\n                )\r\n                from public.quiz_choices qc\r\n                where qc.question_id = q.id\r\n              )\r\n\r\n            else ''[]''::jsonb\r\n          end\r\n        )\r\n        order by q.order_index, q.id\r\n      ),\r\n      ''[]''::jsonb\r\n    )\r\n    into v_questions\r\n    from public.quiz_questions q\r\n\r\n    left join lateral (\r\n      select\r\n        sa.answer_text,\r\n        sa.choice_id,\r\n        sa.is_correct\r\n      from public.submission_answers sa\r\n      where sa.submission_id = v_submission.id\r\n        and sa.question_id = q.id\r\n      order by sa.created_at desc\r\n      limit 1\r\n    ) answer_row\r\n      on true\r\n\r\n    left join lateral (\r\n      select\r\n        sqg.points_awarded,\r\n        sqg.max_points,\r\n        sqg.feedback\r\n      from public.submission_question_grades sqg\r\n      where sqg.submission_id = v_submission.id\r\n        and sqg.question_id = q.id\r\n      order by sqg.updated_at desc\r\n      limit 1\r\n    ) grade_row\r\n      on true\r\n\r\n    where q.assessment_id = p_assessment_id;\r\n  end if;\r\n\r\n  /*\r\n   * 9. Réponse finale.\r\n   *\r\n   * Les informations confidentielles sont conditionnées\r\n   * par v_is_published.\r\n   */\r\n  return jsonb_build_object(\r\n    ''found'', true,\r\n\r\n    ''student'', v_student,\r\n\r\n    ''assessment'', v_assessment,\r\n\r\n    ''submission'',\r\n    jsonb_build_object(\r\n      ''id'', v_submission.id,\r\n      ''assessment_id'', v_submission.assessment_id,\r\n      ''student_id'', v_submission.student_id,\r\n\r\n      ''status'', v_submission.status::text,\r\n\r\n      ''started_at'', v_submission.started_at,\r\n      ''submitted_at'', v_submission.submitted_at,\r\n      ''graded_at'', v_submission.graded_at,\r\n      ''published_at'', v_submission.published_at,\r\n\r\n      ''score'',\r\n      case\r\n        when v_is_published then v_submission.score\r\n        else null\r\n      end,\r\n\r\n      ''feedback'',\r\n      case\r\n        when v_is_published then v_submission.feedback\r\n        else null\r\n      end,\r\n\r\n      ''freeform_answer'',\r\n      case\r\n        when v_is_published then v_submission.freeform_answer\r\n        else null\r\n      end,\r\n\r\n      ''freeform_score'',\r\n      case\r\n        when v_is_published then v_submission.freeform_score\r\n        else null\r\n      end,\r\n\r\n      ''freeform_feedback'',\r\n      case\r\n        when v_is_published then v_submission.freeform_feedback\r\n        else null\r\n      end\r\n    ),\r\n\r\n    ''questions'',\r\n    case\r\n      when v_is_published then v_questions\r\n      else ''[]''::jsonb\r\n    end\r\n  );\r\nend;\r\n$function$\n"'::jsonb #>> '{}'),
  ('public.get_parent_child_assessment_submissions(uuid)','7bb34d159b8090d0104a43e6ccba9829','"CREATE OR REPLACE FUNCTION public.get_parent_child_assessment_submissions(p_child_id uuid)\n RETURNS TABLE(assessment_id uuid, status submission_status, score numeric, submitted_at timestamp with time zone, published_at timestamp with time zone)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO ''public''\nAS $function$\r\n\r\n  select\r\n    s.assessment_id,\r\n    s.status,\r\n\r\n    case\r\n      when s.status = ''published''\r\n        then s.score\r\n      else null\r\n    end as score,\r\n\r\n    s.submitted_at,\r\n    s.published_at\r\n\r\n  from public.assessment_submissions s\r\n\r\n  where s.student_id = p_child_id\r\n\r\n    and public.parent_can_read_child(\r\n      p_child_id\r\n    );\r\n\r\n$function$\n"'::jsonb #>> '{}'),
  ('public.get_parent_child_homework_submissions(uuid)','c784095a394514bbab780ac2ba6c1b77','"CREATE OR REPLACE FUNCTION public.get_parent_child_homework_submissions(p_child_id uuid)\n RETURNS TABLE(homework_id uuid, status submission_status, score numeric, submitted_at timestamp with time zone, published_at timestamp with time zone)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO ''public''\nAS $function$\r\n\r\n  select\r\n    s.homework_id,\r\n    s.status,\r\n\r\n    case\r\n      when s.status = ''published''\r\n        then s.score\r\n      else null\r\n    end as score,\r\n\r\n    s.submitted_at,\r\n    s.published_at\r\n\r\n  from public.homework_submissions s\r\n\r\n  where s.student_id = p_child_id\r\n\r\n    and public.parent_can_read_child(\r\n      p_child_id\r\n    );\r\n\r\n$function$\n"'::jsonb #>> '{}')
 ) e(signature,original_md5,original_definition)
 LOOP
  IF md5(saved.original_definition) IS DISTINCT FROM saved.original_md5
  THEN RAISE EXCEPTION 'S4B3C1_ORIGINAL_SNAPSHOT_CORRUPT: %',saved.signature; END IF;
  EXECUTE saved.original_definition;
 END LOOP;
END $c1_restore_original_definitions$;
ALTER FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_assessment_detail(uuid,uuid) TO postgres,authenticated,service_role;
ALTER FUNCTION public.get_parent_child_assessment_submissions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_assessment_submissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_assessment_submissions(uuid) TO postgres,authenticated,service_role;
ALTER FUNCTION public.get_parent_child_homework_submissions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_parent_child_homework_submissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_child_homework_submissions(uuid) TO postgres,authenticated,service_role;
DO $c1_legacy_restored$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b609cd47364424e5b28eaa0f692f0db3','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','7bb34d159b8090d0104a43e6ccba9829','s'),
  ('public.get_parent_child_homework_submissions(uuid)','c784095a394514bbab780ac2ba6c1b77','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_restored$;

SELECT 'S4B3C1_LEGACY_PARENT_RPCS_RESTORE_PASS' AS result;
