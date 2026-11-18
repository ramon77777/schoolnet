-- SCHOOLNET LOT 5D-F | FULL LEGACY RPC SNAPSHOT | 18 NOVEMBER 2026
-- SANDBOX_ONLY, NEVER RUN ON SUPABASE PRINCIPAL, NEVER MOVE TO supabase/migrations.
-- NOT AN INSTALLABLE MIGRATION: proposal from READ-ONLY pg_get_functiondef snapshot.
-- Requires synthetic PostgreSQL 17 fixture and already installed 5D-A+B+E SANDBOX protections.
-- ONLY differences vs real RPC definitions: (1) fixed pg_catalog search_path and
-- (2) year-first SHARE lock before any table read or row write in each of 5 Admin functions.
-- No changes to real database, grants, RLS, registration rules or API were made.
-- DO NOT treat the simulation as real-schema parity, and never run in a SQL Editor.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $only_disposable_pg17$
BEGIN
  IF pg_catalog.current_database() <> 'schoolnet_lot5d_ci'
     OR pg_catalog.current_setting('server_version_num')::integer < 170000
     OR pg_catalog.to_regclass('public.school_year_rollover_runs') IS NULL
     OR pg_catalog.to_regnamespace('schoolnet_private') IS NULL
  THEN
    RAISE EXCEPTION 'LOT 5D-F: disposable PostgreSQL 17 fixture only.'
      USING ERRCODE='42501';
  END IF;
END;
$only_disposable_pg17$;

