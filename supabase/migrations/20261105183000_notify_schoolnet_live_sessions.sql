-- SCHOOLNET LIVE | Bloc A - Notifications des cours en direct
-- Additive migration. Prerequisites:
--   20261105113000_create_schoolnet_live_core.sql
--   notifications + notification_type enum + parent_links already in SchoolNet.
-- This migration does not send emails, browser push, or scheduled reminders.
-- Apply only after review in the intended Supabase environment.

begin;

-- One notification per recipient per session and event.
create unique index if not exists notifications_schoolnet_live_event_once_idx
  on public.notifications (user_id, event_key)
  where event_key like 'schoolnet_live:%';

create or replace function schoolnet_private.notify_live_session_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
  v_event_key text;
  v_local_start text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' then
      return new;
    end if;
    v_event := 'scheduled';
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    if old.status = 'scheduled' and new.status = 'live' then
      v_event := 'started';
    elsif old.status = 'scheduled' and new.status = 'cancelled' then
      v_event := 'cancelled';
    else
      return new;
    end if;
  else
    return new;
  end if;

  v_event_key := 'schoolnet_live:' || v_event || ':' || new.id::text;
  v_local_start := to_char(
    new.starts_at at time zone 'Africa/Abidjan',
    'DD/MM/YYYY "à" HH24:MI'
  );

  -- Both an active enrollment and a class assignment are required.
  -- Parents must be linked to a matching pupil; the existing
  -- parent_links and profiles.child_ids relations are both supported.
  with active_students as (
    select distinct se.student_id
    from public.student_enrollments se
    join public.class_students cs
      on cs.student_id = se.student_id
     and cs.class_id = se.class_id
    join public.profiles sp
      on sp.id = se.student_id
     and sp.role::text = 'student'
    where se.class_id = new.class_id
      and se.status::text = 'active'
  ), recipients as (
    select s.student_id as user_id, 'student'::text as audience
    from active_students s

    union

    select p.id as user_id, 'parent'::text as audience
    from public.profiles p
    where p.role::text = 'parent'
      and (
        exists (
          select 1
          from public.parent_links pl
          join active_students s on s.student_id = pl.student_id
          where pl.parent_id = p.id
        )
        or exists (
          select 1
          from active_students s
          where s.student_id = any(
            coalesce(p.child_ids, '{}'::uuid[])
          )
        )
      )

    union

    select p.id as user_id, 'admin'::text as audience
    from public.profiles p
    where p.role::text = 'admin'
      and v_event in ('scheduled', 'cancelled')

    union

    select p.id as user_id, 'teacher'::text as audience
    from public.profiles p
    where p.id = new.teacher_id
      and p.role::text = 'teacher'
      and v_event = 'cancelled'
  )
  insert into public.notifications (
    user_id, title, body, type, is_read,
    created_at, action_url, event_key, related_id, read_at
  )
  select
    r.user_id,
    case
      when v_event = 'scheduled' then 'Nouveau cours en direct programmé'
      when v_event = 'started' then 'Votre cours en direct est ouvert'
      else 'Cours en direct annulé'
    end,
    case
      when v_event = 'scheduled' then
        format('« %s » est programmé le %s (heure d''Abidjan).', new.title, v_local_start)
      when v_event = 'started' then
        format('La salle de « %s » est ouverte. Vous pouvez rejoindre le cours.', new.title)
      else
        format('La séance « %s » du %s a été annulée.', new.title, v_local_start)
    end,
    (case
      when v_event = 'started' then 'success'
      when v_event = 'cancelled' then 'warning'
      else 'info'
    end)::public.notification_type,
    false,
    now(),
    case r.audience
      when 'student' then
        case
          when v_event = 'started' then '/app/student/live/' || new.id::text
          else '/app/student/live'
        end
      when 'parent' then '/app/parent/timetable'
      when 'teacher' then '/app/teacher/live'
      else '/app/admin/live'
    end,
    v_event_key,
    new.id,
    null
  from recipients r
  on conflict do nothing;

  return new;
end;
$function$;

revoke all on function schoolnet_private.notify_live_session_event()
  from public, anon, authenticated;

drop trigger if exists trg_notify_schoolnet_live_session
  on public.live_sessions;
create trigger trg_notify_schoolnet_live_session
  after insert or update of status
  on public.live_sessions
  for each row
  execute function schoolnet_private.notify_live_session_event();

comment on function schoolnet_private.notify_live_session_event() is
  'SchoolNet Live: in-app notifications for session scheduling, opening and cancellation; per-recipient idempotence.';

-- Realtime for notifications was enabled by the public-enrollment module.
-- No additional RLS permissions and no Daily credential exposure.
commit;
