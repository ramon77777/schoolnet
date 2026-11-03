-- ============================================================
-- SCHOOLNET
-- BULLETINS - LECTURE APPRENANT / PARENT
-- ============================================================
--
-- Objectifs :
--
-- 1. Un apprenant ne peut consulter que SES bulletins publiés.
-- 2. Un parent ne peut consulter que les bulletins publiés
--    des enfants présents dans profiles.child_ids.
-- 3. Les brouillons restent strictement invisibles.
-- 4. Les tables report_cards / report_card_subjects conservent
--    leurs politiques RLS actuelles.
--
-- ============================================================


-- ============================================================
-- 1. BULLETINS PUBLIES DE L'APPRENANT CONNECTE
-- ============================================================

create or replace function public.get_student_report_cards()
returns table (
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

    general_average numeric,

    rank_position bigint,
    ranked_students_count bigint,

    subjects_count bigint,
    subjects_coefficient_total numeric,

    general_comment text,
    decision text,

    published_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    -- --------------------------------------------------------
    -- Authentification
    -- --------------------------------------------------------

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Rôle apprenant obligatoire
    -- --------------------------------------------------------

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'student'
    ) then
        raise exception
            'Accès réservé aux apprenants.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Seulement les bulletins publiés de l'apprenant connecté
    -- --------------------------------------------------------

    return query

    select
        rc.id,
        rc.student_id,
        rc.student_name_snapshot,

        rc.class_id,
        rc.class_name_snapshot,

        rc.period_id,
        rc.period_name_snapshot,

        rc.school_year_id,
        rc.school_year_name_snapshot,

        rc.status,

        rc.general_average,

        rc.rank_position,
        rc.ranked_students_count,

        rc.subjects_count,
        rc.subjects_coefficient_total,

        rc.general_comment,
        rc.decision,

        rc.published_at

    from public.report_cards rc

    where rc.student_id = auth.uid()
      and rc.status = 'published'

    order by
        rc.published_at desc nulls last,
        rc.school_year_name_snapshot desc,
        rc.period_name_snapshot;
end;
$$;


-- ============================================================
-- 2. DETAIL D'UN BULLETIN DE L'APPRENANT
-- ============================================================

create or replace function public.get_student_report_card_subjects(
    p_report_card_id uuid
)
returns table (
    report_card_subject_id uuid,
    report_card_id uuid,

    subject_id uuid,
    subject_name text,

    subject_average numeric,
    subject_coefficient numeric,

    assessments_count bigint,
    assessments_coefficient_total numeric,

    teacher_id uuid,
    teacher_name text,
    teacher_comment text,

    sort_order integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'student'
    ) then
        raise exception
            'Accès réservé aux apprenants.'
            using errcode = '42501';
    end if;


    -- Le bulletin demandé doit :
    -- - appartenir à l'apprenant connecté
    -- - être publié.

    if not exists (
        select 1
        from public.report_cards rc
        where rc.id = p_report_card_id
          and rc.student_id = auth.uid()
          and rc.status = 'published'
    ) then
        raise exception
            'Bulletin introuvable ou non accessible.'
            using errcode = '42501';
    end if;


    return query

    select
        rcs.id,
        rcs.report_card_id,

        rcs.subject_id,
        rcs.subject_name_snapshot,

        rcs.subject_average,
        rcs.subject_coefficient,

        rcs.assessments_count,
        rcs.assessments_coefficient_total,

        rcs.teacher_id,
        rcs.teacher_name_snapshot,
        rcs.teacher_comment,

        rcs.sort_order

    from public.report_card_subjects rcs

    join public.report_cards rc
      on rc.id = rcs.report_card_id

    where rcs.report_card_id = p_report_card_id
      and rc.student_id = auth.uid()
      and rc.status = 'published'

    order by
        rcs.sort_order,
        rcs.subject_name_snapshot;
end;
$$;


-- ============================================================
-- 3. BULLETINS PUBLIES DES ENFANTS D'UN PARENT
-- ============================================================
--
-- p_student_id peut être NULL :
--
-- NULL  -> tous les enfants liés
-- UUID  -> uniquement l'enfant demandé
--
-- La validation de la relation parent/enfant repose sur
-- profiles.child_ids, comme le reste de SchoolNet.
--
-- to_jsonb(child_ids) est volontairement utilisé ici afin de
-- rester robuste vis-à-vis du type exact du tableau existant.
--
-- ============================================================

