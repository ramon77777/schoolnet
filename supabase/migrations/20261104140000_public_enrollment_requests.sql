-- SCHOOLNET / Lot 5 / public request intake (no anonymous table access)
-- Apply to an isolated Supabase branch first. No existing enrollment tables altered.

create table if not exists public.public_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('DEM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  student_full_name text not null
    check (char_length(btrim(student_full_name)) between 3 and 160),
  student_gender text not null
    check (student_gender in ('male', 'female')),
  requested_level text not null
    check (char_length(btrim(requested_level)) between 2 and 80),
  guardian_full_name text not null
    check (char_length(btrim(guardian_full_name)) between 3 and 160),
  guardian_relationship text not null
    check (guardian_relationship in ('father', 'mother', 'guardian')),
  guardian_phone text not null
    check (char_length(btrim(guardian_phone)) between 8 and 30),
  guardian_email text
    check (guardian_email is null or char_length(guardian_email) <= 254),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'processed', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_enrollment_requests_date_idx
  on public.public_enrollment_requests (submitted_at desc);
create index if not exists public_enrollment_requests_status_idx
  on public.public_enrollment_requests (status, submitted_at desc);

create table if not exists public.public_enrollment_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.public_enrollment_requests(id)
    on delete restrict,
  from_status text not null,
  to_status text not null,
  note text,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists public_enrollment_request_events_request_idx
  on public.public_enrollment_request_events (request_id, created_at desc);

alter table public.public_enrollment_requests enable row level security;
alter table public.public_enrollment_request_events enable row level security;

-- Strictly no INSERT/UPDATE/DELETE by browsers. Only server-side intake
-- using service-role and the admin RPC below can write.
revoke all on public.public_enrollment_requests from public, anon, authenticated;
revoke all on public.public_enrollment_request_events from public, anon, authenticated;
grant select on public.public_enrollment_requests to authenticated;
grant select on public.public_enrollment_request_events to authenticated;
grant select, insert on public.public_enrollment_requests to service_role;
grant select, insert on public.public_enrollment_request_events to service_role;

-- Migrations often run again on branches; avoid duplicate named policies.
drop policy if exists public_enrollment_requests_admin_read
  on public.public_enrollment_requests;
create policy public_enrollment_requests_admin_read
  on public.public_enrollment_requests for select to authenticated
  using (public.is_admin());

drop policy if exists public_enrollment_request_events_admin_read
  on public.public_enrollment_request_events;
create policy public_enrollment_request_events_admin_read
  on public.public_enrollment_request_events for select to authenticated
  using (public.is_admin());

create or replace function public.admin_review_public_enrollment_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old_status text;
  v_reference text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;
  if p_status not in ('contacted', 'processed', 'rejected') then
    raise exception 'Statut invalide.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Observation trop longue.';
  end if;

  select status, reference into v_old_status, v_reference
  from public.public_enrollment_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;

  if v_old_status is not distinct from p_status
     and p_note is null then
    return jsonb_build_object('request_id', p_request_id,
                              'reference', v_reference, 'status', v_old_status);
  end if;

  update public.public_enrollment_requests
  set status = p_status,
      review_note = coalesce(p_note, review_note),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  insert into public.public_enrollment_request_events
    (request_id, from_status, to_status, note, actor_id)
  values (p_request_id, v_old_status, p_status, p_note, auth.uid());

  return jsonb_build_object('request_id', p_request_id,
                            'reference', v_reference, 'status', p_status);
end;
$fn$;

revoke all on function public.admin_review_public_enrollment_request(uuid,text,text)
  from public, anon;
grant execute on function public.admin_review_public_enrollment_request(uuid,text,text)
  to authenticated;
