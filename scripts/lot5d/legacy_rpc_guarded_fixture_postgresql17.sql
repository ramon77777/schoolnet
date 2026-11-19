-- SCHOOLNET LOT 5D-E: SYNTHETIC LEGACY RPC REPLICA / NO PRODUCTION.
-- Follows observed SIGNATURE and relevant DML of public legacy RPCs;
-- not the complete production functions and NOT drop-in replacements.
-- Crucial proposed change: LOCK school_years BEFORE reading is_current.
-- This lock order is NOT YET applied in Supabase real project.
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment(
  p_student_id uuid,p_class_id uuid,p_enrolled_on date DEFAULT CURRENT_DATE,
  p_admission_type text DEFAULT 'continuing',p_previous_school text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $safe_legacy$
DECLARE
  year_id uuid;
  year_name text;
  v_class_name text;
  current_year boolean;
  target_status public.student_enrollment_status;
  enrollment_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'fixture: only global admin may edit enrollments' USING ERRCODE='42501';
  END IF;
  -- IMPORTANT: this MUST be the first table lock before any SELECT of year.
  -- Legacy production function DOES NOT yet have this barrier.
  PERFORM pg_catalog.set_config('lock_timeout','3s',true);
  LOCK TABLE public.school_years IN SHARE MODE;
  SELECT sy.id,sy.name,sy.is_current,c.name
    INTO year_id,year_name,current_year,v_class_name
    FROM public.classes c
    JOIN public.school_years sy ON
      (sy.id=c.school_year_id OR (c.school_year_id IS NULL AND sy.name=c.school_year))
    WHERE c.id=p_class_id;
  IF year_id IS NULL OR v_class_name IS NULL THEN
    RAISE EXCEPTION 'fixture: class/year not found';
  END IF;
  target_status:=CASE WHEN current_year
    THEN 'active'::public.student_enrollment_status
    ELSE 'completed'::public.student_enrollment_status END;
  SELECT e.id INTO enrollment_id FROM public.student_enrollments e
    WHERE e.student_id=p_student_id AND e.school_year_id=year_id;
  IF enrollment_id IS NULL THEN
    INSERT INTO public.student_enrollments(
      student_id,school_year_id,class_id,status,enrolled_on,admission_type,
      previous_school,notes
    ) VALUES(
      p_student_id,year_id,p_class_id,target_status,
      COALESCE(p_enrolled_on,current_date),p_admission_type,p_previous_school,p_notes
    ) RETURNING id INTO enrollment_id;
  ELSE
    UPDATE public.student_enrollments
      SET class_id=p_class_id,status=target_status,admission_type=p_admission_type,
        previous_school=p_previous_school,notes=p_notes
      WHERE id=enrollment_id;
  END IF;
  DELETE FROM public.class_students cs USING public.classes c
    WHERE cs.class_id=c.id AND cs.student_id=p_student_id
      AND (c.school_year_id=year_id OR
           (c.school_year_id IS NULL AND c.school_year=year_name))
      AND cs.class_id<>p_class_id;
  INSERT INTO public.class_students(class_id,student_id)
    VALUES(p_class_id,p_student_id) ON CONFLICT DO NOTHING;
  IF current_year THEN
    UPDATE public.profiles SET class_name=v_class_name
      WHERE id=p_student_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'student_id',p_student_id,'school_year_id',year_id,
    'enrollment_id',enrollment_id,'status',target_status::text
  );
END;
$safe_legacy$;

CREATE OR REPLACE FUNCTION public.admin_set_student_enrollment_status(
  p_enrollment_id uuid,p_status text,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $safe_status$
DECLARE
  v_student_id uuid;
  v_class_id uuid;
  v_enrollment_year uuid;
  current_year boolean;
  new_status public.student_enrollment_status;
  actor_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'fixture: only global admin may change enrollment status'
      USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN
    ('draft','active','withdrawn','completed','cancelled') THEN
    RAISE EXCEPTION 'fixture: invalid status';
  END IF;
  actor_id:=auth.uid();
  new_status:=p_status::public.student_enrollment_status;
  -- MUST lock years FIRST: production status RPC instead holds enrollment
  -- row FOR UPDATE before checking sy.is_current. Deadlock review pending.
  PERFORM pg_catalog.set_config('lock_timeout','3s',true);
  LOCK TABLE public.school_years IN SHARE MODE;
  SELECT e.student_id,e.class_id,e.school_year_id,sy.is_current
    INTO v_student_id,v_class_id,v_enrollment_year,current_year
    FROM public.student_enrollments e
    JOIN public.school_years sy ON sy.id=e.school_year_id
    WHERE e.id=p_enrollment_id FOR UPDATE OF e;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'fixture: enrollment missing'; END IF;
  IF new_status='active' AND NOT COALESCE(current_year,false) THEN
    RAISE EXCEPTION 'fixture: cannot reactivate non-current year'
      USING ERRCODE='42501';
  END IF;
  UPDATE public.student_enrollments SET status=new_status,
    notes=COALESCE(p_note,notes),updated_by=actor_id WHERE id=p_enrollment_id;
  IF new_status='active' THEN
    PERFORM public.admin_upsert_student_enrollment(v_student_id,v_class_id);
  ELSIF new_status IN ('draft','withdrawn','cancelled') THEN
    DELETE FROM public.class_students WHERE student_id=v_student_id AND class_id=v_class_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('status',new_status::text,'student_id',v_student_id);
END;
$safe_status$;

-- SYNTHETIC gender wrapper: real function adds profile gender update.
-- The RPC wrapper must always call the guarded base upsert.
CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment_with_gender(
 p_student_id uuid,p_class_id uuid,p_enrolled_on date,p_admission_type text,
 p_previous_school text,p_notes text,p_gender text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $gender$
BEGIN
  RETURN public.admin_upsert_student_enrollment(
    p_student_id,p_class_id,p_enrolled_on,p_admission_type,p_previous_school,p_notes);
END;
$gender$;

-- The functions are test-only. They are NOT exposed via a network service.