-- admin_upsert_student_enrollment | full function from read-only pg_get_functiondef; only search_path and year-first lock altered.
CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment(p_student_id uuid, p_class_id uuid, p_enrolled_on date DEFAULT CURRENT_DATE, p_admission_type text DEFAULT 'continuing'::text, p_previous_school text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_student_name text;

  v_class_name text;

  v_school_year_id uuid;
  v_school_year_name text;
  v_is_current_year boolean;

  v_enrollment_id uuid;
  v_enrollment_number text;

  v_previous_class_id uuid;
  v_previous_class_name text;

  v_target_status
    public.student_enrollment_status;
begin

  if not public.is_admin() then
    raise exception
      'Accès refusé.';
  end if;
  -- LOT 5D-F: lock the calendar BEFORE any data reads or enrollment row locks.
  -- The 5D finalizer uses an incompatible SHARE ROW EXCLUSIVE lock.
  LOCK TABLE public.school_years IN SHARE MODE;


  if p_admission_type not in (
    'new',
    'continuing',
    'transfer',
    'reentry'
  ) then
    raise exception
      'Type d''admission invalide.';
  end if;


  -- ----------------------------------------------------------
  -- Apprenant
  -- ----------------------------------------------------------

  select p.full_name
  into v_student_name
  from public.profiles p
  where p.id = p_student_id
    and p.role::text = 'student';

  if not found then
    raise exception
      'Apprenant introuvable.';
  end if;


  -- ----------------------------------------------------------
  -- Classe + année scolaire
  -- ----------------------------------------------------------

  select
    c.name,
    sy.id,
    sy.name,
    sy.is_current
  into
    v_class_name,
    v_school_year_id,
    v_school_year_name,
    v_is_current_year
  from public.classes c

  join public.school_years sy
    on (
      sy.id = c.school_year_id
      or (
        c.school_year_id is null
        and sy.name = c.school_year
      )
    )

  where c.id = p_class_id;

  if not found then
    raise exception
      'Classe ou année scolaire introuvable.';
  end if;


  v_target_status :=
    case
      when v_is_current_year
        then 'active'
          ::public.student_enrollment_status
      else 'completed'
          ::public.student_enrollment_status
    end;


  -- ----------------------------------------------------------
  -- Dossier existant ?
  -- ----------------------------------------------------------

  select
    se.id,
    se.class_id
  into
    v_enrollment_id,
    v_previous_class_id
  from public.student_enrollments se
  where se.student_id = p_student_id
    and se.school_year_id = v_school_year_id;


  if found then

    if v_previous_class_id
       is distinct from
       p_class_id
    then

      select c.name
      into v_previous_class_name
      from public.classes c
      where c.id = v_previous_class_id;

    end if;


    update public.student_enrollments se
    set
      class_id = p_class_id,
      status = v_target_status,
      admission_type = p_admission_type,
      previous_school = p_previous_school,
      notes = p_notes
    where se.id = v_enrollment_id
    returning
      se.enrollment_number
    into
      v_enrollment_number;

  else

    insert into public.student_enrollments (
      student_id,
      school_year_id,
      class_id,
      status,
      enrolled_on,
      admission_type,
      previous_school,
      notes
    )
    values (
      p_student_id,
      v_school_year_id,
      p_class_id,
      v_target_status,
      coalesce(
        p_enrolled_on,
        current_date
      ),
      p_admission_type,
      p_previous_school,
      p_notes
    )
    returning
      id,
      enrollment_number
    into
      v_enrollment_id,
      v_enrollment_number;

  end if;


  -- ----------------------------------------------------------
  -- Synchronisation class_students
  -- Une seule classe par apprenant / année
  -- ----------------------------------------------------------

  delete from public.class_students cs
  using public.classes c
  where cs.class_id = c.id
    and cs.student_id = p_student_id
    and (
      c.school_year_id = v_school_year_id
      or (
        c.school_year_id is null
        and c.school_year = v_school_year_name
      )
    )
    and cs.class_id <> p_class_id;


  insert into public.class_students (
    class_id,
    student_id
  )
  values (
    p_class_id,
    p_student_id
  )
  on conflict do nothing;


  -- ----------------------------------------------------------
  -- Classe courante du profil
  -- ----------------------------------------------------------

  if v_is_current_year then

    update public.profiles
    set class_name = v_class_name
    where id = p_student_id;

  end if;


  return jsonb_build_object(
    'enrollment_id',
      v_enrollment_id,

    'enrollment_number',
      v_enrollment_number,

    'student_id',
      p_student_id,

    'student_name',
      coalesce(
        v_student_name,
        'Apprenant'
      ),

    'class_id',
      p_class_id,

    'class_name',
      v_class_name,

    'school_year_id',
      v_school_year_id,

    'school_year',
      v_school_year_name,

    'previous_class',
      v_previous_class_name,

    'transferred',
      v_previous_class_id is not null
      and v_previous_class_id <> p_class_id,

    'status',
      v_target_status::text
  );

end;
$function$;

-- admin_upsert_student_enrollment_with_gender | full function from read-only pg_get_functiondef; only search_path and year-first lock altered.
CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment_with_gender(p_student_id uuid, p_class_id uuid, p_enrolled_on date, p_admission_type text, p_previous_school text, p_notes text, p_gender text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_gender text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Acces refuse.';
  end if;
  -- LOT 5D-F: lock the calendar BEFORE any data reads or enrollment row locks.
  -- The 5D finalizer uses an incompatible SHARE ROW EXCLUSIVE lock.
  LOCK TABLE public.school_years IN SHARE MODE;

  v_gender := lower(btrim(coalesce(p_gender, '')));
  if v_gender not in ('male', 'female') then
    raise exception 'Genre invalide : choisissez Masculin ou Feminin.';
  end if;

  -- L'appel au backend existant preserve le dossier, sa numerotation,
  -- les controles de classe/annee, les affectations et l'historique.
  v_result := public.admin_upsert_student_enrollment(
    p_student_id => p_student_id,
    p_class_id => p_class_id,
    p_enrolled_on => p_enrolled_on,
    p_admission_type => p_admission_type,
    p_previous_school => p_previous_school,
    p_notes => p_notes
  );

  update public.profiles
  set gender = v_gender
  where id = p_student_id
    and role::text = 'student';

  if not found then
    raise exception 'Profil apprenant introuvable.';
  end if;

  return v_result || jsonb_build_object('gender', v_gender);
end;
$function$;

-- admin_set_student_enrollment_status | full function from read-only pg_get_functiondef; only search_path and year-first lock altered.
CREATE OR REPLACE FUNCTION public.admin_set_student_enrollment_status(p_enrollment_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_school_year_id uuid;
  v_is_current_year boolean := false;
  v_admission_type text;
  v_previous_school text;
  v_notes text;
  v_current_class_name text;
  v_status public.student_enrollment_status;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé.';
  end if;
  -- LOT 5D-F: lock the calendar BEFORE any data reads or enrollment row locks.
  -- The 5D finalizer uses an incompatible SHARE ROW EXCLUSIVE lock.
  LOCK TABLE public.school_years IN SHARE MODE;

  if p_status is null or p_status not in (
    'draft', 'active', 'withdrawn', 'completed', 'cancelled'
  ) then
    raise exception 'Statut d''inscription invalide.';
  end if;

  v_status := p_status::public.student_enrollment_status;

  select
    se.student_id,
    se.class_id,
    se.school_year_id,
    sy.is_current,
    se.admission_type,
    se.previous_school,
    se.notes
  into
    v_student_id,
    v_class_id,
    v_school_year_id,
    v_is_current_year,
    v_admission_type,
    v_previous_school,
    v_notes
  from public.student_enrollments se
  join public.school_years sy
    on sy.id = se.school_year_id
  where se.id = p_enrollment_id
  for update of se;

  if not found then
    raise exception 'Dossier d''inscription introuvable.';
  end if;

  if v_status = 'active' and not coalesce(v_is_current_year, false) then
    raise exception
      'Impossible d''activer une inscription d''une année scolaire non courante.';
  end if;

  -- Ne pas effacer une note existante lorsque p_note est absent.
  if p_note is not null then
    v_notes := p_note;
  end if;

  update public.student_enrollments se
  set
    status = v_status,
    notes = v_notes
  where se.id = p_enrollment_id;

  if v_status = 'active' then
    -- L'upsert synchronise la table historique class_students,
    -- sans remplacer la date d'inscription preexistante.
    perform public.admin_upsert_student_enrollment(
      p_student_id => v_student_id,
      p_class_id => v_class_id,
      p_enrolled_on => current_date,
      p_admission_type => coalesce(v_admission_type, 'continuing'),
      p_previous_school => v_previous_school,
      p_notes => v_notes
    );
  elsif v_status in ('draft', 'withdrawn', 'cancelled') then
    -- Un statut inactif ne doit plus constituer une affectation de classe.
    delete from public.class_students
    where student_id = v_student_id
      and class_id = v_class_id;
  end if;

  -- Si l'annee scolaire est courante, ne pas effacer arbitrairement
  -- le profil lorsqu'une autre affectation courante subsiste.
  if coalesce(v_is_current_year, false) then
    select c.name
    into v_current_class_name
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
    join public.school_years sy
      on (
        sy.id = c.school_year_id
        or (
          c.school_year_id is null
          and sy.name = c.school_year
        )
      )
    where cs.student_id = v_student_id
      and sy.is_current = true
    order by cs.created_at desc, c.name
    limit 1;

    update public.profiles
    set class_name = v_current_class_name
    where id = v_student_id;
  end if;

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'student_id', v_student_id,
    'class_id', v_class_id,
    'status', v_status::text
  );
end;
$function$;

-- admin_assign_student_to_class | full function from read-only pg_get_functiondef; only search_path and year-first lock altered.
CREATE OR REPLACE FUNCTION public.admin_assign_student_to_class(p_student_id uuid, p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_school_year_id uuid;
  v_admission_type text;
  v_previous_school text;
  v_notes text;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé.';
  end if;
  -- LOT 5D-F: lock the calendar BEFORE any data reads or enrollment row locks.
  -- The 5D finalizer uses an incompatible SHARE ROW EXCLUSIVE lock.
  LOCK TABLE public.school_years IN SHARE MODE;

  select sy.id
  into v_school_year_id
  from public.classes c
  join public.school_years sy
    on (
      sy.id = c.school_year_id
      or (
        c.school_year_id is null
        and sy.name = c.school_year
      )
    )
  where c.id = p_class_id;

  if not found then
    raise exception 'Classe ou année scolaire introuvable.';
  end if;

  select
    se.admission_type,
    se.previous_school,
    se.notes
  into
    v_admission_type,
    v_previous_school,
    v_notes
  from public.student_enrollments se
  where se.student_id = p_student_id
    and se.school_year_id = v_school_year_id;

  return public.admin_upsert_student_enrollment(
    p_student_id => p_student_id,
    p_class_id => p_class_id,
    p_enrolled_on => current_date,
    p_admission_type => coalesce(v_admission_type, 'continuing'),
    p_previous_school => v_previous_school,
    p_notes => v_notes
  );
end;
$function$;

-- admin_remove_student_from_class | full function from read-only pg_get_functiondef; only search_path and year-first lock altered.
CREATE OR REPLACE FUNCTION public.admin_remove_student_from_class(p_student_id uuid, p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_student_name text;

  v_class_name text;

  v_school_year_id uuid;
  v_school_year_name text;
  v_is_current_year boolean := false;

  v_remaining_current_class text;

  v_deleted integer := 0;
begin

  if not public.is_admin() then
    raise exception
      'Accès refusé.';
  end if;
  -- LOT 5D-F: lock the calendar BEFORE any data reads or enrollment row locks.
  -- The 5D finalizer uses an incompatible SHARE ROW EXCLUSIVE lock.
  LOCK TABLE public.school_years IN SHARE MODE;


  select p.full_name
  into v_student_name
  from public.profiles p
  where p.id = p_student_id
    and p.role::text = 'student';

  if not found then
    raise exception
      'Apprenant introuvable.';
  end if;


  select
    c.name,
    sy.id,
    sy.name,
    sy.is_current
  into
    v_class_name,
    v_school_year_id,
    v_school_year_name,
    v_is_current_year
  from public.classes c

  join public.school_years sy
    on (
      sy.id = c.school_year_id
      or (
        c.school_year_id is null
        and sy.name = c.school_year
      )
    )

  where c.id = p_class_id;

  if not found then
    raise exception
      'Classe introuvable.';
  end if;


  delete from public.class_students
  where class_id = p_class_id
    and student_id = p_student_id;

  get diagnostics
    v_deleted = row_count;


  if v_deleted = 0 then
    raise exception
      'Cet apprenant n''est pas affecté à cette classe.';
  end if;


  -- ----------------------------------------------------------
  -- Le dossier reste conservé pour l'historique
  -- mais devient retiré.
  -- ----------------------------------------------------------

  update public.student_enrollments
  set
    status = 'withdrawn'
      ::public.student_enrollment_status
  where student_id = p_student_id
    and school_year_id = v_school_year_id
    and class_id = p_class_id;


  -- ----------------------------------------------------------
  -- Synchroniser profiles.class_name
  -- ----------------------------------------------------------

  if v_is_current_year then

    select c.name
    into v_remaining_current_class

    from public.class_students cs

    join public.classes c
      on c.id = cs.class_id

    join public.school_years sy
      on (
        sy.id = c.school_year_id
        or (
          c.school_year_id is null
          and sy.name = c.school_year
        )
      )

    where cs.student_id = p_student_id
      and sy.is_current = true

    order by
      cs.created_at desc

    limit 1;


    update public.profiles
    set class_name =
      v_remaining_current_class
    where id = p_student_id;

  end if;


  return jsonb_build_object(
    'student_id',
      p_student_id,

    'student_name',
      coalesce(
        v_student_name,
        'Apprenant'
      ),

    'class_id',
      p_class_id,

    'class_name',
      v_class_name,

    'school_year_id',
      v_school_year_id,

    'school_year',
      v_school_year_name,

    'removed',
      true,

    'status',
      'withdrawn'
  );

end;
$function$;

-- NO GRANT, NO ROLE CREATION, NO AUTH/PROFILE DATA CHANGES.
-- This sandbox script is NOT suitable for production or independent installation.
COMMIT;
