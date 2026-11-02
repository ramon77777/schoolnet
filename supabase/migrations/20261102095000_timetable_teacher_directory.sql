-- ============================================================
-- SCHOOLNET
-- LOT 2 - EMPLOI DU TEMPS
-- Répertoire sécurisé des enseignants visibles
-- ============================================================

create or replace function public.get_timetable_teacher_directory(
  p_teacher_ids uuid[]
)
returns table (
  id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $function$

  select
    p.id,
    p.full_name

  from public.profiles p

  where p.role = 'teacher'::public.user_role

    and p.id = any(
      coalesce(
        p_teacher_ids,
        '{}'::uuid[]
      )
    )

    and exists (
      select 1

      from public.timetable_slots ts

      where ts.teacher_id = p.id

        and public.timetable_can_read_slot(
          ts.class_id,
          ts.teacher_id
        )
    )

  order by
    p.full_name nulls last,
    p.id;

$function$;


-- ------------------------------------------------------------
-- Sécurité
-- ------------------------------------------------------------

revoke all
on function public.get_timetable_teacher_directory(uuid[])
from public;


grant execute
on function public.get_timetable_teacher_directory(uuid[])
to authenticated;