create or replace function public.get_parent_report_cards(
    p_student_id uuid default null
)
returns table (
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

    general_average numeric,

    rank_position bigint,
    ranked_students_count bigint,

    subjects_count bigint,
    subjects_coefficient_total numeric,

    general_comment text,
    decision text,

    published_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Rôle parent obligatoire
    -- --------------------------------------------------------

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'parent'
    ) then
        raise exception
            'Accès réservé aux parents / tuteurs.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Si un enfant est explicitement demandé,
    -- vérifier qu'il appartient bien au parent.
    -- --------------------------------------------------------

    if p_student_id is not null
       and not exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role::text = 'parent'
              and (
                    coalesce(
                        to_jsonb(p.child_ids),
                        '[]'::jsonb
                    )
                    ? p_student_id::text
                  )
       )
    then
        raise exception
            'Cet apprenant n''est pas lié à ce compte parent.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Bulletins publiés uniquement
    -- --------------------------------------------------------

    return query

    select
        rc.id,
        rc.student_id,
        rc.student_name_snapshot,

        rc.class_id,
        rc.class_name_snapshot,

        rc.period_id,
        rc.period_name_snapshot,

        rc.school_year_id,
        rc.school_year_name_snapshot,

        rc.status,

        rc.general_average,

        rc.rank_position,
        rc.ranked_students_count,

        rc.subjects_count,
        rc.subjects_coefficient_total,

        rc.general_comment,
        rc.decision,

        rc.published_at

    from public.report_cards rc

    where rc.status = 'published'

      and exists (
          select 1
          from public.profiles p

          where p.id = auth.uid()
            and p.role::text = 'parent'

            and (
                coalesce(
                    to_jsonb(p.child_ids),
                    '[]'::jsonb
                )
                ? rc.student_id::text
            )
      )

      and (
          p_student_id is null
          or rc.student_id = p_student_id
      )

    order by
        rc.student_name_snapshot,
        rc.published_at desc nulls last,
        rc.school_year_name_snapshot desc,
        rc.period_name_snapshot;
end;
$$;


-- ============================================================
-- 4. DETAIL D'UN BULLETIN COTE PARENT
-- ============================================================

create or replace function public.get_parent_report_card_subjects(
    p_report_card_id uuid
)
returns table (
    report_card_subject_id uuid,
    report_card_id uuid,

    subject_id uuid,
    subject_name text,

    subject_average numeric,
    subject_coefficient numeric,

    assessments_count bigint,
    assessments_coefficient_total numeric,

    teacher_id uuid,
    teacher_name text,
    teacher_comment text,

    sort_order integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    if auth.uid() is null then
        raise exception
            'Authentification requise.'
            using errcode = '42501';
    end if;


    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'parent'
    ) then
        raise exception
            'Accès réservé aux parents / tuteurs.'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Le bulletin doit être :
    --
    -- - publié ;
    -- - celui d'un enfant lié au parent connecté.
    -- --------------------------------------------------------

    if not exists (
        select 1

        from public.report_cards rc

        where rc.id = p_report_card_id
          and rc.status = 'published'

          and exists (
              select 1
              from public.profiles p

              where p.id = auth.uid()
                and p.role::text = 'parent'

                and (
                    coalesce(
                        to_jsonb(p.child_ids),
                        '[]'::jsonb
                    )
                    ? rc.student_id::text
                )
          )
    ) then
        raise exception
            'Bulletin introuvable ou non accessible.'
            using errcode = '42501';
    end if;


    return query

    select
        rcs.id,
        rcs.report_card_id,

        rcs.subject_id,
        rcs.subject_name_snapshot,

        rcs.subject_average,
        rcs.subject_coefficient,

        rcs.assessments_count,
        rcs.assessments_coefficient_total,

        rcs.teacher_id,
        rcs.teacher_name_snapshot,
        rcs.teacher_comment,

        rcs.sort_order

    from public.report_card_subjects rcs

    join public.report_cards rc
      on rc.id = rcs.report_card_id

    where rcs.report_card_id = p_report_card_id
      and rc.status = 'published'

    order by
        rcs.sort_order,
        rcs.subject_name_snapshot;
end;
$$;


-- ============================================================
-- 5. SECURISATION DES EXECUTIONS
-- ============================================================

revoke all
on function public.get_student_report_cards()
from public;

revoke all
on function public.get_student_report_cards()
from anon;


revoke all
on function public.get_student_report_card_subjects(uuid)
from public;

revoke all
on function public.get_student_report_card_subjects(uuid)
from anon;


revoke all
on function public.get_parent_report_cards(uuid)
from public;

revoke all
on function public.get_parent_report_cards(uuid)
from anon;


revoke all
on function public.get_parent_report_card_subjects(uuid)
from public;

revoke all
on function public.get_parent_report_card_subjects(uuid)
from anon;


grant execute
on function public.get_student_report_cards()
to authenticated;

grant execute
on function public.get_student_report_card_subjects(uuid)
to authenticated;

grant execute
on function public.get_parent_report_cards(uuid)
to authenticated;

grant execute
on function public.get_parent_report_card_subjects(uuid)
to authenticated;


-- ============================================================
-- 6. DOCUMENTATION SQL
-- ============================================================

comment on function public.get_student_report_cards()
is
'Retourne uniquement les bulletins publiés de l''apprenant actuellement authentifié.';


comment on function public.get_student_report_card_subjects(uuid)
is
'Retourne le détail par matière d''un bulletin publié appartenant à l''apprenant actuellement authentifié.';


comment on function public.get_parent_report_cards(uuid)
is
'Retourne les bulletins publiés des enfants liés au parent actuellement authentifié via profiles.child_ids.';


comment on function public.get_parent_report_card_subjects(uuid)
is
'Retourne le détail par matière d''un bulletin publié appartenant à un enfant lié au parent actuellement authentifié.';