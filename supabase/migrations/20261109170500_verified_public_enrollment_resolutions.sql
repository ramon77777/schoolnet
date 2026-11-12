-- SCHOOLNET | Lot 5.C - Finalisation verifiee des demandes publiques.
-- PREPARATION SEULEMENT : ne pas appliquer a schoolnet_2.0 sans nouvelle autorisation.
-- Les comptes Auth et dossiers scolaires sont crees par les modules existants.
-- La fonction finalise la demande, rattache le parent a l'enfant si necessaire,
-- et conserve une preuve referentielle et horodatee. Aucune creation Auth.
--
-- Prerequis : 29 migrations deja appliquees, les tables ci-dessous existent,
-- parent_links_unique, et la RPC admin_review_public_enrollment_request.
DO $schoolnet_lot5c_preflight$
BEGIN
  IF to_regclass('public.public_enrollment_requests') IS NULL
    OR to_regclass('public.public_enrollment_request_events') IS NULL
    OR to_regclass('public.student_enrollments') IS NULL
    OR to_regclass('public.parent_links') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.public_enrollment_request_resolutions') IS NOT NULL
    OR to_regprocedure('public.admin_review_public_enrollment_request(uuid,text,text)') IS NULL
    OR to_regprocedure('public.is_admin()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.parent_links'::regclass
        AND conname='parent_links_unique'
    )
  THEN
    RAISE EXCEPTION 'Lot 5.C : prerequis manquants ou deja appliques';
  END IF;
END
$schoolnet_lot5c_preflight$;

CREATE TABLE public.public_enrollment_request_resolutions (
  request_id uuid PRIMARY KEY
    REFERENCES public.public_enrollment_requests(id) ON DELETE RESTRICT,
  request_type text NOT NULL,
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  enrollment_id uuid NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  verification_note text NOT NULL,
  verified_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT schoolnet_request_resolutions_type_chk CHECK (
    (request_type='student_enrollment' AND enrollment_id IS NOT NULL)
    OR (request_type='parent_access' AND enrollment_id IS NULL)
  ),
  CONSTRAINT schoolnet_request_resolutions_distinct_chk CHECK (parent_id<>student_id),
  CONSTRAINT schoolnet_request_resolutions_note_chk CHECK (
    pg_catalog.char_length(pg_catalog.btrim(verification_note)) BETWEEN 10 AND 1000
  )
);

-- parent_links est une table RLS, mais les anciens droits anon/authenticated
-- incluent TRUNCATE (qui ignore RLS). Conserver les operations Admin via RLS,
-- supprimer les privileges destructifs superflus pour tous les clients.
REVOKE ALL PRIVILEGES ON TABLE public.parent_links
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.parent_links
  TO authenticated;

-- Une inscription annuelle ne doit pas etre revendiquee par deux admissions
-- publiques finalisees. Les demandes d'acces Parent ne consomment pas un dossier.
CREATE UNIQUE INDEX schoolnet_request_resolutions_one_enrollment
  ON public.public_enrollment_request_resolutions(enrollment_id)
  WHERE enrollment_id IS NOT NULL;

CREATE INDEX schoolnet_request_resolutions_parent_student
  ON public.public_enrollment_request_resolutions(parent_id, student_id);

ALTER TABLE public.public_enrollment_request_resolutions
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.public_enrollment_request_resolutions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_enrollment_request_resolutions
  TO authenticated;

CREATE POLICY schoolnet_request_resolutions_admin_read
ON public.public_enrollment_request_resolutions
FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

COMMENT ON TABLE public.public_enrollment_request_resolutions IS
'SCHOOLNET Lot 5.C : preuve administrative du lien demande + comptes verifies + inscription eventuelle. Non consultable par les familles.';

