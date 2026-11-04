begin;

-- ============================================================
-- SCHOOLNET
-- MODULE INSCRIPTIONS / DOSSIERS
-- Noyau des inscriptions annuelles des apprenants
-- ============================================================


-- ============================================================
-- 1. STATUT D'INSCRIPTION
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n
      on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'student_enrollment_status'
  ) then
    create type public.student_enrollment_status as enum (
      'draft',
      'active',
      'withdrawn',
      'completed',
      'cancelled'
    );
  end if;
end
$$;


-- ============================================================
-- 2. SEQUENCE NUMERO D'INSCRIPTION
-- ============================================================

create sequence if not exists
  public.student_enrollment_number_seq
  start with 1
  increment by 1;


-- ============================================================
-- 3. TABLE PRINCIPALE
-- ============================================================

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),

  enrollment_number text not null unique,

  student_id uuid not null
    references public.profiles(id)
    on delete cascade,

  school_year_id uuid not null
    references public.school_years(id)
    on delete restrict,

  class_id uuid not null
    references public.classes(id)
    on delete restrict,

  status public.student_enrollment_status
    not null
    default 'active',

  enrolled_on date
    not null
    default current_date,

  admission_type text
    not null
    default 'continuing',

  previous_school text,

  notes text,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  constraint student_enrollments_admission_type_check
    check (
      admission_type in (
        'new',
        'continuing',
        'transfer',
        'reentry'
      )
    ),

  constraint student_enrollments_student_year_key
    unique (
      student_id,
      school_year_id
    )
);


-- ============================================================
-- 4. INDEX
-- ============================================================

create index if not exists
  idx_student_enrollments_student
  on public.student_enrollments(student_id);

create index if not exists
  idx_student_enrollments_school_year
  on public.student_enrollments(school_year_id);

create index if not exists
  idx_student_enrollments_class
  on public.student_enrollments(class_id);

create index if not exists
  idx_student_enrollments_status
  on public.student_enrollments(status);

create index if not exists
  idx_student_enrollments_year_class_status
  on public.student_enrollments(
    school_year_id,
    class_id,
    status
  );


-- ============================================================
-- 5. VALIDATION + NUMERO AUTOMATIQUE
-- ============================================================

create or replace function
public.prepare_student_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_role text;

  v_class_school_year_id uuid;
  v_class_school_year_name text;

  v_school_year_name text;
  v_year_code text;
begin

  -- ----------------------------------------------------------
  -- Vérifier que le profil est bien un apprenant
  -- ----------------------------------------------------------

  select p.role::text
  into v_student_role
  from public.profiles p
  where p.id = new.student_id;

  if not found
     or v_student_role <> 'student'
  then
    raise exception
      'Le profil sélectionné n''est pas un apprenant.';
  end if;


  -- ----------------------------------------------------------
  -- Année scolaire cible
  -- ----------------------------------------------------------

  select sy.name
  into v_school_year_name
  from public.school_years sy
  where sy.id = new.school_year_id;

  if not found then
    raise exception
      'Année scolaire introuvable.';
  end if;


  -- ----------------------------------------------------------
  -- Classe cible
  -- ----------------------------------------------------------

  select
    c.school_year_id,
    c.school_year
  into
    v_class_school_year_id,
    v_class_school_year_name
  from public.classes c
  where c.id = new.class_id;

  if not found then
    raise exception
      'Classe introuvable.';
  end if;


  -- ----------------------------------------------------------
  -- Cohérence classe / année scolaire
  -- ----------------------------------------------------------

  if v_class_school_year_id is not null then

    if v_class_school_year_id <> new.school_year_id then
      raise exception
        'La classe sélectionnée ne correspond pas à l''année scolaire du dossier.';
    end if;

  else

    if v_class_school_year_name
       is distinct from
       v_school_year_name
    then
      raise exception
        'La classe sélectionnée ne correspond pas à l''année scolaire du dossier.';
    end if;

  end if;


  -- ----------------------------------------------------------
  -- Numéro d'inscription automatique
  -- Exemple : INS-2026-000001
  -- ----------------------------------------------------------

  if new.enrollment_number is null
     or btrim(new.enrollment_number) = ''
  then

    v_year_code :=
      substring(
        v_school_year_name
        from '([0-9]{4})'
      );

    if v_year_code is null then
      v_year_code :=
        to_char(current_date, 'YYYY');
    end if;

    new.enrollment_number :=
      'INS-' ||
      v_year_code ||
      '-' ||
      lpad(
        nextval(
          'public.student_enrollment_number_seq'::regclass
        )::text,
        6,
        '0'
      );

  end if;


  -- ----------------------------------------------------------
  -- Métadonnées
  -- ----------------------------------------------------------

  if tg_op = 'INSERT' then

    new.created_at :=
      coalesce(
        new.created_at,
        now()
      );

    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

  end if;

  new.updated_at := now();

  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;


  return new;

