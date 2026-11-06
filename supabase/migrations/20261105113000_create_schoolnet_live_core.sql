-- SCHOOLNET LIVE - Migration 01
-- Create live lesson sessions without changing existing school records.
-- Run in Supabase SQL Editor as the database administrator.

begin;

-- btree_gist is already used by the timetable module.
create extension if not exists btree_gist with schema extensions;

-- Not an exposed API schema. Keep it out of Supabase Exposed schemas.
create schema if not exists schoolnet_private;
revoke all on schema schoolnet_private from public;
grant usage on schema schoolnet_private to authenticated;

-- 1. Public metadata only: never place a Daily join URL or API key here.
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_sessions_title_length check (char_length(btrim(title)) between 3 and 160),
  constraint live_sessions_description_length check (description is null or char_length(description) <= 2000),
  constraint live_sessions_time_valid check (
    ends_at > starts_at and ends_at <= starts_at + interval '4 hours'
  ),
  constraint live_sessions_status_valid check (
    status in ('scheduled', 'live', 'completed', 'cancelled')
  )
);

create index if not exists live_sessions_class_time_idx
  on public.live_sessions (class_id, starts_at);
create index if not exists live_sessions_teacher_time_idx
  on public.live_sessions (teacher_id, starts_at);
create index if not exists live_sessions_course_time_idx
  on public.live_sessions (course_id, starts_at);

