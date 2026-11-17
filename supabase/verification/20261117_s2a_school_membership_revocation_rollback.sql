-- SCHOOLNET S2-A | Complement de recette de securite (17/11/2026)
-- A EXECUTER UNIQUEMENT DANS LA MEME TRANSACTION QUE :
-- 1) supabase/proposals/s2_school_classes_tenant_foundation.sql
-- 2) supabase/verification/20261110_s2_school_classes_tenant_rollback.sql
-- Puis ROLLBACK obligatoire : aucun changement durable.
--
-- Ajout : revocation du responsable, suspension de son ecole,
-- restauration des droits et compte anon. Les fixtures deja enregistrees
-- sont modifiees de facon transitoire, puis RESTAUREES PAR ROLLBACK.
-- Ne pas executer ce fichier seul ni appliquer une migration par copie.

DO $preflight_extra_s2a$
BEGIN
  IF to_regclass('public.classes_school_unique_name_year_idx') IS NULL
     OR nullif(current_setting('qa.s2.local',true),'') IS NULL
     OR nullif(current_setting('qa.s2.school_a',true),'') IS NULL
     OR nullif(current_setting('qa.s2.class_a',true),'') IS NULL
     OR (SELECT COUNT(*) FROM public.schoolnet_school_memberships m
         WHERE m.user_id=current_setting('qa.s2.local')::uuid
           AND m.school_id=current_setting('qa.s2.school_a')::uuid
           AND m.status='active')<>1
  THEN
    RAISE EXCEPTION 'S2-A extra : transaction et fixtures initiales indispensables.';
  END IF;
END;
$preflight_extra_s2a$;

-- 1. Retirer provisoirement l'appartenance active (avec horodatage obligatoire).
DO $revoke_membership_s2a$
DECLARE v_rows integer;
BEGIN
  UPDATE public.schoolnet_school_memberships
    SET status='revoked',revoked_at=pg_catalog.now()
  WHERE user_id=current_setting('qa.s2.local')::uuid
    AND school_id=current_setting('qa.s2.school_a')::uuid
    AND status='active';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'S2-A extra : revocation de la fixture impossible.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.local'),true);
END;
$revoke_membership_s2a$;

SET LOCAL ROLE authenticated;
DO $check_revoked_s2a$
BEGIN
  IF schoolnet_private.is_school_admin_for(current_setting('qa.s2.school_a')::uuid)
     OR EXISTS(SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.class_a')::uuid)
  THEN
    RAISE EXCEPTION 'S2-A extra : fuite de classe apres revocation du responsable.';
  END IF;
END;
$check_revoked_s2a$;
RESET ROLE;

-- 2. Restaurer la relation, puis verifier que la classe est de nouveau visible.
DO $restore_membership_s2a$
DECLARE v_rows integer;
BEGIN
  UPDATE public.schoolnet_school_memberships
    SET status='active',revoked_at=NULL
  WHERE user_id=current_setting('qa.s2.local')::uuid
    AND school_id=current_setting('qa.s2.school_a')::uuid
    AND status='revoked';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'S2-A extra : restauration de fixture echouee.'; END IF;
END;
$restore_membership_s2a$;

SET LOCAL ROLE authenticated;
DO $check_restored_member_s2a$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.classes
    WHERE id=current_setting('qa.s2.class_a')::uuid)
  THEN RAISE EXCEPTION 'S2-A extra : classe non restauree apres reactivation.'; END IF;
END;
$check_restored_member_s2a$;
RESET ROLE;

-- 3. Suspendre provisoirement l'ecole A : meme le responsable actif perd l'acces.
DO $suspend_school_s2a$
DECLARE v_rows integer;
BEGIN
  UPDATE public.schoolnet_schools SET status='suspended'
  WHERE id=current_setting('qa.s2.school_a')::uuid AND status='active';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'S2-A extra : suspension de fixture echouee.'; END IF;
END;
$suspend_school_s2a$;

SET LOCAL ROLE authenticated;
DO $check_suspended_school_s2a$
BEGIN
  IF schoolnet_private.is_school_admin_for(current_setting('qa.s2.school_a')::uuid)
     OR EXISTS(SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.class_a')::uuid)
  THEN RAISE EXCEPTION 'S2-A extra : fuite de classe d une ecole suspendue.'; END IF;
END;
$check_suspended_school_s2a$;
RESET ROLE;

-- 4. La restauration transitoire rend la classe visible sans modifier d'autre ecole.
DO $restore_school_s2a$
DECLARE v_rows integer;
BEGIN
  UPDATE public.schoolnet_schools SET status='active'
  WHERE id=current_setting('qa.s2.school_a')::uuid AND status='suspended';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'S2-A extra : restauration ecole echouee.'; END IF;
END;
$restore_school_s2a$;

SET LOCAL ROLE authenticated;
DO $check_restored_school_s2a$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.classes
    WHERE id=current_setting('qa.s2.class_a')::uuid)
     OR EXISTS(SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.class_b')::uuid)
  THEN RAISE EXCEPTION 'S2-A extra : droits apres restauration incorrects.'; END IF;
END;
$check_restored_school_s2a$;
RESET ROLE;

-- 5. Acces anonyme : refuse soit par GRANT, soit par RLS.
SET LOCAL ROLE anon;
DO $check_anon_s2a$
BEGIN
  BEGIN
    IF EXISTS(SELECT 1 FROM public.classes) THEN
      RAISE EXCEPTION 'S2-A extra : classe visible sans authentification.';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- refus de lecture par GRANT, resultat egalement attendu
  END;
END;
$check_anon_s2a$;
RESET ROLE;

SELECT 'S2_A_SUSPENSION_REVOCATION_AND_ANON_PASS__ROLLBACK_REQUIRED' AS result;