end;
$$;


drop trigger if exists
  trg_prepare_student_enrollment
on public.student_enrollments;

create trigger trg_prepare_student_enrollment
before insert or update
on public.student_enrollments
for each row
execute function
  public.prepare_student_enrollment();


-- ============================================================
-- 6. HISTORIQUE DU DOSSIER
-- ============================================================

create table if not exists
public.student_enrollment_events (
  id uuid primary key
    default gen_random_uuid(),

  enrollment_id uuid not null
    references public.student_enrollments(id)
    on delete cascade,

  event_type text not null,

  from_class_id uuid
    references public.classes(id)
    on delete set null,

  to_class_id uuid
    references public.classes(id)
    on delete set null,

  from_status public.student_enrollment_status,

  to_status public.student_enrollment_status,

  note text,

  actor_id uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz
    not null
    default now(),

  constraint student_enrollment_events_type_check
    check (
      event_type in (
        'created',
        'class_changed',
        'status_changed'
      )
    )
);


create index if not exists
  idx_student_enrollment_events_enrollment
  on public.student_enrollment_events(
    enrollment_id,
    created_at desc
  );


-- ============================================================
-- 7. TRIGGER HISTORIQUE
-- ============================================================

create or replace function
public.log_student_enrollment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

  if tg_op = 'INSERT' then

    insert into
      public.student_enrollment_events (
        enrollment_id,
        event_type,
        to_class_id,
        to_status,
        actor_id
      )
    values (
      new.id,
      'created',
      new.class_id,
      new.status,
      auth.uid()
    );

    return new;

  end if;


  if old.class_id
     is distinct from
     new.class_id
  then

    insert into
      public.student_enrollment_events (
        enrollment_id,
        event_type,
        from_class_id,
        to_class_id,
        from_status,
        to_status,
        actor_id
      )
    values (
      new.id,
      'class_changed',
      old.class_id,
      new.class_id,
      old.status,
      new.status,
      auth.uid()
    );

  end if;


  if old.status
     is distinct from
     new.status
  then

    insert into
      public.student_enrollment_events (
        enrollment_id,
        event_type,
        from_class_id,
        to_class_id,
        from_status,
        to_status,
        actor_id
      )
    values (
      new.id,
      'status_changed',
      old.class_id,
      new.class_id,
      old.status,
      new.status,
      auth.uid()
    );

  end if;


  return new;

end;
$$;


drop trigger if exists
  trg_log_student_enrollment_event
on public.student_enrollments;

create trigger trg_log_student_enrollment_event
after insert or update
on public.student_enrollments
for each row
execute function
  public.log_student_enrollment_event();


-- ============================================================
-- 8. RLS
-- ============================================================

alter table public.student_enrollments
  enable row level security;

alter table public.student_enrollment_events
  enable row level security;


drop policy if exists
  student_enrollments_admin_all
on public.student_enrollments;

create policy
  student_enrollments_admin_all
on public.student_enrollments
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);


drop policy if exists
  student_enrollments_student_parent_read
on public.student_enrollments;

create policy
  student_enrollments_student_parent_read
on public.student_enrollments
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_linked_parent_of(student_id)
);


drop policy if exists
  student_enrollment_events_admin_read
on public.student_enrollment_events;

create policy
  student_enrollment_events_admin_read
on public.student_enrollment_events
for select
to authenticated
using (
  public.is_admin()
);


grant
  select,
  insert,
  update,
  delete
on public.student_enrollments
to authenticated;

grant select
on public.student_enrollment_events
to authenticated;


-- ============================================================
-- 9. REPRISE DE L'EXISTANT
-- class_students -> student_enrollments
-- ============================================================

with resolved_existing_students as (
  select distinct on (
    cs.student_id,
    sy.id
  )

    cs.student_id,
    sy.id as school_year_id,
    cs.class_id,
    sy.is_current,
    sy.starts_on,
    cs.created_at

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

  join public.profiles p
    on p.id = cs.student_id
   and p.role::text = 'student'

  order by
    cs.student_id,
    sy.id,
    cs.created_at desc,
    cs.class_id
)

