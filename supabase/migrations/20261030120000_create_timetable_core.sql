-- ============================================================
-- SCHOOLNET
-- LOT 2 - EMPLOI DU TEMPS
-- Migration : noyau rooms + timetable_slots
-- ============================================================


-- ============================================================
-- 1. EXTENSION NECESSAIRE AUX CONTRAINTES D'EXCLUSION
-- ============================================================

create extension if not exists btree_gist
with schema extensions;


-- ============================================================
-- 2. SALLES
-- ============================================================

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  code text null,

  capacity integer null,
  notes text null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rooms_name_not_blank
    check (btrim(name) <> ''),

  constraint rooms_code_not_blank
    check (code is null or btrim(code) <> ''),

  constraint rooms_capacity_positive
    check (capacity is null or capacity > 0)
);


create unique index if not exists rooms_name_unique_ci
  on public.rooms (lower(btrim(name)));


create unique index if not exists rooms_code_unique_ci
  on public.rooms (lower(btrim(code)))
  where code is not null;


-- ============================================================
-- 3. CRENEAUX D'EMPLOI DU TEMPS
--
-- Convention :
-- 1 = lundi
-- 2 = mardi
-- 3 = mercredi
-- 4 = jeudi
-- 5 = vendredi
-- 6 = samedi
-- 7 = dimanche
-- ============================================================

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),

  school_year_id uuid not null
    references public.school_years(id),

  class_id uuid not null
    references public.classes(id),

  course_id uuid not null
    references public.courses(id),

  teacher_id uuid not null
    references public.profiles(id),

  room_id uuid null
    references public.rooms(id)
    on delete set null,

  day_of_week smallint not null,

  starts_at time without time zone not null,
  ends_at time without time zone not null,

  notes text null,

  is_active boolean not null default true,

  created_by uuid not null
    default auth.uid()
    references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Fenêtre artificielle servant aux contraintes
  -- de chevauchement hebdomadaires.
  time_window tsrange generated always as (
    tsrange(
      date '2000-01-01' + starts_at,
      date '2000-01-01' + ends_at,
      '[)'
    )
  ) stored,

  constraint timetable_slots_day_of_week_valid
    check (day_of_week between 1 and 7),

  constraint timetable_slots_time_valid
    check (ends_at > starts_at)
);


-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists timetable_slots_school_year_idx
  on public.timetable_slots(school_year_id);


create index if not exists timetable_slots_class_idx
  on public.timetable_slots(class_id);


create index if not exists timetable_slots_course_idx
  on public.timetable_slots(course_id);


create index if not exists timetable_slots_teacher_idx
  on public.timetable_slots(teacher_id);


create index if not exists timetable_slots_room_idx
  on public.timetable_slots(room_id);


create index if not exists timetable_slots_day_idx
  on public.timetable_slots(day_of_week);


-- ============================================================
-- 5. PROTECTION CONTRE LES CHEVAUCHEMENTS
-- ============================================================

alter table public.timetable_slots
  add constraint timetable_slots_no_class_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    class_id with =,
    time_window with &&
  )
  where (is_active);


alter table public.timetable_slots
  add constraint timetable_slots_no_teacher_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    teacher_id with =,
    time_window with &&
  )
  where (is_active);


alter table public.timetable_slots
  add constraint timetable_slots_no_room_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    room_id with =,
    time_window with &&
  )
  where (
    is_active
    and room_id is not null
  );


-- ============================================================
-- 6. VALIDATION METIER D'UN CRENEAU
-- ============================================================

create or replace function public.validate_timetable_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$

declare
  v_class_school_year_id uuid;
  v_course_class_id uuid;
  v_course_status public.course_status;
  v_teacher_role public.user_role;
  v_room_active boolean;

