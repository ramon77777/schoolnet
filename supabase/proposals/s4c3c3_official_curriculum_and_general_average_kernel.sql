-- SCHOOLNET V2 — S4-C.3-C.3.1/.2 — DRAFT SQL ONLY.
-- Never install on the main Supabase project without distinct approval.
-- No publicly callable RPC; only future C.3-C.3.3 can authorize and assemble input.
-- Neither scores nor legacy V1 report cards are written or exposed.

DO $preflight$
BEGIN
  IF to_regclass('schoolnet_private.school_grading_periods') IS NULL
     OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.schoolnet_schools') IS NULL
     OR to_regclass('public.school_years') IS NULL
     OR to_regclass('public.academic_subjects') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('schoolnet_private.school_official_curricula') IS NOT NULL
     OR to_regprocedure('schoolnet_private.compute_official_general_average_preview(jsonb,jsonb,boolean,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'C3C3_PREFLIGHT_FAILED'; END IF;
END $preflight$;

CREATE TABLE schoolnet_private.school_official_curricula (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
 school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
 class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
 approved_at timestamptz,
 approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT c3c3_approval_consistent CHECK (
   (status='draft' AND approved_at IS NULL AND approved_by IS NULL)
   OR (status='approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
 ),
 CONSTRAINT c3c3_unique_class_period UNIQUE (period_id,class_id)
);
CREATE INDEX c3c3_curricula_school_year
 ON schoolnet_private.school_official_curricula(school_id,school_year_id,class_id);

CREATE TABLE schoolnet_private.school_official_curriculum_subjects (
 curriculum_id uuid NOT NULL REFERENCES schoolnet_private.school_official_curricula(id) ON DELETE RESTRICT,
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
 added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (curriculum_id,subject_id)
);

CREATE FUNCTION schoolnet_private.c3c3_check_curriculum_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $check$
DECLARE v_count int;
BEGIN
 IF TG_OP='UPDATE'
   AND (NEW.school_id,NEW.school_year_id,NEW.class_id,NEW.period_id)
    IS DISTINCT FROM (OLD.school_id,OLD.school_year_id,OLD.class_id,OLD.period_id)
 THEN RAISE EXCEPTION 'C3C3_IMMUTABLE_SCOPE' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.schoolnet_schools s
   JOIN schoolnet_private.school_grading_periods p ON p.school_id=s.id
     AND p.school_year_id=NEW.school_year_id
   JOIN public.classes c ON c.id=NEW.class_id AND c.school_id=s.id
     AND c.school_year_id=NEW.school_year_id AND c.learning_context='school'
   WHERE s.id=NEW.school_id AND s.status='active'
     AND p.id=NEW.period_id AND p.is_locked=false
 ) THEN RAISE EXCEPTION 'C3C3_INVALID_SCHOOL_CONTEXT_OR_LOCKED' USING ERRCODE='23514'; END IF;
 IF NEW.status='approved' THEN
   SELECT count(*) INTO v_count FROM schoolnet_private.school_official_curriculum_subjects cs
   WHERE cs.curriculum_id=NEW.id;
   IF v_count=0 THEN
     RAISE EXCEPTION 'C3C3_EMPTY_APPROVED_CURRICULUM' USING ERRCODE='23514';
   END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $check$;
CREATE TRIGGER c3c3_check_curriculum_context
BEFORE INSERT OR UPDATE ON schoolnet_private.school_official_curricula
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.c3c3_check_curriculum_context();

CREATE FUNCTION schoolnet_private.c3c3_subject_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $subject$
DECLARE v_catalog uuid;
BEGIN
 v_catalog:=CASE WHEN TG_OP='DELETE' THEN OLD.curriculum_id ELSE NEW.curriculum_id END;
 IF TG_OP IN ('INSERT','UPDATE') AND NOT EXISTS (
   SELECT 1 FROM public.academic_subjects s
   WHERE s.id=NEW.subject_id AND s.is_active=true
 ) THEN RAISE EXCEPTION 'C3C3_INACTIVE_SUBJECT' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
 THEN RAISE EXCEPTION 'C3C3_IMMUTABLE_SUBJECT_SCOPE' USING ERRCODE='23514'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND (
   SELECT count(*) FROM schoolnet_private.school_official_curriculum_subjects cs
   WHERE cs.curriculum_id=v_catalog
 ) >= 80 THEN
   RAISE EXCEPTION 'C3C3_TOO_MANY_SUBJECTS' USING ERRCODE='54000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM schoolnet_private.school_official_curricula ca
   JOIN schoolnet_private.school_grading_periods p ON p.id=ca.period_id
   WHERE ca.id=v_catalog AND p.is_locked=false
 ) THEN RAISE EXCEPTION 'C3C3_CURRICULUM_LOCKED' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $subject$;
CREATE TRIGGER c3c3_subject_change_before
BEFORE INSERT OR UPDATE OR DELETE ON schoolnet_private.school_official_curriculum_subjects
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.c3c3_subject_change();

