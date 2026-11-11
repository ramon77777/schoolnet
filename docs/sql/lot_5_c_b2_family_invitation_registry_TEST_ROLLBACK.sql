-- SCHOOLNET Lot 5.C-B.2 — SCENARIOS DE RECETTE AUCUNE ECRITURE DURABLE.
-- A executer exclusivement dans la MEME session / transaction :
-- BEGIN;
-- <contenu de lot_5_c_b2_family_invitation_registry_DRAFT.sql>
-- <contenu du present fichier>
-- ROLLBACK;
--
-- Aucun compte Auth n'est cree ni modifie. Les user_id de vrais profils
-- sont uniquement des REFERENCES en transaction, supprimees par ROLLBACK.
-- Les adresses example.invalid sont fictives.

DO $schoolnet_b2_tests$
DECLARE
  req_a UUID;
  req_b UUID;
  req_c UUID;
  admin_id UUID;
  user_a UUID;
  user_b UUID;
  event_count INTEGER;
BEGIN
  SELECT id INTO req_a FROM public.public_enrollment_requests ORDER BY id LIMIT 1;
  SELECT id INTO req_b FROM public.public_enrollment_requests ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO req_c FROM public.public_enrollment_requests ORDER BY id OFFSET 2 LIMIT 1;
  SELECT id INTO admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO user_a FROM public.profiles WHERE role IN ('student', 'parent') LIMIT 1;
  SELECT id INTO user_b FROM public.profiles
    WHERE role IN ('student', 'parent') AND id <> user_a LIMIT 1;

  IF req_a IS NULL OR req_b IS NULL OR req_c IS NULL OR
     admin_id IS NULL OR user_a IS NULL OR user_b IS NULL
  THEN
    RAISE EXCEPTION 'RECETTE B2 : fixtures non disponibles';
  END IF;

  INSERT INTO public.schoolnet_family_invitation_records
    (request_id, recipient, expected_role, email,
     verification_note, prepared_by, last_action_by)
  VALUES
    (req_a, 'parent', 'parent', 'a-schoolnet-b2@example.invalid',
     'Test de securite, identifiants et emails fictifs.', admin_id, admin_id);

  -- L'unicite (demande, destinataire) empeche un double clic.
  BEGIN
    INSERT INTO public.schoolnet_family_invitation_records
      (request_id, recipient, expected_role, email,
       verification_note, prepared_by, last_action_by)
    VALUES (req_a, 'parent', 'parent', 'duplicate-schoolnet-b2@example.invalid',
      'Test de securite, identifiants et emails fictifs.', admin_id, admin_id);
    RAISE EXCEPTION 'ECHEC B2 : meme destinataire deux fois';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- L'unicite email interdit les collisions entre demandes.
  BEGIN
    INSERT INTO public.schoolnet_family_invitation_records
      (request_id, recipient, expected_role, email,
       verification_note, prepared_by, last_action_by)
    VALUES (req_b, 'student', 'student', 'a-schoolnet-b2@example.invalid',
      'Test de securite, identifiants et emails fictifs.', admin_id, admin_id);
    RAISE EXCEPTION 'ECHEC B2 : meme email sur deux demandes';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Compte absent : impossible de signaler une invitation preparee.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET status = 'prepared', generation_count = 1
     WHERE request_id = req_a AND recipient = 'parent';
    RAISE EXCEPTION 'ECHEC B2 : prepare sans Auth';
  EXCEPTION WHEN check_violation THEN NULL; END;

  UPDATE public.schoolnet_family_invitation_records
     SET status = 'requires_review', last_error_code = 'AUTH_UNKNOWN'
   WHERE request_id = req_a AND recipient = 'parent';

  -- Un Auth inconnu interdit la reprise automatisee.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET status = 'renewing'
     WHERE request_id = req_a AND recipient = 'parent';
    RAISE EXCEPTION 'ECHEC B2 : reprise sans identifiant Auth';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- La reservation ne doit pas pouvoir changer de destinataire.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET email = 'hijacked-schoolnet-b2@example.invalid'
     WHERE request_id = req_a AND recipient = 'parent';
    RAISE EXCEPTION 'ECHEC B2 : email reserve modifie';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.schoolnet_family_invitation_records
    (request_id, recipient, expected_role, email,
     verification_note, prepared_by, last_action_by)
  VALUES
    (req_b, 'student', 'student', 'b-schoolnet-b2@example.invalid',
     'Test de securite, identifiants et emails fictifs.', admin_id, admin_id);

  UPDATE public.schoolnet_family_invitation_records
     SET status = 'auth_created', user_id = user_a
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'profile_ready'
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'prepared', generation_count = 1
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'renewing',
         recovery_note = 'Renouvellement autorise dans une transaction annulee.'
   WHERE request_id = req_b AND recipient = 'student';

  -- Le verrou renewing ne peut pas etre acquis par un deuxieme processus.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET status = 'renewing'
     WHERE request_id = req_b AND recipient = 'student';
    RAISE EXCEPTION 'ECHEC B2 : acquisition du verrou renewing deux fois';
  EXCEPTION WHEN check_violation THEN NULL; END;

  UPDATE public.schoolnet_family_invitation_records
     SET status = 'prepared', generation_count = 2
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'sent_declared', sent_declared_at = now(),
         sent_declared_by = admin_id
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'renewing', sent_declared_at = NULL,
         sent_declared_by = NULL,
         recovery_note = 'Deuxieme renouvellement explicitement motive.'
   WHERE request_id = req_b AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'prepared', generation_count = 3
   WHERE request_id = req_b AND recipient = 'student';

  -- Ni retour arriere dangereux, ni compteur decroissant.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET status = 'preparing'
     WHERE request_id = req_b AND recipient = 'student';
    RAISE EXCEPTION 'ECHEC B2 : retour dangereux vers preparing';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET generation_count = 1
     WHERE request_id = req_b AND recipient = 'student';
    RAISE EXCEPTION 'ECHEC B2 : compteur de liens decroissant';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.schoolnet_family_invitation_records
    (request_id, recipient, expected_role, email,
     verification_note, prepared_by, last_action_by)
  VALUES
    (req_c, 'student', 'student', 'c-schoolnet-b2@example.invalid',
     'Test de securite, identifiants et emails fictifs.', admin_id, admin_id);

  UPDATE public.schoolnet_family_invitation_records
     SET status = 'auth_created', user_id = user_b
   WHERE request_id = req_c AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'requires_review', last_error_code = 'PROFILE_UPDATE_FAILED'
   WHERE request_id = req_c AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'renewing',
         recovery_note = 'Reprise autorisee seulement sur Auth connu.'
   WHERE request_id = req_c AND recipient = 'student';
  UPDATE public.schoolnet_family_invitation_records
     SET status = 'prepared', generation_count = 1
   WHERE request_id = req_c AND recipient = 'student';

  -- Un identifiant Auth ne peut pas etre reserve sur deux demandes.
  BEGIN
    UPDATE public.schoolnet_family_invitation_records
       SET user_id = user_a
     WHERE request_id = req_a AND recipient = 'parent';
    RAISE EXCEPTION 'ECHEC B2 : utilisateur Auth affecte deux fois';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  SELECT count(*) INTO event_count
    FROM public.schoolnet_family_invitation_events
   WHERE request_id = req_b AND recipient = 'student';
  IF event_count <> 9 THEN
    RAISE EXCEPTION 'ECHEC B2 : historique incomplet (% evenements)', event_count;
  END IF;

  -- Le navigateur et les comptes ordinaires n'ont aucun droit direct.
  IF has_table_privilege('anon','public.schoolnet_family_invitation_records','SELECT')
    OR has_table_privilege('authenticated','public.schoolnet_family_invitation_records','INSERT')
    OR has_table_privilege('anon','public.schoolnet_family_invitation_events','SELECT')
    OR has_table_privilege('service_role','public.schoolnet_family_invitation_records','DELETE')
    OR has_table_privilege('service_role','public.schoolnet_family_invitation_events','UPDATE')
    OR NOT has_table_privilege('service_role','public.schoolnet_family_invitation_events','SELECT')
    OR NOT has_table_privilege('service_role','public.schoolnet_family_invitation_records','UPDATE')
  THEN RAISE EXCEPTION 'ECHEC B2 : droits SQL non conformes'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
     WHERE oid = 'public.schoolnet_family_invitation_events'::regclass
       AND relrowsecurity AND relforcerowsecurity
  ) THEN RAISE EXCEPTION 'ECHEC B2 : RLS ou FORCE RLS des evenements'; END IF;

  RAISE NOTICE 'SCHOOLNET B2 : SCENARIOS REUSSIS ; ANNULER PAR ROLLBACK';
END;
$schoolnet_b2_tests$;