-- Empeche de traiter une demande sans resolution.
-- Les anciennes demandes deja traitees ne sont pas modifiees ni requalifiees.
-- Un ancien statut processed peut recevoir une note sans etre retroactivement bloque.
CREATE OR REPLACE FUNCTION schoolnet_private.guard_public_request_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_guard$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status='processed' THEN
      RAISE EXCEPTION 'Une demande ne peut etre creee directement comme traitee.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status='processed'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NOT EXISTS (
      SELECT 1 FROM public.public_enrollment_request_resolutions r
      WHERE r.request_id=NEW.id
    )
  THEN
    RAISE EXCEPTION
      'Rattachement verifie obligatoire avant le statut Traitee (Lot 5.C).';
  END IF;

  IF OLD.status='processed' AND NEW.status IS DISTINCT FROM OLD.status
    AND EXISTS (
      SELECT 1 FROM public.public_enrollment_request_resolutions r
      WHERE r.request_id=NEW.id
    )
  THEN
    RAISE EXCEPTION
      'Demande finalisee : le rattachement doit rester traçable et le statut Traitee conserve.';
  END IF;
  RETURN NEW;
END;
$schoolnet_guard$;

REVOKE ALL ON FUNCTION schoolnet_private.guard_public_request_resolution()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_schoolnet_public_request_verified_status
BEFORE INSERT OR UPDATE OF status
ON public.public_enrollment_requests
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_public_request_resolution();

