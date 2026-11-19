-- SCHOOLNET LOT 5D-G | Archive documents | SANDBOX_ONLY, PostgreSQL 17 CI.
-- NE PAS installer dans Supabase principal, SQL Editor, ou supabase/migrations.
-- This is a complementary candidate to 5D-A+B+E+F, NEVER an independent migration.
-- Tested solely on schoolnet_lot5d_ci (synthetic data), not a complete production schema.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $g5d_preflight$
BEGIN
 IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
    OR pg_catalog.current_setting('server_version_num')::int<170000
    OR pg_catalog.to_regnamespace('schoolnet_private') IS NULL
    OR pg_catalog.to_regclass('public.student_enrollment_documents') IS NULL
    OR pg_catalog.to_regclass('public.student_enrollments') IS NULL
    OR pg_catalog.to_regclass('public.school_year_rollover_runs') IS NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgname='trg_lot5dg_freeze_archived_enrollment_document'
         AND NOT tgisinternal)
 THEN RAISE EXCEPTION '5D-G: PostgreSQL 17 disposable fixture expected.'
   USING ERRCODE='42501'; END IF;
END;
$g5d_preflight$;

CREATE FUNCTION schoolnet_private.guard_lot5dg_closed_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $doc_guard$
DECLARE
 is_closed boolean;
BEGIN
 -- Synchronize incoming direct document DML against the finalizer's year lock.
 -- Must occur before reading run state; a possible wait ends before check.
 LOCK TABLE public.school_years IN SHARE MODE;
 IF TG_OP IN ('UPDATE','DELETE') THEN
   SELECT EXISTS (
     SELECT 1 FROM public.student_enrollments e
     JOIN public.school_year_rollover_runs r ON r.source_year_id=e.school_year_id
     WHERE e.id=OLD.enrollment_id
   ) INTO is_closed;
   IF is_closed THEN
     RAISE EXCEPTION '5D-G: a document tied to an archived enrollment is immutable.'
       USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   SELECT EXISTS (
     SELECT 1 FROM public.student_enrollments e
     JOIN public.school_year_rollover_runs r ON r.source_year_id=e.school_year_id
     WHERE e.id=NEW.enrollment_id
   ) INTO is_closed;
   IF is_closed THEN
     RAISE EXCEPTION '5D-G: a document cannot be linked to an archived enrollment.'
       USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$doc_guard$;
CREATE TRIGGER trg_lot5dg_freeze_archived_enrollment_document
 BEFORE INSERT OR UPDATE OR DELETE ON public.student_enrollment_documents
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5dg_closed_document();
REVOKE ALL ON FUNCTION schoolnet_private.guard_lot5dg_closed_document()
 FROM PUBLIC,anon,authenticated,service_role;
DO $g5d_postcheck$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='trg_lot5dg_freeze_archived_enrollment_document'
   AND NOT tgisinternal AND tgenabled='O'
 ) OR pg_catalog.has_function_privilege('authenticated',
   'schoolnet_private.guard_lot5dg_closed_document()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION '5D-G: failed to install sandbox trigger or revoke execute.'
   USING ERRCODE='42501'; END IF;
END;
$g5d_postcheck$;
COMMIT;
-- SANDBOX_ONLY. NOT FOR REAL SUPABASE DATABASE.