begin

  -- ----------------------------------------------------------
  -- Classe + année scolaire
  -- ----------------------------------------------------------

  select
    c.school_year_id
  into
    v_class_school_year_id
  from public.classes c
  where c.id = new.class_id;


  if not found then
    raise exception
      'TIMETABLE_INVALID_CLASS: classe introuvable';
  end if;


  if v_class_school_year_id is null then
    raise exception
      'TIMETABLE_CLASS_WITHOUT_SCHOOL_YEAR: la classe ne possède pas de school_year_id';
  end if;


  if v_class_school_year_id <> new.school_year_id then
    raise exception
      'TIMETABLE_SCHOOL_YEAR_MISMATCH: l''année scolaire du créneau ne correspond pas à celle de la classe';
  end if;


  -- ----------------------------------------------------------
  -- Cours + classe
  -- ----------------------------------------------------------

  select
    co.class_id,
    co.status
  into
    v_course_class_id,
    v_course_status
  from public.courses co
  where co.id = new.course_id;


  if not found then
    raise exception
      'TIMETABLE_INVALID_COURSE: cours introuvable';
  end if;


  if v_course_class_id is null
     or v_course_class_id <> new.class_id then

    raise exception
      'TIMETABLE_COURSE_CLASS_MISMATCH: le cours n''appartient pas à la classe sélectionnée';

  end if;


  if v_course_status <> 'active'::public.course_status then
    raise exception
      'TIMETABLE_INACTIVE_COURSE: le cours sélectionné n''est pas actif';
  end if;


  -- ----------------------------------------------------------
  -- Enseignant
  -- ----------------------------------------------------------

  select
    p.role
  into
    v_teacher_role
  from public.profiles p
  where p.id = new.teacher_id;


  if not found
     or v_teacher_role <> 'teacher'::public.user_role then

    raise exception
      'TIMETABLE_INVALID_TEACHER: le profil sélectionné n''est pas un enseignant';

  end if;


  if not exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = new.course_id
      and ct.teacher_id = new.teacher_id
  ) then

    raise exception
      'TIMETABLE_TEACHER_NOT_ASSIGNED_TO_COURSE: l''enseignant n''est pas affecté à ce cours';

  end if;


  if not exists (
    select 1
    from public.class_teachers ct
    where ct.class_id = new.class_id
      and ct.teacher_id = new.teacher_id
  ) then

    raise exception
      'TIMETABLE_TEACHER_NOT_ASSIGNED_TO_CLASS: l''enseignant n''est pas affecté à cette classe';

  end if;


  -- ----------------------------------------------------------
  -- Salle facultative
  -- ----------------------------------------------------------

  if new.room_id is not null then

    select
      r.is_active
    into
      v_room_active
    from public.rooms r
    where r.id = new.room_id;


    if not found then
      raise exception
        'TIMETABLE_INVALID_ROOM: salle introuvable';
    end if;


    if not v_room_active then
      raise exception
        'TIMETABLE_INACTIVE_ROOM: cette salle est inactive';
    end if;

  end if;


  return new;

end;

$function$;


drop trigger if exists trg_validate_timetable_slot
on public.timetable_slots;


create trigger trg_validate_timetable_slot
before insert or update
on public.timetable_slots
for each row
execute function public.validate_timetable_slot();


-- ============================================================
-- 7. UPDATED_AT
-- ============================================================

create or replace function public.set_timetable_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$

begin
  new.updated_at = now();
  return new;
end;

$function$;


drop trigger if exists trg_rooms_updated_at
on public.rooms;


create trigger trg_rooms_updated_at
before update
on public.rooms
for each row
execute function public.set_timetable_updated_at();


drop trigger if exists trg_timetable_slots_updated_at
on public.timetable_slots;


create trigger trg_timetable_slots_updated_at
before update
on public.timetable_slots
for each row
execute function public.set_timetable_updated_at();


-- ============================================================
-- 8. HELPER RLS : LECTURE D'UN CRENEAU
-- ============================================================

create or replace function public.timetable_can_read_slot(
  p_class_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$

  select

    -- Administrateur
    public.is_admin()

    -- Enseignant directement concerné
    or (
      public.is_teacher()
      and p_teacher_id = auth.uid()
    )

    -- Apprenant appartenant à la classe
    or exists (
      select 1
      from public.class_students cs
      where cs.class_id = p_class_id
        and cs.student_id = auth.uid()
    )

    -- Parent d'un apprenant appartenant à la classe
    or exists (
      select 1

      from public.parent_links pl

      join public.class_students cs
        on cs.student_id = pl.student_id

      where pl.parent_id = auth.uid()
        and cs.class_id = p_class_id
    );

$function$;


-- ============================================================
-- 9. RLS
-- ============================================================

alter table public.rooms
enable row level security;


alter table public.timetable_slots
enable row level security;


-- ------------------------------------------------------------
-- ROOMS
-- ------------------------------------------------------------

drop policy if exists rooms_select_authenticated
on public.rooms;


create policy rooms_select_authenticated
on public.rooms
for select
to authenticated
using (true);


drop policy if exists rooms_admin_all
on public.rooms;


create policy rooms_admin_all
on public.rooms
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ------------------------------------------------------------
-- TIMETABLE SLOTS
-- ------------------------------------------------------------

drop policy if exists timetable_slots_select_authorized
on public.timetable_slots;


create policy timetable_slots_select_authorized
on public.timetable_slots
for select
to authenticated
using (
  public.timetable_can_read_slot(
    class_id,
    teacher_id
  )
);


drop policy if exists timetable_slots_admin_all
on public.timetable_slots;


create policy timetable_slots_admin_all
on public.timetable_slots
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ============================================================
-- 10. PRIVILEGES SQL
-- RLS reste responsable de l'autorisation réelle.
-- ============================================================

grant select, insert, update, delete
on public.rooms
to authenticated;


grant select, insert, update, delete
on public.timetable_slots
to authenticated;


-- ============================================================
-- FIN
-- ============================================================