-- SCHOOLNET | Mon profil - mise a jour limitee aux informations personnelles.
-- Conserver ce fichier dans supabase/migrations et executer une seule fois
-- dans le projet Supabase selectionne (apres sauvegarde si production).
-- Ne modifie ni les roles ni les affectations scolaires.

begin;

create or replace function public.update_my_personal_profile(
  p_full_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 150 then
    raise exception 'Le nom doit contenir entre 2 et 150 caracteres.';
  end if;

  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'Le numero de telephone est trop long.';
  end if;

  update public.profiles p
  set full_name = v_name,
      phone = v_phone
  where p.id = v_user_id
  returning p.* into v_profile;

  if not found then
    raise exception 'Profil introuvable.';
  end if;

  return jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone
  );
end;
$function$;

revoke all on function public.update_my_personal_profile(text,text) from public, anon;
grant execute on function public.update_my_personal_profile(text,text) to authenticated;

-- Photos privees : chaque utilisateur n'accede qu'a son dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'schoolnet-profile-avatars',
  'schoolnet-profile-avatars',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do nothing;

-- Les politiques ne touchent qu'au nouveau compartiment d'avatars.
drop policy if exists "schoolnet_avatar_self_read" on storage.objects;
create policy "schoolnet_avatar_self_read"
on storage.objects
for select to authenticated
using (
  bucket_id = 'schoolnet-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "schoolnet_avatar_self_insert" on storage.objects;
create policy "schoolnet_avatar_self_insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'schoolnet-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('png', 'jpg', 'webp')
);

drop policy if exists "schoolnet_avatar_self_delete" on storage.objects;
create policy "schoolnet_avatar_self_delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'schoolnet-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Seules les photos presentes dans ce bucket, dans le dossier de l'utilisateur,
-- peuvent etre referencees dans son profil.
create or replace function public.set_my_profile_avatar(
  p_avatar_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_avatar_path, '')), '');
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  if v_path is not null then
    if v_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$') then
      raise exception 'Chemin de photo invalide.';
    end if;

    if not exists (
      select 1 from storage.objects so
      where so.bucket_id = 'schoolnet-profile-avatars'
        and so.name = v_path
    ) then
      raise exception 'Photo introuvable dans le stockage securise.';
    end if;
  end if;

  update public.profiles p
  set avatar_url = v_path
  where p.id = v_user_id;

  if not found then
    raise exception 'Profil introuvable.';
  end if;

  return jsonb_build_object('avatar_url', v_path);
end;
$function$;

revoke all on function public.set_my_profile_avatar(text) from public, anon;
grant execute on function public.set_my_profile_avatar(text) to authenticated;

commit;
