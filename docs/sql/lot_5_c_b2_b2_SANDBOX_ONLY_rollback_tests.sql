-- SCHOOLNET 5.C-B.2 / B.2 — RECETTE TRANSACTIONNELLE A ANNULER
-- Cible AUTORISEE : onqlsvphmrqhelislpry. JAMAIS le projet principal.
-- Les identifiants suivants sont 100% SYNTHETIQUES.
-- IMPORTANT: conserver le ROLLBACK final. AUCUN compte Auth cree.

BEGIN;

DO $test$
DECLARE
  c uuid := 'b2b20000-0000-4000-8000-000000000001';
  u uuid := 'b2b20000-0000-4000-8000-000000000002';
  r uuid := 'b2b20000-0000-4000-8000-000000000003';
  bad_user uuid := 'b2b20000-0000-4000-8000-000000000004';
  protected_event uuid := 'b2b20000-0000-4000-8000-000000000005';
  prevented integer := 0;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'B2 : schema SCHOOLNET principal detecte — arret';
  END IF;

  INSERT INTO schoolnet_auth_sandbox.invitation_cases
    (case_id,request_id,recipient,generation_count,expected_auth_user_id,case_status)
  VALUES (c,r,'parent',1,u,'prepared');

  INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
    (event_id,case_id,generation_count,expected_auth_user_id,
     event_kind,source_kind,source_event_ref,occurred_at)
  VALUES
    (protected_event,c,1,u,'delivery_declared','synthetic_admin_declaration',
     'b2-sent-001',now() - interval '3 minutes'),
    (gen_random_uuid(),c,1,u,'password_changed','synthetic_password_change',
     'b2-passchange-001',now() - interval '2 minutes'),
    (gen_random_uuid(),c,1,u,'password_login','synthetic_password_login',
     'b2-passlogin-001',now() - interval '1 minute');

  IF (SELECT count(*) FROM schoolnet_auth_sandbox.invitation_cases
       WHERE case_id=c) <> 1
    OR (SELECT count(*) FROM schoolnet_auth_sandbox.activation_evidence_events
       WHERE case_id=c) <> 3 THEN
    RAISE EXCEPTION 'B2 : insertion synthetique de reference incorrecte';
  END IF;

  -- 1. Doublon dossier / destinataire / generation bloque.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.invitation_cases
      (request_id,recipient,generation_count,expected_auth_user_id)
    VALUES (r,'parent',1,u);
    RAISE EXCEPTION 'B2 : doublon invitation autorise a tort';
  EXCEPTION WHEN unique_violation THEN prevented := prevented+1;
  END;

  -- 2. Identite d'une autre personne bloquee par FK composite.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
      (case_id,generation_count,expected_auth_user_id,event_kind,
       source_kind,source_event_ref,occurred_at)
    VALUES (c,1,bad_user,'password_login','synthetic_password_login',
            'b2-baduser-001',now());
    RAISE EXCEPTION 'B2 : preuve liee a une autre identite';
  EXCEPTION WHEN foreign_key_violation THEN prevented := prevented+1;
  END;

  -- 3. Aucun statut activated possible dans le schema B2.
  BEGIN
    UPDATE schoolnet_auth_sandbox.invitation_cases
      SET case_status='activated' WHERE case_id=c;
    RAISE EXCEPTION 'B2 : activated autorise a tort';
  EXCEPTION WHEN check_violation THEN prevented := prevented+1;
  END;

  -- 4. Aucune preuve ne peut devenir verified=true dans B2.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
      (case_id,generation_count,expected_auth_user_id,event_kind,
       source_kind,source_event_ref,occurred_at,proof_verified)
    VALUES (c,1,u,'delivery_declared','synthetic_admin_declaration',
            'b2-invalidverified-001',now(),true);
    RAISE EXCEPTION 'B2 : preuve reelle autorisee a tort';
  EXCEPTION WHEN check_violation THEN prevented := prevented+1;
  END;

  -- 5. Type/source ne peuvent pas etre incoherents.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
      (case_id,generation_count,expected_auth_user_id,event_kind,
       source_kind,source_event_ref,occurred_at)
    VALUES (c,1,u,'password_login','synthetic_password_change',
            'b2-wrongsource-001',now());
    RAISE EXCEPTION 'B2 : type de preuve incoherent autorise';
  EXCEPTION WHEN check_violation THEN prevented := prevented+1;
  END;

  -- 6. Pas de preuve future incoherente.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
      (case_id,generation_count,expected_auth_user_id,event_kind,
       source_kind,source_event_ref,occurred_at)
    VALUES (c,1,u,'password_login','synthetic_password_login',
            'b2-futureevent-001',now()+interval '1 day');
    RAISE EXCEPTION 'B2 : preuve future incoherente autorisee';
  EXCEPTION WHEN check_violation THEN prevented := prevented+1;
  END;

  -- 7. Aucun UPDATE sur le journal append-only.
  BEGIN
    UPDATE schoolnet_auth_sandbox.activation_evidence_events
       SET source_event_ref='b2-hacked-001' WHERE event_id=protected_event;
    RAISE EXCEPTION 'B2 : UPDATE du journal autorise';
  EXCEPTION WHEN SQLSTATE '55000' THEN prevented := prevented+1;
  END;

  -- 8. Aucun DELETE sur le journal append-only.
  BEGIN
    DELETE FROM schoolnet_auth_sandbox.activation_evidence_events
      WHERE event_id=protected_event;
    RAISE EXCEPTION 'B2 : DELETE du journal autorise';
  EXCEPTION WHEN SQLSTATE '55000' THEN prevented := prevented+1;
  END;

  -- 9. Un meme type de preuve ne peut etre duplique pour cette generation.
  BEGIN
    INSERT INTO schoolnet_auth_sandbox.activation_evidence_events
      (case_id,generation_count,expected_auth_user_id,event_kind,
       source_kind,source_event_ref,occurred_at)
    VALUES (c,1,u,'password_changed','synthetic_password_change',
            'b2-secondchange-001',now());
    RAISE EXCEPTION 'B2 : doublon type/generation autorise';
  EXCEPTION WHEN unique_violation THEN prevented := prevented+1;
  END;

  IF prevented <> 9 THEN
    RAISE EXCEPTION 'B2 : % protections observees sur 9 attendues',
      prevented;
  END IF;

  RAISE NOTICE 'SCHOOLNET B2 : 9 protections sur 9; 1 dossier et 3 evenements synthetiques valides temporairement; ROLLBACK requis.';
END;
$test$;

-- Les lignes temporaires de cette recette disparaissent immediatement.
ROLLBACK;
