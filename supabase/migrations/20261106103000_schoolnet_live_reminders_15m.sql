-- SCHOOLNET LIVE | Rappel automatique 15 minutes avant les cours
-- Requiert :
--   20261105113000_create_schoolnet_live_core.sql
--   20261105183000_notify_schoolnet_live_sessions.sql
--   l'extension pg_cron activee dans Supabase > Integrations > Cron
--
-- A executer une fois dans le projet Supabase souhaite, apres validation.
-- Aucune adresse Daily, aucun token, aucun e-mail ni push n'est genere.
-- Tache programmee en base : aucune dependance aux visites du site Vercel.
-- Compatible avec plusieurs executions : idempotence par user_id + event_key.

begin;

do $prerequisites$
begin
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise exception
      'SCHOOLNET LIVE : activer Supabase Cron (extension pg_cron) avant cette migration.';
  end if;

  if to_regclass('public.live_sessions') is null
    or to_regclass('public.student_enrollments') is null
    or to_regclass('public.class_students') is null
    or to_regclass('public.notifications') is null
    or to_regclass('public.parent_links') is null then
    raise exception
      'SCHOOLNET LIVE : tables prealables manquantes. Executer les migrations anterieures.';
  end if;
end;
$prerequisites$;

-- La contrainte unique introduite dans la migration des notifications LIVE
-- protege egalement les rappels (y compris en cas de relance de la tache).
create unique index if not exists notifications_schoolnet_live_event_once_idx
  on public.notifications (user_id, event_key)
  where event_key like 'schoolnet_live:%';

-- Accelere le controle des cours imminents sur une base de grande taille.
create index if not exists live_sessions_reminders_due_idx
  on public.live_sessions (starts_at)
  where status = 'scheduled';

create or replace function schoolnet_private.dispatch_live_reminders_15m()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inserted integer := 0;
begin
  -- Cette fonction n'est executee que par le proprietaire du job Cron.
  -- Elle selectionne les cours encore programmes, qui commencent
  -- dans les 15 prochaines minutes, et non les cours deja termines.
  --
  -- La tache est lancee chaque minute : un cours programme tardivement
  -- obtient aussi un rappel avant son debut (s'il reste du temps).
  -- Le verrou SHARE empeche une annulation concurrente pendant l'envoi.
  with due_sessions as materialized (
    select
      s.id as session_id,
      s.class_id,
      s.title,
      s.starts_at
    from public.live_sessions s
    where s.status = 'scheduled'
      and s.starts_at > now()
      and s.starts_at <= now() + interval '15 minutes'
    for share of s skip locked
  ),
  eligible_students as (
    select distinct
      d.session_id,
      se.student_id
    from due_sessions d
    join public.student_enrollments se
      on se.class_id = d.class_id
     and se.status::text = 'active'
    join public.class_students cs
      on cs.student_id = se.student_id
     and cs.class_id = se.class_id
    join public.profiles sp
      on sp.id = se.student_id
     and sp.role::text = 'student'
  ),
  recipients as (
    -- Les apprenants inscrits et effectivement affectes a la classe.
    select
      es.session_id,
      es.student_id as user_id,
      'student'::text as audience
    from eligible_students es

    union

    -- Les parents/tuteurs explicitement lies a un enfant admissible.
    -- Le format historique profiles.child_ids et parent_links coexistent.
    select
      es.session_id,
      p.id as user_id,
      'parent'::text as audience
    from eligible_students es
    join public.profiles p
      on p.role::text = 'parent'
     and (
       exists (
         select 1
         from public.parent_links pl
         where pl.parent_id = p.id
           and pl.student_id = es.student_id
       )
       or es.student_id = any(coalesce(p.child_ids, '{}'::uuid[]))
     )
  )
  insert into public.notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    created_at,
    action_url,
    event_key,
    related_id,
    read_at
  )
  select
    r.user_id,
    case
      when r.audience = 'parent'
        then 'Rappel : cours en direct de votre enfant'
      else 'Rappel : votre cours en direct commence bientôt'
    end,
    case
      when r.audience = 'parent' then format(
        'Le cours « %s » de votre enfant commence dans moins de 15 minutes, le %s (heure d''Abidjan).',
        d.title,
        to_char(
          d.starts_at at time zone 'Africa/Abidjan',
          'DD/MM/YYYY "à" HH24:MI'
        )
      )
      else format(
        'Votre cours « %s » commence dans moins de 15 minutes, le %s (heure d''Abidjan).',
        d.title,
        to_char(
          d.starts_at at time zone 'Africa/Abidjan',
          'DD/MM/YYYY "à" HH24:MI'
        )
      )
    end,
    'info'::public.notification_type,
    false,
    now(),
    case r.audience
      when 'parent' then '/app/parent/live'
      else '/app/student/live'
    end,
    'schoolnet_live:reminder_15m:' || d.session_id::text,
    d.session_id,
    null
  from recipients r
  join due_sessions d
    on d.session_id = r.session_id
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function schoolnet_private.dispatch_live_reminders_15m()
  from public, anon, authenticated;

comment on function schoolnet_private.dispatch_live_reminders_15m() is
  'Notifications in-app a T-15 min, apprenants et parents lies; pas de doublons ni identifiants Daily.';

-- Job nomme : une seconde application du script actualise le meme job
-- au lieu de creer une seconde tache.
select cron.schedule(
  'schoolnet_live_reminders_15m',
  '* * * * *',
  'select schoolnet_private.dispatch_live_reminders_15m();'
);

commit;
