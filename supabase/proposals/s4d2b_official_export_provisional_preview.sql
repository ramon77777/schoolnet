-- SCHOOLNET V2 S4-D.2b.1 -- candidate SQL, DISPOSABLE AUTH/JWT TEST FIRST.
-- This is NOT a production migration. Do not run on schoolnet_2.0.
-- READ ONLY school-grade projection, with private metadata-only issue audit.
-- Dependencies: unchanged teacher C.3-B.2 and admin C.3-C.3.3 RPCs.
-- This creates no bulletin, official publication, PDF or XLSX file.
DO $preflight$
BEGIN
 IF to_regprocedure('public.schoolnet_school_official_general_averages(uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 OR to_regclass('schoolnet_private.school_export_preview_audit') IS NOT NULL
 OR to_regprocedure('public.schoolnet_official_export_preview(uuid,uuid,uuid,text,uuid,text,text)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.school_official_export_preview(uuid,uuid,uuid,text,uuid,text,text)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'S4D2B_MISSING_DEPENDENCY_OR_ALREADY_INSTALLED';
 END IF;
END $preflight$;

CREATE TABLE schoolnet_private.school_export_preview_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 school_id uuid NOT NULL,
 school_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 period_id uuid NOT NULL,
 subject_id uuid,
 projection_kind text NOT NULL CHECK (projection_kind IN ('subject_period','class_general')),
 export_format text NOT NULL CHECK (export_format IN ('pdf','xlsx')),
 document_state text NOT NULL CHECK (document_state='provisional'),
 student_count integer NOT NULL CHECK (student_count BETWEEN 1 AND 250),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX s4d2b_export_issue_audit_scope
 ON schoolnet_private.school_export_preview_audit(school_id,created_at);
ALTER TABLE schoolnet_private.school_export_preview_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_private.school_export_preview_audit
 FROM PUBLIC,anon,authenticated;
-- No RLS policies and no SELECT grants for clients. Only the private
-- authenticated/authorized function below writes non-sensitive audit metadata.

CREATE FUNCTION schoolnet_private.school_official_export_preview(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_kind text,p_subject_id uuid,p_format text,p_document_state text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE
 v_uid uuid:=auth.uid();
 v_role text;
 v_source jsonb;
 v_students jsonb:='[]'::jsonb;
 v_item jsonb;
 v_row_state text;
 v_completed integer;
 v_expected integer;
 v_average numeric;
 v_name text;
 v_year uuid;
 v_count integer;
 v_audit_id uuid;
 v_completion_unit text;
BEGIN
 -- No user id is accepted from the client; no JWT user_metadata decisions.
 IF v_uid IS NULL OR p_school_id IS NULL OR p_period_id IS NULL
 OR p_class_id IS NULL OR p_kind IS NULL
 OR p_kind NOT IN ('subject_period','class_general')
 OR p_format IS NULL OR p_format NOT IN ('pdf','xlsx')
 OR p_document_state IS DISTINCT FROM 'provisional'
 OR (p_kind='subject_period' AND p_subject_id IS NULL)
 OR (p_kind='class_general' AND p_subject_id IS NOT NULL)
 THEN RAISE EXCEPTION 'S4D2B_ACCESS_OR_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;

 v_role:=public.get_my_role()::text;
 IF v_role NOT IN ('school_admin','teacher')
 OR NOT EXISTS (
    SELECT 1 FROM public.schoolnet_school_memberships m
    WHERE m.school_id=p_school_id AND m.user_id=v_uid
      AND m.member_role=v_role AND m.status='active' AND m.revoked_at IS NULL
 )
 THEN RAISE EXCEPTION 'S4D2B_ACCESS_OR_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;

 -- SECURE SOURCE: these existing helpers authorize the EXACT school, class,
 -- year, period, teacher assignment and curricular approvals.
 -- The export function must not query raw submissions, grades, enrollments,
 -- or take score arrays/teacher identity from the caller.
 IF v_role='school_admin' AND p_kind='class_general' THEN
   v_source:=schoolnet_private.school_official_general_averages(
      p_school_id,p_period_id,p_class_id);
   IF v_source->>'schoolAdminScoped' IS DISTINCT FROM 'true'
   OR v_source->>'previewOnly' IS DISTINCT FROM 'true'
   OR v_source->>'state' IS DISTINCT FROM 'preview'
   THEN RAISE EXCEPTION 'S4D2B_CURRICULUM_NOT_APPROVED' USING ERRCODE='42501'; END IF;
   v_completion_unit:='matières';
 ELSIF v_role='teacher' AND p_kind='subject_period' THEN
   v_source:=schoolnet_private.teacher_official_subject_averages(
      p_school_id,p_period_id,p_class_id,p_subject_id);
   IF v_source->>'teacherScoped' IS DISTINCT FROM 'true'
   OR v_source->>'previewOnly' IS DISTINCT FROM 'true'
   OR v_source->>'subjectId' IS DISTINCT FROM p_subject_id::text
   OR v_source->'subjectCoefficient' IS NULL
   OR jsonb_typeof(v_source->'subjectCoefficient') IS DISTINCT FROM 'number'
   OR (v_source->>'subjectCoefficient')::numeric <= 0
   THEN RAISE EXCEPTION 'S4D2B_SUBJECT_NOT_CONFIGURED' USING ERRCODE='42501'; END IF;
   v_completion_unit:='évaluations';
 ELSE
   -- Not yet implemented: school-admin-by-subject and delegated teacher
   -- schoolwide results. Explicitly reject, never broaden permissions.
   RAISE EXCEPTION 'S4D2B_EXPORT_PERMISSION_NOT_IMPLEMENTED' USING ERRCODE='42501';
 END IF;

 IF v_source->>'schoolId' IS DISTINCT FROM p_school_id::text
 OR v_source->>'classId' IS DISTINCT FROM p_class_id::text
 OR v_source->>'periodId' IS DISTINCT FROM p_period_id::text
 OR (v_source->>'schoolYearId') IS NULL
 OR jsonb_typeof(v_source->'students') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'S4D2B_INVALID_UPSTREAM_SCOPE' USING ERRCODE='42501'; END IF;

 v_year:=(v_source->>'schoolYearId')::uuid;
 v_count:=jsonb_array_length(v_source->'students');
 IF v_count NOT BETWEEN 1 AND 250
 OR (v_role='school_admin' AND
   (v_source->>'studentCount')::integer IS DISTINCT FROM v_count)
 THEN RAISE EXCEPTION 'S4D2B_INVALID_UPSTREAM_ROSTER' USING ERRCODE='42501'; END IF;

 FOR v_item IN SELECT value FROM jsonb_array_elements(v_source->'students') LOOP
  IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
  OR v_item->>'state' IS NULL
  OR v_item->>'state' NOT IN ('ready','incomplete','not_configured')
  OR jsonb_typeof(v_item->'studentId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(v_item->'studentName') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'S4D2B_INVALID_ROW' USING ERRCODE='42501'; END IF;

  v_row_state:=v_item->>'state';
  v_name:=btrim(v_item->>'studentName');
  IF v_name='' OR char_length(v_name)>120
   THEN RAISE EXCEPTION 'S4D2B_INVALID_NAME' USING ERRCODE='42501'; END IF;
  IF v_role='school_admin' THEN
    v_completed:=(v_item->>'readySubjects')::integer;
    v_expected:=(v_item->>'expectedSubjects')::integer;
  ELSE
    v_completed:=(v_item->>'publishedAssessments')::integer;
    v_expected:=(v_item->>'includedAssessments')::integer;
  END IF;
  IF v_completed<0 OR v_expected<1 OR v_completed>v_expected
  OR (v_row_state='ready' AND v_completed<>v_expected)
  OR (v_row_state='ready' AND jsonb_typeof(v_item->'averageOn20') IS DISTINCT FROM 'number')
  OR (v_row_state<>'ready' AND jsonb_typeof(v_item->'averageOn20') IS DISTINCT FROM 'null')
  THEN RAISE EXCEPTION 'S4D2B_INVALID_COMPLETENESS' USING ERRCODE='42501'; END IF;

  v_average:=CASE WHEN v_row_state='ready'
    THEN (v_item->>'averageOn20')::numeric ELSE NULL END;
  IF v_average IS NOT NULL AND (v_average<0 OR v_average>20)
  THEN RAISE EXCEPTION 'S4D2B_INVALID_AVERAGE' USING ERRCODE='42501'; END IF;

  -- Only these six fields leave the private helper. No raw grade, submission,
  -- teacher identity, assessment answer, contact, or V1 record is returned.
  v_students:=v_students||jsonb_build_array(jsonb_build_object(
     'studentId',v_item->>'studentId',
     'studentName',v_name,
     'state',v_row_state,
     'averageOn20',v_average,
     'completedItems',v_completed,
     'expectedItems',v_expected
  ));
 END LOOP;

 INSERT INTO schoolnet_private.school_export_preview_audit (
   actor_id,school_id,school_year_id,class_id,period_id,
   subject_id,projection_kind,export_format,document_state,student_count
 ) VALUES (
   v_uid,p_school_id,v_year,p_class_id,p_period_id,
   p_subject_id,p_kind,p_format,p_document_state,v_count
 ) RETURNING id INTO v_audit_id;

 RETURN jsonb_build_object(
   'projection','schoolnet_v2_export_provisional_v1',
   'previewOnly',true,
   'documentState','provisional',
   'kind',p_kind,'format',p_format,
   'schoolId',p_school_id,'schoolYearId',v_year,
   'classId',p_class_id,'periodId',p_period_id,
   'subjectId',p_subject_id,
   'completionUnit',v_completion_unit,
   'studentCount',v_count,'students',v_students,
   'auditId',v_audit_id
 );
END $body$;

-- Only a SECURITY INVOKER facade is exposed to PostgREST.
CREATE FUNCTION public.schoolnet_official_export_preview(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_kind text,p_subject_id uuid,p_format text,p_document_state text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog AS $wrapper$
 SELECT schoolnet_private.school_official_export_preview(
  p_school_id,p_period_id,p_class_id,
  p_kind,p_subject_id,p_format,p_document_state
 );
$wrapper$;

REVOKE ALL ON FUNCTION schoolnet_private.school_official_export_preview(
 uuid,uuid,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_official_export_preview(
 uuid,uuid,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.school_official_export_preview(
 uuid,uuid,uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_official_export_preview(
 uuid,uuid,uuid,text,uuid,text,text) TO authenticated;

DO $postflight$
BEGIN
 IF has_function_privilege('anon',
 'public.schoolnet_official_export_preview(uuid,uuid,uuid,text,uuid,text,text)','EXECUTE')
 OR has_table_privilege('authenticated',
   'schoolnet_private.school_export_preview_audit','SELECT')
 OR has_table_privilege('anon',
   'schoolnet_private.school_export_preview_audit','INSERT')
 THEN RAISE EXCEPTION 'S4D2B_UNSAFE_EXPORT_GRANT'; END IF;
END $postflight$;
SELECT 'S4D2B_CANDIDATE_DISPOSABLE_ONLY' AS verdict;
