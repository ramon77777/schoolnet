-- SCHOOLNET | Lot 4.3.D | Confidentialite des relations de messagerie.
-- UNIQUEMENT PREPARE SUR GITHUB : appliquer a schoolnet_2.0 apres
-- autorisation expresse et recette RLS/roles. Pas de nouveaux droits publics.
--
-- Constat de l'audit : les fonctions SECURITY DEFINER exposees publiquement
-- chat_is_member, chat_parent_is_linked_to_student et
-- chat_teacher_teaches_student divulguent des relations privees aux anonymes.
-- Conserver les utilisations legitimes via chat_can_contact() et les RLS.
--
-- Les politiques chat_* utilisent chat_is_member(conversation_id, auth.uid()).
-- Les relations parent/enfant et enseignant/eleve restent determinees par
-- les memes tables/metiers qu'avant ; seul l'acces aux relations est restreint.

DO $schoolnet_preflight$
BEGIN
  IF to_regprocedure('public.chat_is_member(uuid,uuid)') IS NULL
    OR to_regprocedure('public.chat_parent_is_linked_to_student(uuid,uuid)') IS NULL
    OR to_regprocedure('public.chat_teacher_teaches_student(uuid,uuid)') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public'
        AND p.tablename='chat_messages'
        AND p.cmd='SELECT'
        AND pg_catalog.strpos(p.qual,'chat_is_member')>0
    )
  THEN
    RAISE EXCEPTION 'SCHOOLNET SECURITY: unexpected messaging database schema';
  END IF;
END $schoolnet_preflight$;

-- La lecture des membres d'une conversation doit concerner soi-meme
-- ou un administrateur autorise, pas n'importe quel identifiant UUID.
CREATE OR REPLACE FUNCTION public.chat_is_member(
  p_conversation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND (
      p_user_id=auth.uid()
      OR public.is_admin()
    )
    AND EXISTS(
      SELECT 1
      FROM public.chat_conversation_members m
      WHERE m.conversation_id=p_conversation_id
        AND m.user_id=p_user_id
    ),
    false
  );
$schoolnet$;

-- Le lien parent/enfant reste consultable par l'un des deux comptes lies
-- (ou l'administrateur), pour conserver le contact Parent <-> Apprenant.
CREATE OR REPLACE FUNCTION public.chat_parent_is_linked_to_student(
  p_parent_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND (
      auth.uid()=p_parent_id
      OR auth.uid()=p_student_id
      OR public.is_admin()
    )
    AND EXISTS(
      SELECT 1 FROM public.profiles parent_profile
      WHERE parent_profile.id=p_parent_id
        AND parent_profile.role::text='parent'
        AND p_student_id=ANY(
          COALESCE(parent_profile.child_ids,ARRAY[]::uuid[])
        )
    ),
    false
  );
$schoolnet$;

-- L'enseignant et l'apprenant consultent directement leur relation.
-- Un parent peut la consulter pour un de ses enfants : ce chemin est
-- indispensable aux messages Enseignant <-> Parent via chat_can_contact().
CREATE OR REPLACE FUNCTION public.chat_teacher_teaches_student(
  p_teacher_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND (
      auth.uid()=p_teacher_id
      OR auth.uid()=p_student_id
      OR public.is_admin()
      OR EXISTS(
        SELECT 1
        FROM public.profiles parent_profile
        WHERE parent_profile.id=auth.uid()
          AND parent_profile.role::text='parent'
          AND p_student_id=ANY(
            COALESCE(parent_profile.child_ids,ARRAY[]::uuid[])
          )
      )
    )
    AND EXISTS(
      SELECT 1
      FROM public.courses c
      WHERE c.created_by=p_teacher_id
        AND (
          EXISTS(
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.course_id=c.id
              AND ce.student_id=p_student_id
          )
          OR (
            c.class_id IS NOT NULL
            AND EXISTS(
              SELECT 1 FROM public.class_students cs
              WHERE cs.class_id=c.class_id
                AND cs.student_id=p_student_id
            )
          )
        )
    ),
    false
  );
$schoolnet$;

-- Ne pas conserver le droit implicite de PUBLIC qui inclut anon.
-- Les applications connectees continuent d'utiliser les RPC et politiques RLS.
REVOKE EXECUTE ON FUNCTION public.chat_is_member(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_parent_is_linked_to_student(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_teacher_teaches_student(uuid,uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_is_member(uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_parent_is_linked_to_student(uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_teacher_teaches_student(uuid,uuid)
  TO authenticated, service_role;

-- L'acces a la table de membres reste exclusivement RLS authentifiee.
-- Ne modifie ni notifications, ni salles LIVE, ni pg_cron, ni donnees scolaires.
