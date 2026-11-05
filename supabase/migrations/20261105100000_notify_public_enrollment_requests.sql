-- SCHOOLNET | Lot 5 | Notifications des demandes publiques
-- Migration additive, a executer APRES :
--   20261104140000_public_enrollment_requests.sql
--   20261104160000_public_requests_parent_access_and_email.sql
-- Ne modifie aucun dossier existant et n'envoie aucun e-mail.

begin;

-- Idempotence par destinataire et par demande (cible uniquement notre nouveau type d'evenement).
create unique index if not exists notifications_public_request_once_idx
  on public.notifications (user_id, event_key)
  where event_key like 'public_enrollment_request:%';

create or replace function public.notify_public_enrollment_request_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_event_key text;
  v_title text;
begin
  -- Le declencheur s'execute uniquement apres l'insertion reussie d'une demande.
  v_event_key := 'public_enrollment_request:' || new.id::text;
  v_title := case
    when new.request_type = 'parent_access'
      then 'Nouvelle demande d''acces parent / tuteur'
    else 'Nouvelle demande d''inscription'
  end;

  -- Pas de donnees personnelles dans la notification : seule la reference est transmise.
  -- Un enregistrement distinct est cree pour chaque administrateur reel.
  insert into public.notifications (
    user_id, title, body, type, is_read,
    created_at, action_url, event_key, related_id, read_at
  )
  select
    p.id,
    v_title,
    'Reference ' || new.reference || ' - demande a examiner dans l''administration.',
    'info'::public.notification_type,
    false,
    now(),
    '/app/admin/enrollment-requests?request=' || new.id::text,
    v_event_key,
    new.id,
    null
  from public.profiles as p
  where p.role::text = 'admin'
  on conflict do nothing;

  return new;
end;
$function$;

revoke all on function public.notify_public_enrollment_request_created()
  from public, anon, authenticated;

-- Pas de doublon de trigger si la migration est relancee manuellement.
do $install$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.public_enrollment_requests'::regclass
      and tgname = 'trg_notify_public_enrollment_request_created'
      and not tgisinternal
  ) then
    create trigger trg_notify_public_enrollment_request_created
      after insert on public.public_enrollment_requests
      for each row
      execute function public.notify_public_enrollment_request_created();
  end if;
end;
$install$;

-- Active les mises a jour Realtime utilisees par la cloche et le compteur.
-- Aucun acces anon/public n'est ajoute : les politiques RLS existantes restent en vigueur.
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'public_enrollment_requests'
    ) then
      alter publication supabase_realtime add table public.public_enrollment_requests;
    end if;
  end if;
end;
$realtime$;

comment on function public.notify_public_enrollment_request_created() is
  'Informe uniquement les administrateurs lors de la creation d''une demande publique SchoolNet.';

commit;