CREATE FUNCTION schoolnet_private.c3c3_invalidate_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $invalidate$
BEGIN
 UPDATE schoolnet_private.school_official_curricula
 SET status='draft',approved_at=NULL,approved_by=NULL,updated_at=now()
 WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.curriculum_id ELSE NEW.curriculum_id END
   AND status='approved';
 RETURN NULL;
END $invalidate$;
CREATE TRIGGER c3c3_invalidate_approval
AFTER INSERT OR UPDATE OR DELETE ON schoolnet_private.school_official_curriculum_subjects
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.c3c3_invalidate_approval();

ALTER TABLE schoolnet_private.school_official_curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_official_curriculum_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_private.school_official_curricula FROM PUBLIC,anon,authenticated;
REVOKE ALL ON schoolnet_private.school_official_curriculum_subjects FROM PUBLIC,anon,authenticated;
-- Intentionally no client RLS policies. Future school_admin RPC checks auth.uid()
-- and school membership on EVERY read or write. Teacher/Parent/Student get no
-- direct table read or function execute.

-- Pure math kernel: only consumes server-validated input projected by future
-- C.3-C.3.3 RPC. It does NOT read a user's school, submissions, or roster.
-- The RPC must not trust scope, approval or enrollment values from a browser.
CREATE FUNCTION schoolnet_private.compute_official_general_average_preview(
 p_expected jsonb, p_assessments jsonb,
 p_catalog_approved boolean, p_enrollment_state text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $average$
DECLARE
 v_subject jsonb; v_assessment jsonb;
 v_subject_id text; v_assessment_id text;
 v_subject_ids text[]:=ARRAY[]::text[];
 v_assessment_ids text[]:=ARRAY[]::text[];
 v_coef numeric; v_ecoef numeric; v_score numeric; v_max numeric;
 v_weighted numeric; v_weights numeric; v_subject_exact numeric;
 v_general_weighted numeric:=0; v_general_weights numeric:=0;
 v_included int; v_published int;
 v_subject_state text; v_state text;
 v_all_subjects jsonb:='[]'::jsonb;
 v_ready int:=0; v_not_configured boolean:=false;
 v_incomplete boolean:=false;
BEGIN
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_assessments) IS DISTINCT FROM 'array'
   OR p_catalog_approved IS NULL
   OR p_enrollment_state NOT IN ('active','transfer_review')
   OR p_enrollment_state IS NULL
 THEN RAISE EXCEPTION 'C3C3_INVALID_CONTRACT' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_expected)>60 OR jsonb_array_length(p_assessments)>500
 THEN RAISE EXCEPTION 'C3C3_TOO_MANY_ITEMS' USING ERRCODE='54000'; END IF;

 -- Validate the entire caller-verified catalogue before the computation.
 FOR v_subject IN SELECT value FROM jsonb_array_elements(p_expected)
 LOOP
   IF jsonb_typeof(v_subject) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_subject->'subjectId') IS DISTINCT FROM 'string'
   THEN RAISE EXCEPTION 'C3C3_INVALID_SUBJECT' USING ERRCODE='22023'; END IF;
   v_subject_id:=nullif(btrim(v_subject->>'subjectId'),'');
   IF v_subject_id IS NULL OR length(v_subject_id)>100
     OR v_subject_id=ANY(v_subject_ids)
   THEN RAISE EXCEPTION 'C3C3_INVALID_OR_DUPLICATE_SUBJECT' USING ERRCODE='22023'; END IF;
   IF v_subject->>'participation' NOT IN ('required','exemption_pending')
      OR v_subject->>'participation' IS NULL
   THEN RAISE EXCEPTION 'C3C3_INVALID_PARTICIPATION' USING ERRCODE='22023'; END IF;
   IF v_subject ? 'coefficient' AND jsonb_typeof(v_subject->'coefficient')
       NOT IN ('number','null')
   THEN RAISE EXCEPTION 'C3C3_INVALID_SUBJECT_COEFFICIENT' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(v_subject->'coefficient')='number'
      AND (v_subject->>'coefficient')::numeric NOT BETWEEN 0.25 AND 20
   THEN RAISE EXCEPTION 'C3C3_INVALID_SUBJECT_COEFFICIENT' USING ERRCODE='22023'; END IF;
   v_subject_ids:=array_append(v_subject_ids,v_subject_id);
 END LOOP;

 -- Validate the full assessment set; duplicates, unexpected subjects and
 -- out-of-range scores must not become invisible through aggregation.
 FOR v_assessment IN SELECT value FROM jsonb_array_elements(p_assessments)
 LOOP
   IF jsonb_typeof(v_assessment) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_assessment->'assessmentId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_assessment->'subjectId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_assessment->'includeInAverage') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_assessment->'coefficient') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_assessment->'status') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_assessment->'score') NOT IN ('number','null')
    OR jsonb_typeof(v_assessment->'maxScore') NOT IN ('number','null')
   THEN RAISE EXCEPTION 'C3C3_INVALID_ASSESSMENT' USING ERRCODE='22023'; END IF;
   v_assessment_id:=nullif(btrim(v_assessment->>'assessmentId'),'');
   IF v_assessment_id IS NULL OR length(v_assessment_id)>100
    OR v_assessment_id=ANY(v_assessment_ids)
   THEN RAISE EXCEPTION 'C3C3_DUPLICATE_OR_EMPTY_ASSESSMENT' USING ERRCODE='22023'; END IF;
   IF NOT (v_assessment->>'subjectId'=ANY(v_subject_ids))
   THEN RAISE EXCEPTION 'C3C3_UNEXPECTED_SUBJECT' USING ERRCODE='22023'; END IF;
   v_ecoef:=(v_assessment->>'coefficient')::numeric;
   IF v_ecoef NOT BETWEEN 0.25 AND 20
   THEN RAISE EXCEPTION 'C3C3_INVALID_EVAL_COEFFICIENT' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(v_assessment->'score')='number'
     AND jsonb_typeof(v_assessment->'maxScore')='number'
   THEN
     v_score:=(v_assessment->>'score')::numeric;
     v_max:=(v_assessment->>'maxScore')::numeric;
     IF v_max<=0 OR v_score<0 OR v_score>v_max
     THEN RAISE EXCEPTION 'C3C3_INVALID_SCORE' USING ERRCODE='22023'; END IF;
   END IF;
   v_assessment_ids:=array_append(v_assessment_ids,v_assessment_id);
 END LOOP;

 FOR v_subject IN SELECT value FROM jsonb_array_elements(p_expected)
 LOOP
   v_subject_id:=v_subject->>'subjectId';
   v_coef:=NULL;
   IF jsonb_typeof(v_subject->'coefficient')='number'
   THEN v_coef:=(v_subject->>'coefficient')::numeric; END IF;
   v_included:=0; v_published:=0; v_weighted:=0; v_weights:=0;
   FOR v_assessment IN SELECT value FROM jsonb_array_elements(p_assessments)
   LOOP
     IF v_assessment->>'subjectId' <> v_subject_id
       OR (v_assessment->>'includeInAverage')::boolean IS DISTINCT FROM true
     THEN CONTINUE; END IF;
     v_included:=v_included+1;
     IF v_assessment->>'status'='published'
       AND jsonb_typeof(v_assessment->'score')='number'
       AND jsonb_typeof(v_assessment->'maxScore')='number'
       AND jsonb_typeof(v_assessment->'publishedAt')='string'
       AND nullif(btrim(v_assessment->>'publishedAt'),'') IS NOT NULL
     THEN
       v_score:=(v_assessment->>'score')::numeric;
       v_max:=(v_assessment->>'maxScore')::numeric;
       v_ecoef:=(v_assessment->>'coefficient')::numeric;
       IF v_max<=0 OR v_score<0 OR v_score>v_max
       THEN RAISE EXCEPTION 'C3C3_INVALID_SCORE' USING ERRCODE='22023'; END IF;
       v_published:=v_published+1;
       v_weighted:=v_weighted + (v_score*20/v_max)*v_ecoef;
       v_weights:=v_weights+v_ecoef;
     END IF;
   END LOOP;
   v_subject_exact:=NULL;
   IF v_coef IS NULL OR v_included=0
   THEN v_subject_state:='not_configured';v_not_configured:=true;
   ELSIF v_subject->>'participation'='exemption_pending'
     OR v_published<>v_included OR v_weights<=0
   THEN v_subject_state:='incomplete';v_incomplete:=true;
   ELSE
     v_subject_state:='ready';v_ready:=v_ready+1;
     v_subject_exact:=v_weighted/v_weights;
     v_general_weighted:=v_general_weighted + v_subject_exact*v_coef;
     v_general_weights:=v_general_weights+v_coef;
   END IF;
   v_all_subjects:=v_all_subjects||jsonb_build_array(jsonb_build_object(
     'subjectId',v_subject_id,
     'coefficient',v_coef,
     'state',v_subject_state,
     'averageOn20',CASE WHEN p_catalog_approved AND p_enrollment_state='active'
                              AND v_subject_state='ready'
                       THEN round(v_subject_exact,2) ELSE NULL END,
     'includedAssessments',v_included,
     'publishedAssessments',v_published,
     'missingAssessments',v_included-v_published
   ));
 END LOOP;

 IF NOT p_catalog_approved OR jsonb_array_length(p_expected)=0 OR v_not_configured
 THEN v_state:='not_configured';
 ELSIF p_enrollment_state<>'active' OR v_incomplete
 THEN v_state:='incomplete';
 ELSE v_state:='ready'; END IF;

 RETURN jsonb_build_object(
   'previewOnly',true,
   'state',v_state,
   'averageOn20',CASE WHEN v_state='ready' AND v_general_weights>0
                       THEN round(v_general_weighted/v_general_weights,2)
                       ELSE NULL END,
   'expectedSubjects',jsonb_array_length(p_expected),
   'readySubjects',v_ready,
   'subjects',v_all_subjects
 );
END $average$;

REVOKE ALL ON FUNCTION schoolnet_private.compute_official_general_average_preview(jsonb,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.c3c3_check_curriculum_context() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.c3c3_subject_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.c3c3_invalidate_approval() FROM PUBLIC,anon,authenticated;

SELECT 'C3C3_PRIVATE_CATALOG_AND_KERNEL_PROPOSED_ONLY' AS verdict;
