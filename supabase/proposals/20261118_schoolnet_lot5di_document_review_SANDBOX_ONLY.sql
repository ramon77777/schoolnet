-- SCHOOLNET LOT 5D-I | REQUETE DE SUPPRESSION DOCUMENTAIRE TRACEE
-- SANDBOX_ONLY. JAMAIS dans Supabase principal / SQL Editor / migrations.
-- Prepare l'intention et l'audit mais NE SUPPRIME AUCUN OBJET STORAGE
-- ni aucune ligne student_enrollment_documents. Pas de service HTTP.
-- Doit être combine avec les gardes 5D-A/B/E/F/G/H, une migration
-- revue et un vrai backend privé à identité serveur avant tout GO.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $i_guard$
BEGIN
 IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
    OR pg_catalog.current_setting('server_version_num')::int<170000
    OR pg_catalog.to_regnamespace('schoolnet_private') IS NULL
    OR pg_catalog.to_regclass('public.school_year_rollover_runs') IS NULL
    OR pg_catalog.to_regclass('public.student_enrollment_documents') IS NULL
    OR pg_catalog.to_regclass('public.student_enrollments') IS NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
               JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='schoolnet_private'
                 AND c.relname='document_deletion_reviews')
 THEN RAISE EXCEPTION '5D-I : cette proposition exige une base PG17 jetable.'
   USING ERRCODE='42501'; END IF;
END;
$i_guard$;

CREATE TABLE schoolnet_private.document_deletion_reviews (
 operation_id uuid PRIMARY KEY,
 document_id uuid NOT NULL UNIQUE
   REFERENCES public.student_enrollment_documents(id) ON DELETE RESTRICT,
 enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 storage_path text NOT NULL,
 file_size_bytes bigint NOT NULL CHECK(file_size_bytes>0),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 justification text NOT NULL CHECK(pg_catalog.length(pg_catalog.btrim(justification))>=12),
 status text NOT NULL DEFAULT 'requested'
   CHECK (status IN ('requested','needs_review','backup_attested')),
 backup_path text,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CHECK (status <> 'backup_attested' OR backup_path IS NOT NULL)
);
CREATE TABLE schoolnet_private.document_deletion_review_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id uuid NOT NULL
   REFERENCES schoolnet_private.document_deletion_reviews(operation_id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 event_type text NOT NULL CHECK (event_type IN ('requested','needs_review','backup_attested')),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
-- Privileges intentionally narrow: new private tables are not exposed via API.
REVOKE ALL ON schoolnet_private.document_deletion_reviews,
 schoolnet_private.document_deletion_review_events
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION schoolnet_private.request_document_deletion_review(
 p_operation_id uuid,p_document_id uuid,p_actor_id uuid,p_justification text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $request$
DECLARE
 v_doc public.student_enrollment_documents%ROWTYPE;
 v_enroll public.student_enrollments%ROWTYPE;
 v_year public.school_years%ROWTYPE;
 v_old schoolnet_private.document_deletion_reviews%ROWTYPE;
BEGIN
 IF p_operation_id IS NULL OR p_document_id IS NULL
    OR p_actor_id IS NULL OR p_actor_id IS DISTINCT FROM auth.uid()
    OR NOT public.is_admin()
 THEN RAISE EXCEPTION '5D-I: administrateur verifie requis.' USING ERRCODE='42501'; END IF;
 IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_justification,'')))<12
    OR pg_catalog.length(p_justification)>600
 THEN RAISE EXCEPTION '5D-I: justification incorrecte.' USING ERRCODE='22023'; END IF;
 -- Year lock before reading document/enrollment: serializes with finalizer.
 LOCK TABLE public.school_years IN SHARE MODE;
 SELECT * INTO v_doc FROM public.student_enrollment_documents
   WHERE id=p_document_id FOR UPDATE;
 IF v_doc.id IS NULL THEN
   RAISE EXCEPTION '5D-I: document introuvable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_enroll FROM public.student_enrollments
   WHERE id=v_doc.enrollment_id;
 SELECT * INTO v_year FROM public.school_years
   WHERE id=v_enroll.school_year_id;
 IF v_year.id IS NULL OR NOT v_year.is_current
    OR v_enroll.status<>'active'::public.student_enrollment_status
    OR EXISTS (SELECT 1 FROM public.school_year_rollover_runs r
                WHERE r.source_year_id=v_year.id OR r.target_year_id=v_year.id)
 THEN RAISE EXCEPTION '5D-I: dossier annuel non modifiable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_old FROM schoolnet_private.document_deletion_reviews
   WHERE operation_id=p_operation_id FOR UPDATE;
 IF v_old.operation_id IS NOT NULL THEN
    IF v_old.document_id IS DISTINCT FROM p_document_id
       OR v_old.actor_id IS DISTINCT FROM p_actor_id
    THEN RAISE EXCEPTION '5D-I: identifiant operation reutilise.' USING ERRCODE='42501'; END IF;
    RETURN pg_catalog.jsonb_build_object('operation_id',p_operation_id,
      'status',v_old.status,'already_requested',true);
 END IF;
 -- One open request per document; never start multiple deletion processes.
 INSERT INTO schoolnet_private.document_deletion_reviews
  (operation_id,document_id,enrollment_id,school_year_id,
   storage_path,file_size_bytes,actor_id,justification)
 VALUES (p_operation_id,v_doc.id,v_doc.enrollment_id,v_year.id,
         v_doc.storage_path,v_doc.size_bytes,p_actor_id,pg_catalog.btrim(p_justification));
 INSERT INTO schoolnet_private.document_deletion_review_events
  (operation_id,actor_id,event_type) VALUES (p_operation_id,p_actor_id,'requested');
 RETURN pg_catalog.jsonb_build_object('operation_id',p_operation_id,
   'status','requested','already_requested',false);
