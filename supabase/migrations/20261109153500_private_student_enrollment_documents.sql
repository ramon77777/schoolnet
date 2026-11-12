-- SCHOOLNET | Lot 5.B.2 — Pieces justificatives scolaires privees.
-- PREPARATION SEULEMENT : aucune application a schoolnet_2.0 sans autorisation.
-- Documents administratifs sensibles : aucune URL publique et aucun bucket public.
-- V1 : depot, lecture et retrait par l'Administration uniquement.
-- Parent/Apprenant ne recupere ni fichier ni metadata tant qu'un parcours
-- documentaire familial distinct n'a pas ete valide.

DO $schoolnet_docs_preflight$
BEGIN
  IF to_regclass('public.student_enrollments') IS NULL
     OR to_regclass('public.student_enrollment_documents') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc
       WHERE oid=to_regprocedure('public.is_admin()')
     )
     OR EXISTS (
       SELECT 1 FROM storage.buckets
       WHERE id='student-enrollment-documents'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='storage'
         AND tablename='objects'
         AND policyname LIKE 'schoolnet_enrollment_docs_%'
     )
  THEN
    RAISE EXCEPTION 'SCHOOLNET Lot 5.B.2 : prerequisites non conformes';
  END IF;
END
$schoolnet_docs_preflight$;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'student-enrollment-documents',
  'student-enrollment-documents',
  false,
  10485760,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp']::text[]
);

CREATE TABLE public.student_enrollment_documents (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id)
    ON DELETE RESTRICT,
  document_type text NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT schoolnet_enrollment_docs_type_check
    CHECK (document_type IN (
      'birth_certificate',
      'previous_report',
      'transfer_certificate',
      'identity_photo',
      'other'
    )),
  CONSTRAINT schoolnet_enrollment_docs_filename_check
    CHECK (pg_catalog.length(pg_catalog.btrim(original_filename)) BETWEEN 1 AND 255),
  CONSTRAINT schoolnet_enrollment_docs_size_check
    CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT schoolnet_enrollment_docs_mime_check
    CHECK (mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
  CONSTRAINT schoolnet_enrollment_docs_path_check
    CHECK (
      pg_catalog.split_part(storage_path,'/',1)=enrollment_id::text
      AND pg_catalog.split_part(storage_path,'/',2)<>''
      AND pg_catalog.split_part(storage_path,'/',3)=''
    )
);

CREATE INDEX idx_student_enrollment_documents_enrollment
ON public.student_enrollment_documents(enrollment_id,created_at DESC);

ALTER TABLE public.student_enrollment_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.student_enrollment_documents
  FROM PUBLIC,anon,authenticated;

GRANT SELECT,INSERT,DELETE ON TABLE public.student_enrollment_documents
  TO authenticated;

CREATE POLICY schoolnet_enrollment_docs_admin_select
ON public.student_enrollment_documents
FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

CREATE POLICY schoolnet_enrollment_docs_admin_insert
ON public.student_enrollment_documents
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_admin())
  AND uploaded_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='student-enrollment-documents'
      AND o.name=storage_path
  )
);

CREATE POLICY schoolnet_enrollment_docs_admin_delete
ON public.student_enrollment_documents
FOR DELETE TO authenticated
USING ((SELECT public.is_admin()));

-- La politique storage ne s'applique QU'au bucket prive indique.
-- Le premier repertoire est obligatoirement l'UUID d'un dossier scolaire existant.
-- Aucun acces storage direct aux roles Parent/Apprenant/Enseignant.
CREATE POLICY schoolnet_enrollment_docs_storage_admin_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'student-enrollment-documents'
  AND (SELECT public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    WHERE se.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY schoolnet_enrollment_docs_storage_admin_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'student-enrollment-documents'
  AND (SELECT public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    WHERE se.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY schoolnet_enrollment_docs_storage_admin_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'student-enrollment-documents'
  AND (SELECT public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    WHERE se.id::text = (storage.foldername(name))[1]
  )
);

COMMENT ON TABLE public.student_enrollment_documents
IS 'SCHOOLNET — pieces justificatives privees des dossiers annuels. Acces Administration uniquement.';
