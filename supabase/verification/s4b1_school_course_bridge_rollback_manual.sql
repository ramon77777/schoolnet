-- SCHOOLNET S4-B.1 : rollback MANUEL des nouveaux objets uniquement.
-- NE PAS EXECUTER en production sans accord explicite. A lancer dans
-- UNE TRANSACTION (migration Supabase approuvee ou psql -1 sur sandbox).
-- AVANT retrait du SQL : repasser le frontend Vercel sur une version
-- qui n'appelle aucune RPC S4-B.1.
-- Si des liens d'etablissement existent, REFUSER tout retrait.
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '20000ms';
DO $s4b1_rollback_preflight$
DECLARE v_table oid:=to_regclass('schoolnet_private.school_course_links');
BEGIN
 IF v_table IS NULL
   OR to_regprocedure('public.schoolnet_teacher_school_course_context()') IS NULL
   OR to_regprocedure('public.schoolnet_teacher_link_school_course(uuid,uuid)') IS NULL
   OR to_regprocedure('public.schoolnet_teacher_unlink_school_course(uuid)') IS NULL
   OR to_regprocedure('public.schoolnet_school_course_catalog(uuid)') IS NULL
   OR to_regprocedure('schoolnet_private.teacher_school_course_context()') IS NULL
   OR to_regprocedure('schoolnet_private.teacher_link_school_course(uuid,uuid)') IS NULL
   OR to_regprocedure('schoolnet_private.teacher_unlink_school_course(uuid)') IS NULL
   OR to_regprocedure('schoolnet_private.school_course_catalog(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B1_ROLLBACK_BLOCKED: objets attendus absents/alteres'; END IF;
 IF (SELECT count(*) FROM schoolnet_private.school_course_links) > 0 THEN
  RAISE EXCEPTION 'S4B1_ROLLBACK_BLOCKED: cours officiels rattaches, retrait refuse sans plan de migration des liens.';
 END IF;
 IF to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NULL
   OR to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B1_ROLLBACK_BLOCKED: fondations S3-C/S4-A absentes'; END IF;
END;
$s4b1_rollback_preflight$;

-- Supprimer les facades d'abord, les helpers ensuite, la table en dernier.
-- RESTRICT interdit la suppression de tout autre objet dependant.
DROP FUNCTION public.schoolnet_teacher_link_school_course(uuid,uuid) RESTRICT;
DROP FUNCTION public.schoolnet_teacher_unlink_school_course(uuid) RESTRICT;
DROP FUNCTION public.schoolnet_teacher_school_course_context() RESTRICT;
DROP FUNCTION public.schoolnet_school_course_catalog(uuid) RESTRICT;

DROP FUNCTION schoolnet_private.teacher_link_school_course(uuid,uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_unlink_school_course(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_school_course_context() RESTRICT;
DROP FUNCTION schoolnet_private.school_course_catalog(uuid) RESTRICT;

DROP TABLE schoolnet_private.school_course_links RESTRICT;

DO $s4b1_rollback_check$
BEGIN
 IF to_regclass('schoolnet_private.school_course_links') IS NOT NULL
   OR to_regprocedure('public.schoolnet_school_course_catalog(uuid)') IS NOT NULL
   OR to_regprocedure('public.schoolnet_teacher_link_school_course(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NULL
   OR to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B1_ROLLBACK_FAILED: etat incoherent'; END IF;
END;
$s4b1_rollback_check$;

NOTIFY pgrst, 'reload schema';
SELECT 'S4B1_ROLLBACK_PASS' AS result;
