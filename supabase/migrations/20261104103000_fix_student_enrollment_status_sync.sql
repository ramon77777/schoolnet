-- SCHOOLNET | Lot 5 - Correctif cible des inscriptions
-- Requiert la migration du noyau student_enrollments deja appliquee.
-- Ne supprime ni table, ni donnees, ni affectations historiques.
-- Fonctions conservees : admin_upsert_student_enrollment,
-- admin_remove_student_from_class, get_admin_student_enrollments,
-- get_admin_student_enrollment_history.

begin;

-- 1. Affectation : conserver les informations administratives du dossier
--    lorsqu'il existe deja pour l'annee scolaire de la classe cible.
create or replace function public.admin_assign_student_to_class(
  p_student_id uuid,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_school_year_id uuid;
  v_admission_type text;
  v_previous_school text;
  v_notes text;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé.';
  end if;

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

-- 2. Statuts : verrouiller le dossier, empecher une annee historique
--    de redevenir active, puis recalculer la classe du profil.
create or replace function public.admin_set_student_enrollment_status(
  p_enrollment_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

commit;