insert into public.student_enrollments (
  student_id,
  school_year_id,
  class_id,
  status,
  enrolled_on,
  admission_type,
  notes,
  created_at,
  updated_at
)

select
  r.student_id,
  r.school_year_id,
  r.class_id,

  case
    when r.is_current
      then 'active'
        ::public.student_enrollment_status
    else 'completed'
        ::public.student_enrollment_status
  end,

  r.starts_on,

  'continuing',

  'Dossier initialisé automatiquement à partir de l''affectation de classe existante.',

  coalesce(
    r.created_at,
    now()
  ),

  now()

from resolved_existing_students r

on conflict (
  student_id,
  school_year_id
)
do nothing;


-- ============================================================
-- 10. RPC ADMIN : CREER / METTRE A JOUR UNE INSCRIPTION
-- ============================================================

create or replace function
public.admin_upsert_student_enrollment(
  p_student_id uuid,
  p_class_id uuid,
  p_enrolled_on date default current_date,
  p_admission_type text default 'continuing',
  p_previous_school text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;


-- ============================================================
-- 11. COMPATIBILITE AVEC ADMINCLASSES EXISTANT
-- ============================================================

create or replace function
public.admin_assign_student_to_class(
  p_student_id uuid,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

  return public.admin_upsert_student_enrollment(
    p_student_id => p_student_id,
    p_class_id => p_class_id,
    p_enrolled_on => current_date,
    p_admission_type => 'continuing',
    p_previous_school => null,
    p_notes => null
  );

end;
$$;


-- ============================================================
-- 12. RETIRER UN APPRENANT D'UNE CLASSE
-- ============================================================

create or replace function
public.admin_remove_student_from_class(
  p_student_id uuid,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;


-- ============================================================
-- 13. MODIFICATION DU STATUT DU DOSSIER
-- ============================================================

create or replace function
public.admin_set_student_enrollment_status(
  p_enrollment_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_school_year_id uuid;

  v_school_year_current boolean;

  v_status
    public.student_enrollment_status;
begin

  if not public.is_admin() then
    raise exception
      'Accès refusé.';
  end if;


  if p_status not in (
    'draft',
    'active',
    'withdrawn',
    'completed',
    'cancelled'
  ) then
    raise exception
      'Statut d''inscription invalide.';
  end if;


  v_status :=
    p_status::public.student_enrollment_status;


  select
    se.student_id,
    se.class_id,
    se.school_year_id
  into
    v_student_id,
    v_class_id,
    v_school_year_id
  from public.student_enrollments se
  where se.id = p_enrollment_id;

  if not found then
    raise exception
      'Dossier d''inscription introuvable.';
  end if;


  update public.student_enrollments se
  set
    status = v_status,
    notes =
      case
        when p_note is not null
          then p_note
        else se.notes
      end
  where se.id = p_enrollment_id;


  -- ----------------------------------------------------------
  -- Si actif : garantir l'affectation à la classe
  -- ----------------------------------------------------------

  if v_status = 'active' then

    perform
      public.admin_upsert_student_enrollment(
        p_student_id => v_student_id,
        p_class_id => v_class_id,
        p_enrolled_on => current_date,
        p_admission_type => (
          select se.admission_type
          from public.student_enrollments se
          where se.id = p_enrollment_id
        ),
        p_previous_school => (
          select se.previous_school
          from public.student_enrollments se
          where se.id = p_enrollment_id
        ),
        p_notes => (
          select se.notes
          from public.student_enrollments se
          where se.id = p_enrollment_id
        )
      );

  end if;


  -- ----------------------------------------------------------
  -- Brouillon / retrait / annulation :
  -- ne doit plus compter comme affectation active.
  -- ----------------------------------------------------------

  if v_status in (
    'draft',
    'withdrawn',
    'cancelled'
  ) then

    delete from public.class_students
    where student_id = v_student_id
      and class_id = v_class_id;

  end if;


  select sy.is_current
  into v_school_year_current
  from public.school_years sy
  where sy.id = v_school_year_id;


  if coalesce(
    v_school_year_current,
    false
  )
  and v_status in (
    'draft',
    'withdrawn',
    'cancelled'
  )
  then

    update public.profiles
    set class_name = null
    where id = v_student_id;

  end if;


  return jsonb_build_object(
    'enrollment_id',
      p_enrollment_id,

    'student_id',
      v_student_id,

    'class_id',
      v_class_id,

    'status',
      v_status::text
  );

end;
$$;


-- ============================================================
-- 14. LECTURE ADMIN
-- ============================================================

create or replace function
public.get_admin_student_enrollments(
  p_school_year_id uuid default null,
  p_class_id uuid default null,
  p_status text default null,
  p_search text default null
)
returns table (
  enrollment_id uuid,
  enrollment_number text,

  student_id uuid,
  student_name text,

  school_year_id uuid,
  school_year_name text,

  class_id uuid,
  class_name text,

  status text,

  enrolled_on date,
  admission_type text,
  previous_school text,
  notes text,

  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

  if not public.is_admin() then
    raise exception
      'Accès refusé.';
  end if;


  return query

  select
    se.id,
    se.enrollment_number,

    se.student_id,
    p.full_name,

    se.school_year_id,
    sy.name,

    se.class_id,
    c.name,

    se.status::text,

    se.enrolled_on,
    se.admission_type,
    se.previous_school,
    se.notes,

    se.created_at,
    se.updated_at

  from public.student_enrollments se

  join public.profiles p
    on p.id = se.student_id

  join public.school_years sy
    on sy.id = se.school_year_id

  join public.classes c
    on c.id = se.class_id

  where
    (
      p_school_year_id is null
      or se.school_year_id =
         p_school_year_id
    )

    and (
      p_class_id is null
      or se.class_id =
         p_class_id
    )

    and (
      p_status is null
      or se.status::text =
         p_status
    )

    and (
      p_search is null
      or btrim(p_search) = ''
      or p.full_name ilike
         '%' || btrim(p_search) || '%'
      or se.enrollment_number ilike
         '%' || btrim(p_search) || '%'
      or c.name ilike
         '%' || btrim(p_search) || '%'
    )

  order by
    sy.starts_on desc,
    c.name,
    p.full_name;

end;
$$;


-- ============================================================
-- 15. HISTORIQUE ADMIN
-- ============================================================

create or replace function
public.get_admin_student_enrollment_history(
  p_enrollment_id uuid
)
returns table (
  event_id uuid,
  event_type text,

  from_class_id uuid,
  from_class_name text,

  to_class_id uuid,
  to_class_name text,

  from_status text,
  to_status text,

  note text,

  actor_id uuid,
  actor_name text,

  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

  if not public.is_admin() then
    raise exception
      'Accès refusé.';
  end if;


  return query

  select
    e.id,
    e.event_type,

    e.from_class_id,
    fc.name,

    e.to_class_id,
    tc.name,

    e.from_status::text,
    e.to_status::text,

    e.note,

    e.actor_id,
    p.full_name,

    e.created_at

  from public.student_enrollment_events e

  left join public.classes fc
    on fc.id = e.from_class_id

  left join public.classes tc
    on tc.id = e.to_class_id

  left join public.profiles p
    on p.id = e.actor_id

  where e.enrollment_id =
    p_enrollment_id

  order by
    e.created_at desc;

end;
$$;


-- ============================================================
-- 16. DROITS RPC
-- ============================================================

revoke all
on function
public.admin_upsert_student_enrollment(
  uuid,
  uuid,
  date,
  text,
  text,
  text
)
from public;

grant execute
on function
public.admin_upsert_student_enrollment(
  uuid,
  uuid,
  date,
  text,
  text,
  text
)
to authenticated;


revoke all
on function
public.admin_assign_student_to_class(
  uuid,
  uuid
)
from public;

grant execute
on function
public.admin_assign_student_to_class(
  uuid,
  uuid
)
to authenticated;


revoke all
on function
public.admin_remove_student_from_class(
  uuid,
  uuid
)
from public;

grant execute
on function
public.admin_remove_student_from_class(
  uuid,
  uuid
)
to authenticated;


revoke all
on function
public.admin_set_student_enrollment_status(
  uuid,
  text,
  text
)
from public;

grant execute
on function
public.admin_set_student_enrollment_status(
  uuid,
  text,
  text
)
to authenticated;


revoke all
on function
public.get_admin_student_enrollments(
  uuid,
  uuid,
  text,
  text
)
from public;

grant execute
on function
public.get_admin_student_enrollments(
  uuid,
  uuid,
  text,
  text
)
to authenticated;


revoke all
on function
public.get_admin_student_enrollment_history(
  uuid
)
from public;

grant execute
on function
public.get_admin_student_enrollment_history(
  uuid
)
to authenticated;


notify pgrst, 'reload schema';

commit;