END;
$request$;

-- Never allow finalization of an annual source with any outstanding
-- deletion review. It also prevents a race after request commit: the
-- finalizer acquires SHARE ROW EXCLUSIVE on school_years before its UPDATE.
CREATE FUNCTION schoolnet_private.guard_year_with_pending_document_review()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $block$
BEGIN
 IF OLD.is_current IS TRUE AND NEW.is_current IS FALSE
    AND EXISTS (
      SELECT 1 FROM schoolnet_private.document_deletion_reviews r
      WHERE r.school_year_id=OLD.id
    )
 THEN RAISE EXCEPTION
  '5D-I: annee avec demande de suppression documentaire non resolue.'
  USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$block$;
CREATE TRIGGER trg_lot5di_no_rollover_during_document_review
 BEFORE UPDATE OF is_current ON public.school_years
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_year_with_pending_document_review();

-- No public or service_role execute. The future backend MUST use a
-- dedicated private DB role and verified server identity in one transaction.
REVOKE ALL ON FUNCTION
 schoolnet_private.request_document_deletion_review(uuid,uuid,uuid,text),
 schoolnet_private.guard_year_with_pending_document_review()
 FROM PUBLIC,anon,authenticated,service_role;
DO $i_check$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
     'schoolnet_private.request_document_deletion_review(uuid,uuid,uuid,text)'::regprocedure,'EXECUTE')
   OR pg_catalog.has_function_privilege('service_role',
     'schoolnet_private.request_document_deletion_review(uuid,uuid,uuid,text)'::regprocedure,'EXECUTE')
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgname='trg_lot5di_no_rollover_during_document_review'
        AND NOT tgisinternal AND tgenabled='O')
 THEN RAISE EXCEPTION '5D-I: privilege/trigger postcheck failed.'
   USING ERRCODE='42501'; END IF;
END;
$i_check$;
COMMIT;
-- No calls to storage.objects, Storage API, or document delete.
-- No table grants or functions in exposed public schema.
-- Pending requests can block a rollout intentionally until reviewed
-- and resolved with a separately approved backup/reconciliation workflow.