-- Prevent simultaneous active meetings for the same class or teacher.
do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.live_sessions'::regclass
      and conname = 'live_sessions_teacher_no_overlap'
  ) then
    alter table public.live_sessions
      add constraint live_sessions_teacher_no_overlap
      exclude using gist (
        teacher_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (status in ('scheduled', 'live'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.live_sessions'::regclass
      and conname = 'live_sessions_class_no_overlap'
  ) then
    alter table public.live_sessions
      add constraint live_sessions_class_no_overlap
      exclude using gist (
        class_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (status in ('scheduled', 'live'));
  end if;
end;
$constraints$;

-- 2. Daily room details: service-role access only, no browser access.
create table if not exists public.live_session_rooms (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  daily_room_name text not null unique,
  daily_room_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint live_session_rooms_name_not_blank check (btrim(daily_room_name) <> ''),
  constraint live_session_rooms_url_https check (left(daily_room_url, 8) = 'https://')
);

alter table public.live_sessions enable row level security;
alter table public.live_session_rooms enable row level security;

revoke all on public.live_sessions from public, anon, authenticated;
revoke all on public.live_session_rooms from public, anon, authenticated;
grant select on public.live_sessions to authenticated;
grant select, insert, update, delete on public.live_sessions to service_role;
grant select, insert, update, delete on public.live_session_rooms to service_role;

-- 3. Automatic timestamps for all legitimate backend state transitions.
create or replace function schoolnet_private.live_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function schoolnet_private.live_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists trg_live_sessions_updated_at on public.live_sessions;
create trigger trg_live_sessions_updated_at
before update on public.live_sessions
for each row execute function schoolnet_private.live_touch_updated_at();

-- 4. Membership checks are private; no unrestricted query on student data.
create or replace function schoolnet_private.live_can_read(
  p_class_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.is_admin()
    or (public.is_teacher() and p_teacher_id = auth.uid())
    or exists (
      select 1
      from public.student_enrollments se
      join public.class_students cs
        on cs.student_id = se.student_id and cs.class_id = se.class_id
      where se.student_id = auth.uid()
        and se.class_id = p_class_id
        and se.status::text = 'active'
    )
    or exists (
      select 1
      from public.parent_links pl
      join public.student_enrollments se on se.student_id = pl.student_id
      join public.class_students cs
        on cs.student_id = se.student_id and cs.class_id = se.class_id
      where pl.parent_id = auth.uid()
        and se.class_id = p_class_id
        and se.status::text = 'active'
    )
  );
$function$;

revoke all on function schoolnet_private.live_can_read(uuid, uuid)
  from public, anon, authenticated;
grant execute on function schoolnet_private.live_can_read(uuid, uuid)
  to authenticated;

drop policy if exists live_sessions_read_authorized on public.live_sessions;
create policy live_sessions_read_authorized
on public.live_sessions for select to authenticated
using (schoolnet_private.live_can_read(class_id, teacher_id));

-- No INSERT, UPDATE, DELETE policies or grants for authenticated.
-- The teacher writes only through the limited RPC below.

-- 5. Privileged writer is internal and checks the actual auth.uid().
create or replace function schoolnet_private.live_create_session(
  p_course_id uuid,
  p_teacher_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class_id uuid;
  v_course_title text;
  v_title text;
  v_description text;
  v_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;

  if not (
    public.is_admin()
    or (public.is_teacher() and p_teacher_id = auth.uid())
  ) then
    raise exception 'Vous ne pouvez pas programmer cette seance.';
  end if;

  select co.class_id, co.title
    into v_class_id, v_course_title
  from public.courses co
  where co.id = p_course_id and co.status::text = 'active';

  if not found or v_class_id is null then
    raise exception 'Cours actif avec classe obligatoire.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_teacher_id and p.role::text = 'teacher'
  ) then
    raise exception 'Enseignant invalide.';
  end if;

  if not exists (
    select 1 from public.class_teachers ct
    where ct.class_id = v_class_id and ct.teacher_id = p_teacher_id
  ) or not exists (
    select 1 from public.courses co
    where co.id = p_course_id
      and (
        co.created_by = p_teacher_id
        or exists (
          select 1 from public.course_teachers t
          where t.course_id = co.id and t.teacher_id = p_teacher_id
        )
      )
  ) then
    raise exception 'Enseignant non affecte au cours et a la classe.';
  end if;

  if not exists (
    select 1
    from public.classes c
    join public.school_years sy on (
      sy.id = c.school_year_id
      or (c.school_year_id is null and sy.name = c.school_year)
    )
    where c.id = v_class_id and sy.is_current = true
  ) then
    raise exception 'La classe doit appartenir a l''annee scolaire courante.';
  end if;

  if p_starts_at is null or p_ends_at is null
    or p_starts_at < now() - interval '5 minutes'
    or p_starts_at > now() + interval '365 days'
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '4 hours' then
    raise exception 'Horaire invalide (duree maximale : 4 heures).';
  end if;

  v_title := btrim(coalesce(nullif(p_title, ''), v_course_title));
  v_description := nullif(btrim(p_description), '');

  if v_title is null or char_length(v_title) not between 3 and 160
    or (v_description is not null and char_length(v_description) > 2000) then
    raise exception 'Titre ou description invalide.';
  end if;

  insert into public.live_sessions (
    course_id, class_id, teacher_id, title, description,
    starts_at, ends_at, status, created_by
  ) values (
    p_course_id, v_class_id, p_teacher_id, v_title, v_description,
    p_starts_at, p_ends_at, 'scheduled', auth.uid()
  ) returning id into v_session_id;

  return jsonb_build_object(
    'session_id', v_session_id, 'status', 'scheduled'
  );
end;
$function$;

revoke all on function schoolnet_private.live_create_session(
  uuid, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function schoolnet_private.live_create_session(
  uuid, uuid, timestamptz, timestamptz, text, text
) to authenticated;

-- Public RPC is SECURITY INVOKER; elevated function is in unexposed schema.
create or replace function public.live_create_session(
  p_course_id uuid,
  p_teacher_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text default null,
  p_description text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select schoolnet_private.live_create_session(
    p_course_id, p_teacher_id, p_starts_at, p_ends_at,
    p_title, p_description
  );
$function$;

revoke all on function public.live_create_session(
  uuid, uuid, timestamptz, timestamptz, text, text
) from public, anon;
grant execute on function public.live_create_session(
  uuid, uuid, timestamptz, timestamptz, text, text
) to authenticated;

-- 6. Cancellation is possible only before the session begins.
create or replace function schoolnet_private.live_cancel_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;

  select s.teacher_id, s.status into v_teacher_id, v_status
  from public.live_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Seance introuvable.';
  end if;

  if not (public.is_admin() or
    (public.is_teacher() and v_teacher_id = auth.uid())) then
    raise exception 'Acces refuse.';
  end if;

  if v_status <> 'scheduled' then
    raise exception 'Seule une seance programmee peut etre annulee ici.';
  end if;

  update public.live_sessions
  set status = 'cancelled'
  where id = p_session_id;

  return jsonb_build_object('session_id', p_session_id, 'status', 'cancelled');
end;
$function$;

revoke all on function schoolnet_private.live_cancel_session(uuid)
  from public, anon, authenticated;
grant execute on function schoolnet_private.live_cancel_session(uuid)
  to authenticated;

create or replace function public.live_cancel_session(p_session_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select schoolnet_private.live_cancel_session(p_session_id);
$function$;

revoke all on function public.live_cancel_session(uuid) from public, anon;
grant execute on function public.live_cancel_session(uuid) to authenticated;

comment on table public.live_sessions is
  'SchoolNet Live session schedule; room credentials are not stored here.';
comment on table public.live_session_rooms is
  'Daily room details. Service role only. Never grant read access to app users.';

commit;
