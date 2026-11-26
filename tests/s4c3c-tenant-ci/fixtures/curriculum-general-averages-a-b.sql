-- C3-C.3.1/.2: catalog integrity and PostgreSQL numeric computation.
-- Tests use ONLY fictional UUIDs. Everything is rolled back.
BEGIN;
DO $tests$
DECLARE
 v_admin uuid:='00000000-0000-4000-8000-000000000001';
 v_school_a uuid:='00000000-0000-4000-8000-000000000010';
 v_school_b uuid:='00000000-0000-4000-8000-000000000011';
 v_year uuid:='00000000-0000-4000-8000-000000000020';
 v_class_a uuid:='00000000-0000-4000-8000-000000000030';
 v_class_b uuid:='00000000-0000-4000-8000-000000000031';
 v_period_a uuid:='00000000-0000-4000-8000-000000000040';
 v_period_b uuid:='00000000-0000-4000-8000-000000000041';
 v_math uuid:='00000000-0000-4000-8000-000000000050';
 v_fr uuid:='00000000-0000-4000-8000-000000000051';
 v_ca uuid;
 v_result jsonb;
 v_invalid boolean;
BEGIN
 INSERT INTO public.profiles(id) VALUES(v_admin);
 INSERT INTO public.schoolnet_schools(id,status) VALUES(v_school_a,'active'),(v_school_b,'active');
 INSERT INTO public.school_years(id) VALUES(v_year);
 INSERT INTO public.classes(id,school_id,school_year_id,learning_context)
 VALUES(v_class_a,v_school_a,v_year,'school'),(v_class_b,v_school_b,v_year,'school');
 INSERT INTO schoolnet_private.school_grading_periods(id,school_id,school_year_id,is_locked)
 VALUES(v_period_a,v_school_a,v_year,false),(v_period_b,v_school_b,v_year,false);
 INSERT INTO public.academic_subjects(id,is_active)
 VALUES(v_math,true),(v_fr,true);

 -- A cannot masquerade as B's class/period with an arbitrary school_id.
 v_invalid:=false;
 BEGIN
 INSERT INTO schoolnet_private.school_official_curricula(school_id,school_year_id,class_id,period_id)
 VALUES(v_school_a,v_year,v_class_b,v_period_a);
 EXCEPTION WHEN SQLSTATE '23514' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'A/B catalog mixing allowed'; END IF;
 RAISE NOTICE 'C3C3_PASS_FOREIGN_CLASS_REJECTED';

 v_invalid:=false;
 BEGIN
 INSERT INTO schoolnet_private.school_official_curricula(school_id,school_year_id,class_id,period_id)
 VALUES(v_school_a,v_year,v_class_a,v_period_b);
 EXCEPTION WHEN SQLSTATE '23514' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'A/B period mixing allowed'; END IF;
 RAISE NOTICE 'C3C3_PASS_FOREIGN_PERIOD_REJECTED';

 INSERT INTO schoolnet_private.school_official_curricula(school_id,school_year_id,class_id,period_id)
 VALUES(v_school_a,v_year,v_class_a,v_period_a) RETURNING id INTO v_ca;

 v_invalid:=false;
 BEGIN
 UPDATE schoolnet_private.school_official_curricula SET status='approved',approved_at=now(),approved_by=v_admin
 WHERE id=v_ca;
 EXCEPTION WHEN SQLSTATE '23514' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'empty curriculum approved'; END IF;
 RAISE NOTICE 'C3C3_PASS_EMPTY_APPROVAL_DENIED';

 INSERT INTO schoolnet_private.school_official_curriculum_subjects(curriculum_id,subject_id)
 VALUES(v_ca,v_math);
 UPDATE schoolnet_private.school_official_curricula
 SET status='approved',approved_at=now(),approved_by=v_admin WHERE id=v_ca;
 IF NOT EXISTS(SELECT 1 FROM schoolnet_private.school_official_curricula WHERE id=v_ca AND status='approved')
 THEN RAISE EXCEPTION 'catalog approval failed'; END IF;
 RAISE NOTICE 'C3C3_PASS_APPROVAL_WITH_SUBJECT';

 INSERT INTO schoolnet_private.school_official_curriculum_subjects(curriculum_id,subject_id)
 VALUES(v_ca,v_fr);
 IF NOT EXISTS(SELECT 1 FROM schoolnet_private.school_official_curricula
    WHERE id=v_ca AND status='draft' AND approved_at IS NULL AND approved_by IS NULL)
 THEN RAISE EXCEPTION 'catalog approval was not invalidated'; END IF;
 RAISE NOTICE 'C3C3_PASS_CATALOG_EDIT_INVALIDATES_APPROVAL';

 v_invalid:=false;
 BEGIN
  INSERT INTO schoolnet_private.school_official_curriculum_subjects(curriculum_id,subject_id)
  VALUES(v_ca,v_math);
 EXCEPTION WHEN unique_violation THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'duplicate subject allowed'; END IF;
 RAISE NOTICE 'C3C3_PASS_DUPLICATE_SUBJECT_DENIED';

 UPDATE schoolnet_private.school_grading_periods SET is_locked=true WHERE id=v_period_a;
 v_invalid:=false;
 BEGIN
 DELETE FROM schoolnet_private.school_official_curriculum_subjects
 WHERE curriculum_id=v_ca AND subject_id=v_fr;
 EXCEPTION WHEN SQLSTATE '23514' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'locked period allowed catalog edit'; END IF;
 RAISE NOTICE 'C3C3_PASS_LOCKED_PERIOD_DENIED';

 IF has_table_privilege('anon','schoolnet_private.school_official_curricula','SELECT')
 OR has_table_privilege('authenticated','schoolnet_private.school_official_curricula','SELECT')
 OR has_table_privilege('authenticated','schoolnet_private.school_official_curriculum_subjects','UPDATE')
 OR has_function_privilege('authenticated',
   'schoolnet_private.compute_official_general_average_preview(jsonb,jsonb,boolean,text)','EXECUTE')
 THEN RAISE EXCEPTION 'private catalog or engine exposed'; END IF;
 RAISE NOTICE 'C3C3_PASS_ROLE_GRANTS_DENIED';

 -- 15/20 coefficient 2 and 12/20 coefficient 1 => general 14.00.
 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":15,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":12,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF v_result->>'state'<>'ready' OR (v_result->>'averageOn20')::numeric<>14
 OR (v_result->>'previewOnly')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'incorrect multi-subject average: %',v_result; END IF;
 RAISE NOTICE 'C3C3_PASS_MULTI_SUBJECT_WEIGHTED_14';

 -- Arithmetic must defer rounding until the very end.
 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":2,"maxScore":3,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":13.34,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF (v_result->>'averageOn20')::numeric<>13.34
 THEN RAISE EXCEPTION 'premature rounding: %',v_result; END IF;
 RAISE NOTICE 'C3C3_PASS_FINAL_ONLY_ROUNDING';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":0,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":0,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF (v_result->>'averageOn20')::numeric<>0 THEN RAISE EXCEPTION 'published zero lost'; END IF;
 RAISE NOTICE 'C3C3_PASS_PUBLISHED_ZERO';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":null,"maxScore":20,"status":"unpublished","publishedAt":null}]'::jsonb,
 true,'active');
 IF v_result->>'state'<>'incomplete' OR v_result->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'missing note wrongly treated as zero'; END IF;
 RAISE NOTICE 'C3C3_PASS_MISSING_NOT_ZERO';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":null,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF v_result->>'state'<>'not_configured' OR v_result->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'missing coefficient wrongly accepted'; END IF;
 RAISE NOTICE 'C3C3_PASS_MISSING_COEFFICIENT_NOT_CONFIGURED';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"exemption_pending"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF v_result->>'state'<>'incomplete' OR v_result->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'pending exemption was ignored'; END IF;
 RAISE NOTICE 'C3C3_PASS_EXEMPTION_PENDING';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
    {"subjectId":"fr","coefficient":1,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"f1","subjectId":"fr","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'transfer_review');
 IF v_result->>'state'<>'incomplete' OR v_result->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'pending transfer ignored'; END IF;
 RAISE NOTICE 'C3C3_PASS_PENDING_TRANSFER';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 false,'active');
 IF v_result->>'state'<>'not_configured' OR v_result->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'non-approved catalog returned an average'; END IF;
 RAISE NOTICE 'C3C3_PASS_UNAPPROVED_HIDDEN';

 v_result:=schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"m1","subjectId":"math","coefficient":1,"includeInAverage":true,
     "score":20,"maxScore":20,"status":"published","publishedAt":"2026-11-25"},
    {"assessmentId":"m-excluded","subjectId":"math","coefficient":1,
     "includeInAverage":false,"score":0,"maxScore":20,
     "status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 IF (v_result->>'averageOn20')::numeric<>20
 THEN RAISE EXCEPTION 'excluded assessment counted'; END IF;
 RAISE NOTICE 'C3C3_PASS_EXCLUDED_ASSESSMENT';

 v_invalid:=false;
 BEGIN
 PERFORM schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"},
   {"subjectId":"math","coefficient":3,"participation":"required"}]'::jsonb,
 '[]'::jsonb,true,'active');
 EXCEPTION WHEN SQLSTATE '22023' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'duplicate subject allowed'; END IF;
 RAISE NOTICE 'C3C3_PASS_DUPLICATES_DENIED';

 v_invalid:=false;
 BEGIN
 PERFORM schoolnet_private.compute_official_general_average_preview(
 '[{"subjectId":"math","coefficient":2,"participation":"required"}]'::jsonb,
 '[{"assessmentId":"bad","subjectId":"math","coefficient":1,"includeInAverage":true,
    "score":22,"maxScore":20,"status":"published","publishedAt":"2026-11-25"}]'::jsonb,
 true,'active');
 EXCEPTION WHEN SQLSTATE '22023' THEN v_invalid:=true; END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'invalid score allowed'; END IF;
 RAISE NOTICE 'C3C3_PASS_INVALID_SCORE_DENIED';

END $tests$;
ROLLBACK;
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM schoolnet_private.school_official_curricula)
 AND NOT EXISTS (SELECT 1 FROM schoolnet_private.school_official_curriculum_subjects)
 THEN 'C3C3_ISOLATED_TESTS_ROLLED_BACK' ELSE 'C3C3_ROLLBACK_FAILED' END AS verdict;
