-- ============================================================
-- SCHOOLNET
-- Module Bulletins
-- Lot 3.3 - Appréciations enseignants
-- ============================================================


-- ============================================================
-- 1. LECTURE DES MATIERES DE BULLETIN DE L'ENSEIGNANT CONNECTE
-- ============================================================

create or replace function public.get_teacher_report_card_subjects()
returns table (
    report_card_subject_id uuid,
    report_card_id uuid,

    student_id uuid,
    student_name text,

    class_id uuid,
    class_name text,

    period_id uuid,
    period_name text,

    school_year_id uuid,
    school_year_name text,

    report_card_status text,

    subject_id uuid,
    subject_name text,

    subject_average numeric,
    subject_coefficient numeric,

    teacher_comment text,
    sort_order integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    -- --------------------------------------------------------
    -- Authentification obligatoire
    -- --------------------------------------------------------

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Le compte doit être un enseignant
    -- --------------------------------------------------------

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'teacher'
    ) then
        raise exception
            'Accès réservé aux enseignants.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Retourner uniquement les matières affectées
    -- à l'enseignant connecté
    -- --------------------------------------------------------

    return query

    select
        rcs.id as report_card_subject_id,
        rc.id as report_card_id,

        rc.student_id,
        rc.student_name_snapshot,

        rc.class_id,
        rc.class_name_snapshot,

        rc.period_id,
        rc.period_name_snapshot,

        rc.school_year_id,
        rc.school_year_name_snapshot,

        rc.status,

        rcs.subject_id,
        rcs.subject_name_snapshot,

        rcs.subject_average,
        rcs.subject_coefficient,

        rcs.teacher_comment,
        rcs.sort_order

    from public.report_card_subjects rcs

    join public.report_cards rc
      on rc.id = rcs.report_card_id

    where rcs.teacher_id = auth.uid()

    order by
        rc.school_year_name_snapshot desc,
        rc.period_name_snapshot,
        rc.class_name_snapshot,
        rc.student_name_snapshot,
        rcs.sort_order,
        rcs.subject_name_snapshot;

end;
$$;



-- ============================================================
-- 2. MODIFICATION DE L'APPRECIATION ENSEIGNANT
-- ============================================================

create or replace function public.update_teacher_report_card_comment(
    p_report_card_subject_id uuid,
    p_teacher_comment text
)
returns table (
    report_card_subject_id uuid,
    teacher_comment text,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_comment text;
    v_updated_at timestamptz;
begin

    -- --------------------------------------------------------
    -- Authentification obligatoire
    -- --------------------------------------------------------

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Le compte doit être enseignant
    -- --------------------------------------------------------

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'teacher'
    ) then
        raise exception
            'Accès réservé aux enseignants.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Mise à jour contrôlée
    --
    -- Conditions :
    -- - ligne appartenant à l'enseignant connecté
    -- - bulletin encore en brouillon
    -- - seule teacher_comment est modifiable
    -- --------------------------------------------------------

    update public.report_card_subjects rcs

    set
        teacher_comment =
            nullif(
                btrim(
                    coalesce(
                        p_teacher_comment,
                        ''
                    )
                ),
                ''
            ),

        updated_at = now()

    from public.report_cards rc

    where rcs.id = p_report_card_subject_id

      and rc.id = rcs.report_card_id

      and rcs.teacher_id = auth.uid()

      and rc.status = 'draft'

    returning
        rcs.id,
        rcs.teacher_comment,
        rcs.updated_at

    into
        v_id,
        v_comment,
        v_updated_at;


    -- --------------------------------------------------------
    -- Rien modifié = accès interdit ou bulletin verrouillé
    -- --------------------------------------------------------

    if v_id is null then
        raise exception
            'Impossible de modifier cette appréciation. Le bulletin peut être verrouillé ou ne pas appartenir à cet enseignant.'
            using errcode = '42501';
    end if;


    return query
    select
        v_id,
        v_comment,
        v_updated_at;

end;
$$;



-- ============================================================
-- 3. DROITS D'EXECUTION
-- ============================================================

revoke all
on function public.get_teacher_report_card_subjects()
from public;

revoke all
on function public.get_teacher_report_card_subjects()
from anon;


revoke all
on function public.update_teacher_report_card_comment(uuid, text)
from public;

revoke all
on function public.update_teacher_report_card_comment(uuid, text)
from anon;


grant execute
on function public.get_teacher_report_card_subjects()
to authenticated;

grant execute
on function public.update_teacher_report_card_comment(uuid, text)
to authenticated;