-- Une seule RPC exposable, executee en transaction par PostgreSQL.
-- Les donnees saisies par le public (nom, email, telephone, relation)
-- ne sont JAMAIS utilisees seules comme preuve du lien familial.
-- L'administrateur selectionne les deux UUID et atteste la verification.
CREATE OR REPLACE FUNCTION public.admin_finalize_public_enrollment_request(
  p_request_id uuid,
  p_parent_id uuid,
  p_student_id uuid,
  p_enrollment_id uuid,
  p_verified boolean,
  p_verification_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_finalize$
DECLARE
  v_request public.public_enrollment_requests%ROWTYPE;
  v_existing public.public_enrollment_request_resolutions%ROWTYPE;
  v_enrollment public.student_enrollments%ROWTYPE;
  v_parent_role text;
  v_student_role text;
  v_actor uuid;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acces reserve a l administration.'
      USING ERRCODE='42501';
  END IF;

  IF p_request_id IS NULL OR p_parent_id IS NULL OR p_student_id IS NULL
     OR p_parent_id=p_student_id
     OR p_verified IS DISTINCT FROM TRUE
     OR p_verification_note IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_verification_note)) NOT BETWEEN 10 AND 1000
  THEN
    RAISE EXCEPTION
      'Selectionnez les deux comptes, confirmez la verification familiale et renseignez une note de 10 a 1000 caracteres.';
  END IF;

  -- Verrou pour serialiser les clics repetes et la concurrence d'administrateurs.
  SELECT * INTO v_request
  FROM public.public_enrollment_requests
  WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande publique introuvable.';
  END IF;

  IF v_request.status='rejected' THEN
    RAISE EXCEPTION 'Une demande refusee ne peut pas etre finalisee.';
  END IF;
  IF v_request.request_type NOT IN ('student_enrollment','parent_access') THEN
    RAISE EXCEPTION 'Type de demande incompatible.';
  END IF;

  IF (v_request.request_type='student_enrollment' AND p_enrollment_id IS NULL)
     OR (v_request.request_type='parent_access' AND p_enrollment_id IS NOT NULL)
  THEN
    RAISE EXCEPTION
      'Une demande inscription exige un dossier scolaire ; une demande acces parent ne doit pas en creer.';
  END IF;

  -- Sur une demande anciennement Traitee sans resolution, la RPC permet
  -- une regularisation explicite avec nouvelle preuve et evenement d'audit.
  SELECT * INTO v_existing
  FROM public.public_enrollment_request_resolutions
  WHERE request_id=p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.parent_id IS DISTINCT FROM p_parent_id
      OR v_existing.student_id IS DISTINCT FROM p_student_id
      OR v_existing.enrollment_id IS DISTINCT FROM p_enrollment_id
    THEN
      RAISE EXCEPTION 'Cette demande est deja rattachee a des comptes ou a un dossier different.';
    END IF;
    IF v_request.status<>'processed' THEN
      RAISE EXCEPTION 'Rattachement existant sans statut Traitee : contacter l administration.';
    END IF;
    IF NOT EXISTS (
       SELECT 1 FROM public.parent_links l
       WHERE l.parent_id=p_parent_id AND l.student_id=p_student_id
    ) OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=p_parent_id
         AND p_student_id=ANY(COALESCE(p.child_ids,ARRAY[]::uuid[]))
    ) THEN
      RAISE EXCEPTION 'Rattachement historique incoherent : verifier le lien familial avant de poursuivre.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'request_id',v_request.id,
      'reference',v_request.reference,
      'status','processed',
      'parent_id',v_existing.parent_id,
      'student_id',v_existing.student_id,
      'enrollment_id',v_existing.enrollment_id,
      'verified_at',v_existing.verified_at,
      'already_finalized',true
    );
  END IF;

  SELECT p.role::text INTO v_parent_role
  FROM public.profiles p WHERE p.id=p_parent_id;
  SELECT p.role::text INTO v_student_role
  FROM public.profiles p WHERE p.id=p_student_id;
  IF v_parent_role IS DISTINCT FROM 'parent'
     OR v_student_role IS DISTINCT FROM 'student'
  THEN
    RAISE EXCEPTION 'Le responsable doit etre Parent/Tuteur et l enfant doit etre Apprenant.';
  END IF;

  -- Refuser le rattachement de comptes desactives ; le controle n'utilise
  -- aucune donnee modifiable par les utilisateurs (ex. user_metadata).
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id IN (p_parent_id,p_student_id)
      AND u.banned_until IS NOT NULL
      AND u.banned_until > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'Un compte selectionne est desactive : reactiver le compte avant de finaliser.';
  END IF;

  IF v_request.request_type='student_enrollment' THEN
    SELECT * INTO v_enrollment
    FROM public.student_enrollments
    WHERE id=p_enrollment_id;
    IF NOT FOUND OR v_enrollment.student_id IS DISTINCT FROM p_student_id THEN
      RAISE EXCEPTION 'Le dossier scolaire ne correspond pas a l apprenant selectionne.';
    END IF;
    IF v_enrollment.status::text NOT IN ('active','completed') THEN
      RAISE EXCEPTION 'Le dossier scolaire selectionne doit etre valide (actif ou termine).';
    END IF;
  END IF;

  -- Lien familial cree si absent, uniquement apres attestation explicite.
  -- La contrainte unique (parent_id,student_id) previent les doublons.
  INSERT INTO public.parent_links(parent_id,student_id,relation_type)
  VALUES (p_parent_id,p_student_id,v_request.guardian_relationship)
  ON CONFLICT(parent_id,student_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.parent_links l
    WHERE l.parent_id=p_parent_id AND l.student_id=p_student_id
  ) THEN
    RAISE EXCEPTION 'Impossible de verifier ou etablir le lien familial.';
  END IF;

  -- SCHOOLNET utilise aussi profiles.child_ids (notamment pour la messagerie
  -- familiale). Synchroniser uniquement apres verification Admin, sans doublon
  -- et sans effacer les enfants deja rattaches.
  UPDATE public.profiles p
  SET child_ids = CASE
    WHEN p_student_id = ANY(COALESCE(p.child_ids, ARRAY[]::uuid[]))
      THEN p.child_ids
    ELSE pg_catalog.array_append(COALESCE(p.child_ids, ARRAY[]::uuid[]), p_student_id)
  END
  WHERE p.id=p_parent_id AND p.role::text='parent';

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=p_parent_id AND p_student_id=ANY(COALESCE(p.child_ids, ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'Synchronisation du lien familial impossible.';
  END IF;

  -- L'index unique enrollment_id evite une double admission vers le meme
  -- dossier ; la transaction annulera aussi un parent_link si elle echoue.
  INSERT INTO public.public_enrollment_request_resolutions(
    request_id,request_type,parent_id,student_id,enrollment_id,
    verification_note,verified_by
  ) VALUES (
    p_request_id,v_request.request_type,p_parent_id,p_student_id,p_enrollment_id,
    pg_catalog.btrim(p_verification_note),v_actor
  );

  IF v_request.status IS DISTINCT FROM 'processed' THEN
    UPDATE public.public_enrollment_requests
    SET status='processed',
        reviewed_by=v_actor,
        reviewed_at=pg_catalog.now(),
        updated_at=pg_catalog.now()
    WHERE id=p_request_id;
  ELSE
    -- Regularisation d'une demande ancienne : ne change pas son statut.
    UPDATE public.public_enrollment_requests
    SET reviewed_by=v_actor,
        reviewed_at=pg_catalog.now(),
        updated_at=pg_catalog.now()
    WHERE id=p_request_id;
  END IF;

  INSERT INTO public.public_enrollment_request_events(
    request_id,from_status,to_status,note,actor_id
  ) VALUES (
    p_request_id,v_request.status,'processed',
    CASE WHEN v_request.status='processed'
      THEN 'Regularisation de rattachement verifie (Lot 5.C).'
      ELSE 'Rattachement verifie et demande finalisee (Lot 5.C).' END,
    v_actor
  );

  SELECT pg_catalog.jsonb_build_object(
    'request_id',p_request_id,
    'reference',v_request.reference,
    'status','processed',
    'parent_id',p_parent_id,
    'student_id',p_student_id,
    'enrollment_id',p_enrollment_id,
    'verified_at',r.verified_at,
    'already_finalized',false
  ) INTO v_result
  FROM public.public_enrollment_request_resolutions r
  WHERE r.request_id=p_request_id;

  RETURN v_result;
END;
$schoolnet_finalize$;

REVOKE ALL ON FUNCTION public.admin_finalize_public_enrollment_request(
  uuid,uuid,uuid,uuid,boolean,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_public_enrollment_request(
  uuid,uuid,uuid,uuid,boolean,text
) TO authenticated;

COMMENT ON FUNCTION public.admin_finalize_public_enrollment_request(
  uuid,uuid,uuid,uuid,boolean,text
) IS 'SCHOOLNET Lot 5.C : finalisation Admin, attestation du lien familial, rattachement idempotent et trace.';

DO $schoolnet_lot5c_postcheck$
BEGIN
  IF NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_class c
     WHERE c.oid='public.public_enrollment_request_resolutions'::regclass
       AND c.relrowsecurity
    )
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies
        WHERE schemaname='public'
          AND tablename='public_enrollment_request_resolutions')<>1
    OR pg_catalog.has_table_privilege(
       'anon','public.public_enrollment_request_resolutions','SELECT')
    OR pg_catalog.has_table_privilege(
       'authenticated','public.public_enrollment_request_resolutions','INSERT')
    OR pg_catalog.has_table_privilege(
       'anon','public.parent_links','TRUNCATE')
    OR pg_catalog.has_table_privilege(
       'authenticated','public.parent_links','TRUNCATE')
    OR NOT pg_catalog.has_table_privilege(
       'authenticated','public.parent_links','SELECT')
    OR pg_catalog.has_function_privilege(
      'anon','public.admin_finalize_public_enrollment_request(uuid,uuid,uuid,uuid,boolean,text)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(
      'authenticated','public.admin_finalize_public_enrollment_request(uuid,uuid,uuid,uuid,boolean,text)'::regprocedure,'EXECUTE')
  THEN
    RAISE EXCEPTION 'Lot 5.C : controle de permissions non conforme';
  END IF;
END
$schoolnet_lot5c_postcheck$;
