-- ============================================================
-- SCHOOLNET
-- Migration : lecture des profils élèves par leur enseignant
--
-- Objectif :
-- Un enseignant authentifié peut lire le profil d'un apprenant
-- uniquement si cet apprenant appartient à une classe à laquelle
-- l'enseignant est réellement affecté.
--
-- RLS reste active sur public.profiles.
-- ============================================================


-- ============================================================
-- 1. Fonction sécurisée de contrôle
-- ============================================================

create or replace function public.teacher_can_read_student_profile(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_teacher()
    and exists (
      select 1
      from public.class_students cs
      join public.class_teachers ct
        on ct.class_id = cs.class_id
      where cs.student_id = p_student_id
        and ct.teacher_id = auth.uid()
    );
$$;


-- ============================================================
-- 2. Permissions de la fonction
-- ============================================================

revoke all
on function public.teacher_can_read_student_profile(uuid)
from public;

revoke all
on function public.teacher_can_read_student_profile(uuid)
from anon;

grant execute
on function public.teacher_can_read_student_profile(uuid)
to authenticated;


-- ============================================================
-- 3. Policy RLS sur public.profiles
-- ============================================================

drop policy if exists profiles_select_students_of_assigned_teacher
on public.profiles;

create policy profiles_select_students_of_assigned_teacher
on public.profiles
for select
to authenticated
using (
  public.teacher_can_read_student_profile(id)
);