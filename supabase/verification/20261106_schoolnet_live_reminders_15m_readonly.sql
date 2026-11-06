-- SCHOOLNET LIVE | Verification non destructive des rappels automatiques
-- Executer APRES la migration 20261106103000_schoolnet_live_reminders_15m.sql.
-- Ce fichier ne modifie aucune donnee.
--
-- 1. Extension Cron active et fonction presente.
select
  exists(select 1 from pg_extension where extname = 'pg_cron') as cron_active,
  to_regprocedure('schoolnet_private.dispatch_live_reminders_15m()') is not null
    as fonction_presente;

-- 2. Tache programmee toutes les minutes.
select
  jobid,
  jobname,
  schedule,
  active,
  command
from cron.job
where jobname = 'schoolnet_live_reminders_15m';

-- 3. Historique des 10 dernieres executions (succes ou erreurs).
select
  j.jobname,
  d.status,
  d.start_time,
  d.end_time,
  d.return_message
from cron.job j
join cron.job_run_details d on d.jobid = j.jobid
where j.jobname = 'schoolnet_live_reminders_15m'
order by d.start_time desc
limit 10;

-- 4. Rappels crees ; un seul par destinataire et par seance.
select
  n.event_key,
  count(*) as nombre_destinataires,
  count(distinct n.user_id) as destinataires_distincts,
  min(n.created_at) as premier_rappel
from public.notifications n
where n.event_key like 'schoolnet_live:reminder_15m:%'
group by n.event_key
order by premier_rappel desc
limit 15;

-- 5. Controle des doublons : le resultat attendu est 0 ligne.
select n.user_id, n.event_key, count(*) as total
from public.notifications n
where n.event_key like 'schoolnet_live:reminder_15m:%'
group by n.user_id, n.event_key
having count(*) > 1;

-- 6. Fonction interne non executable par les utilisateurs du navigateur.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as accessible_au_role_authenticated,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as accessible_au_role_anon
from pg_proc p
where p.oid = to_regprocedure(
  'schoolnet_private.dispatch_live_reminders_15m()'
);
