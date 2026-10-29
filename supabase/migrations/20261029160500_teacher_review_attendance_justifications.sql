-- ============================================================
-- SCHOOLNET
-- Migration : traitement des justificatifs par l'enseignant
--
-- Objectif :
-- - permettre a l'enseignant responsable d'une seance cloturee
--   de lire les justificatifs lies a cette seance ;
-- - permettre l'acceptation ou le rejet uniquement via une RPC
--   securisee ;
-- - empecher un enseignant de traiter les justificatifs d'une
--   seance appartenant a un autre enseignant.
-- ============================================================


-- ============================================================
-- 1. Controle securise de lecture
-- ============================================================

create or replace function public.teacher_can_read_attendance_justification(
  p_justification_id uuid
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
      from public.attendance_justifications aj
      join public.attendance_records ar
        on ar.id = aj.attendance_record_id
      join public.attendance_sessions s
        on s.id = ar.session_id
      where aj.id = p_justification_id
        and s.teacher_id = auth.uid()
        and s.status = 'closed'
    );
$$;

revoke all
on function public.teacher_can_read_attendance_justification(uuid)
from public;

revoke all
on function public.teacher_can_read_attendance_justification(uuid)
from anon;

grant execute
on function public.teacher_can_read_attendance_justification(uuid)
to authenticated;


-- ============================================================
-- 2. Policy SELECT enseignant
-- ============================================================

alter table public.attendance_justifications enable row level security;

drop policy if exists attendance_justifications_teacher_select_own_sessions
on public.attendance_justifications;

create policy attendance_justifications_teacher_select_own_sessions
on public.attendance_justifications
for select
to authenticated
using (
  public.teacher_can_read_attendance_justification(id)
);


-- ============================================================
-- 3. RPC securisee de validation / rejet
-- ============================================================

create or replace function public.review_attendance_justification(
  p_justification_id uuid,
  p_status text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance_justifications%rowtype;
begin
  if not public.is_teacher() then
    raise exception 'Seul un enseignant peut traiter un justificatif.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Decision invalide. Valeurs autorisees : approved ou rejected.';
  end if;

  if not exists (
    select 1
    from public.attendance_justifications aj
    join public.attendance_records ar
      on ar.id = aj.attendance_record_id
    join public.attendance_sessions s
      on s.id = ar.session_id
    where aj.id = p_justification_id
      and s.teacher_id = auth.uid()
      and s.status = 'closed'
  ) then
    raise exception 'Vous ne pouvez pas traiter ce justificatif.';
  end if;

  if p_status = 'approved' then
    update public.attendance_justifications
    set
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), ''),
      updated_at = now()
    where id = p_justification_id
      and status = 'pending'
    returning * into v_row;
  else
    update public.attendance_justifications
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), ''),
      updated_at = now()
    where id = p_justification_id
      and status = 'pending'
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'Ce justificatif a deja ete traite ou n''existe plus.';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all
on function public.review_attendance_justification(uuid, text, text)
from public;

revoke all
on function public.review_attendance_justification(uuid, text, text)
from anon;

grant execute
on function public.review_attendance_justification(uuid, text, text)
to authenticated;
