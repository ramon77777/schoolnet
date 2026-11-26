-- ONLY for ephemeral localhost (postgres 55422), never for hosted projects.
-- Seed is run AFTER the unchanged 10-user real-GoTrue fixture.
DO $guard$
BEGIN
 IF (SELECT count(*) FROM public.schoolnet_schools)<>2
 OR (SELECT count(*) FROM public.classes)<>2
 OR (SELECT count(*) FROM public.school_years)<>1
 OR to_regprocedure('public.schoolnet_official_export_labels(uuid,uuid,uuid,text,uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4D2C4_FIXTURE_SEED_WRONG_STAGE'; END IF;
END $guard$;
UPDATE public.schoolnet_schools SET name=CASE id
 WHEN '00000000-0000-4000-8000-000000000010' THEN 'Collège synthétique A'
 WHEN '00000000-0000-4000-8000-000000000011' THEN 'Collège synthétique B'
 ELSE NULL END;
UPDATE public.school_years SET name='2026-2027 (simulation)';
UPDATE public.classes SET name=CASE id
 WHEN '00000000-0000-4000-8000-000000000030' THEN '6e B (simulation)'
 WHEN '00000000-0000-4000-8000-000000000031' THEN '5e A (simulation)'
 ELSE NULL END;
UPDATE schoolnet_private.school_grading_periods SET name=CASE id
 WHEN '00000000-0000-4000-8000-000000000040' THEN 'Premier trimestre (T1)'
 WHEN '00000000-0000-4000-8000-000000000041' THEN 'Premier trimestre (T1)'
 WHEN '00000000-0000-4000-8000-000000000042' THEN 'Deuxième trimestre (T2)'
 ELSE NULL END;
SELECT 'S4D2C4_SYNTHETIC_NAMES_READY_DISPOSABLE_ONLY' AS verdict;
