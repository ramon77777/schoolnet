-- C.3-B.2-UI: INCLUDED through \ir during parent A/B fixture transaction.
-- No independent BEGIN/COMMIT; all rows rolled back by parent.
-- Teacher A: only her school's one assigned subject and two periods.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $options_a$
DECLARE v jsonb; a jsonb; p jsonb;
BEGIN
 v:=public.schoolnet_teacher_official_average_options();
 IF v->>'teacherScoped'<>'true'
 OR jsonb_array_length(v->'assignments')<>1
 OR jsonb_array_length(v->'periods')<>2
 OR v ?| ARRAY['students','studentName','score','feedback','notes','rank']
 THEN RAISE EXCEPTION 'C3B2UI_A_METADATA_WRONG'; END IF;
 a:=v->'assignments'->0;
 IF a->>'schoolId'<>'20000000-0000-4000-8000-000000000001'
 OR a->>'schoolYearId'<>'30000000-0000-4000-8000-000000000001'
 OR a->>'classId'<>'50000000-0000-4000-8000-000000000001'
 OR a->>'subjectId'<>'40000000-0000-4000-8000-000000000001'
 OR a ?| ARRAY['studentId','studentName','score','feedback','answers']
 THEN RAISE EXCEPTION 'C3B2UI_A_ASSIGNMENT_WRONG'; END IF;
 FOR p IN SELECT x FROM jsonb_array_elements(v->'periods') AS t(x) LOOP
  IF p->>'schoolId'<>'20000000-0000-4000-8000-000000000001'
  OR p->>'schoolYearId'<>'30000000-0000-4000-8000-000000000001'
  THEN RAISE EXCEPTION 'C3B2UI_A_FOREIGN_PERIOD'; END IF;
 END LOOP;
 RAISE NOTICE 'C3B2UI_PASS_TEACHER_A_OWN_OPTIONS';
END $options_a$;
RESET ROLE;

-- Teacher B: exactly one separate school, one period; never sees A.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
DO $options_b$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_teacher_official_average_options();
 IF jsonb_array_length(v->'assignments')<>1 OR jsonb_array_length(v->'periods')<>1
 OR v->'assignments'->0->>'schoolId'<>'20000000-0000-4000-8000-000000000002'
 OR v->'periods'->0->>'schoolId'<>'20000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'C3B2UI_FOREIGN_OPTIONS_VISIBLE'; END IF;
 RAISE NOTICE 'C3B2UI_PASS_TEACHER_B_ISOLATED_OPTIONS';
END $options_b$;
RESET ROLE;

-- A member marked teacher but without active assignment sees empty metadata.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000008',true);
SET LOCAL ROLE authenticated;
DO $no_assignment$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_teacher_official_average_options();
 IF jsonb_array_length(v->'assignments')<>0 OR jsonb_array_length(v->'periods')<>0
 THEN RAISE EXCEPTION 'C3B2UI_UNASSIGNED_SHOULD_BE_EMPTY'; END IF;
 RAISE NOTICE 'C3B2UI_PASS_UNASSIGNED_EMPTY';
END $no_assignment$;
RESET ROLE;

-- School admins must not masquerade as teachers.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $admin$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_average_options();
  RAISE EXCEPTION 'C3B2UI_ADMIN_GAINED_TEACHER_OPTIONS';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2UI_PASS_ADMIN_DENIED'; END;
END $admin$;
RESET ROLE;

-- Anonymous never executes the public facade.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_average_options();
  RAISE EXCEPTION 'C3B2UI_ANON_GAINED_TEACHER_OPTIONS';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2UI_PASS_ANON_DENIED'; END;
END $anon$;
RESET ROLE;
