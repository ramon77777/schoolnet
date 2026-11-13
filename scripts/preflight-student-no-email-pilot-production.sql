-- READ ONLY: SCHOOLNET 5.C-B.2 pilot preflight, main Supabase project.
-- Does NOT create any request, Auth user, profile, code or parent link.
SELECT
 (SELECT COUNT(*) FROM auth.users) AS existing_auth_users,
 (SELECT COUNT(*) FROM public.profiles) AS existing_profiles,
 (SELECT COUNT(*) FROM public.public_enrollment_requests) AS existing_public_requests,
 (SELECT COUNT(*) FROM public.schoolnet_family_invitation_records) AS existing_parent_invitation_records,
 (SELECT COUNT(*) FROM public.schoolnet_student_no_email_requests) AS pilot_student_identities,
 (SELECT COUNT(*) FROM public.parent_links) AS existing_family_links,
 (SELECT COUNT(*) FROM public.public_enrollment_requests
  WHERE student_full_name ILIKE 'RECETTE SCHOOLNET PILOTE%'
     OR guardian_full_name ILIKE 'RECETTE SCHOOLNET PILOTE%') AS pilot_name_collisions,
 (SELECT COUNT(*) FROM auth.users WHERE email ILIKE '%@schoolnet.invalid') AS existing_internal_aliases;
