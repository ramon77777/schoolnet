-- ============================================================
-- SCHOOLNET
-- Module Bulletins
-- Lot 3.4 - Workflow administration
-- ============================================================

begin;


-- ============================================================
-- 1. LISTE DES BULLETINS POUR L'ADMINISTRATION
-- ============================================================

create or replace function public.get_admin_report_cards(
    p_school_year_id uuid default null,
    p_class_id uuid default null,
    p_period_id uuid default null,
    p_status text default null
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

    teacher_subjects_count bigint,
    teacher_comments_count bigint,

    general_comment text,
    decision text,

    generated_at timestamptz,
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

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'admin'
    ) then
        raise exception
            'Accès réservé à l''administration.'
            using errcode = '42501';
    end if;

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

        count(rcs.id)
            filter (
                where rcs.teacher_id is not null
            )::bigint,

        count(rcs.id)
            filter (
                where rcs.teacher_id is not null
                  and nullif(
                      btrim(
                          coalesce(
                              rcs.teacher_comment,
                              ''
                          )
                      ),
                      ''
                  ) is not null
            )::bigint,

        rc.general_comment,
        rc.decision,

        rc.generated_at,
        rc.published_at

    from public.report_cards rc

    left join public.report_card_subjects rcs
      on rcs.report_card_id = rc.id

    where (
        p_school_year_id is null
        or rc.school_year_id = p_school_year_id
    )

      and (
        p_class_id is null
        or rc.class_id = p_class_id
      )

      and (
        p_period_id is null
        or rc.period_id = p_period_id
      )

      and (
        p_status is null
        or rc.status = p_status
      )

    group by
        rc.id

    order by
        rc.school_year_name_snapshot desc,
        rc.period_name_snapshot,
        rc.class_name_snapshot,
        rc.student_name_snapshot;

end;
$$;


-- ============================================================
-- 2. DETAIL DES MATIERES D'UN BULLETIN
-- ============================================================

create or replace function public.get_admin_report_card_subjects(
    p_report_card_id uuid
)
returns table (
    report_card_subject_id uuid,

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
          and p.role::text = 'admin'
    ) then
        raise exception
            'Accès réservé à l''administration.'
            using errcode = '42501';
    end if;

    return query

    select
        rcs.id,

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

    where rcs.report_card_id =
          p_report_card_id

    order by
        rcs.sort_order,
        rcs.subject_name_snapshot;

end;
$$;


-- ============================================================
-- 3. APPRECIATION GENERALE + DECISION
-- ============================================================

create or replace function public.update_admin_report_card_review(
    p_report_card_id uuid,
    p_general_comment text,
    p_decision text
)
returns table (
    report_card_id uuid,
    general_comment text,
    decision text,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_general_comment text;
    v_decision text;
    v_updated_at timestamptz;
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
          and p.role::text = 'admin'
    ) then
        raise exception
            'Accès réservé à l''administration.'
            using errcode = '42501';
    end if;

    update public.report_cards rc

    set
        general_comment =
            nullif(
                btrim(
                    coalesce(
                        p_general_comment,
                        ''
                    )
                ),
                ''
            ),

        decision =
            nullif(
                btrim(
                    coalesce(
                        p_decision,
                        ''
                    )
                ),
                ''
            ),

        updated_at = now()

    where rc.id = p_report_card_id
      and rc.status = 'draft'

    returning
        rc.id,
        rc.general_comment,
        rc.decision,
        rc.updated_at

    into
        v_id,
        v_general_comment,
        v_decision,
        v_updated_at;

    if v_id is null then
        raise exception
            'Ce bulletin est introuvable ou a déjà été publié.'
            using errcode = '42501';
    end if;

    return query
    select
        v_id,
        v_general_comment,
        v_decision,
        v_updated_at;

end;
$$;


-- ============================================================
-- 4. PUBLICATION DEFINITIVE
-- ============================================================

create or replace function public.publish_admin_report_card(
    p_report_card_id uuid
)
returns table (
    report_card_id uuid,
    report_card_status text,
    published_at timestamptz,
    published_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_status text;
    v_published_at timestamptz;
    v_published_by uuid;
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
          and p.role::text = 'admin'
    ) then
        raise exception
            'Accès réservé à l''administration.'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.report_card_subjects rcs
        where rcs.report_card_id =
              p_report_card_id
    ) then
        raise exception
            'Impossible de publier un bulletin sans matière.';
    end if;

    update public.report_cards rc

    set
        status = 'published',
        published_at = now(),
        published_by = auth.uid(),
        updated_at = now()

    where rc.id = p_report_card_id
      and rc.status = 'draft'

    returning
        rc.id,
        rc.status,
        rc.published_at,
        rc.published_by

    into
        v_id,
        v_status,
        v_published_at,
        v_published_by;

    if v_id is null then
        raise exception
            'Ce bulletin est introuvable ou a déjà été publié.'
            using errcode = '42501';
    end if;

    return query
    select
        v_id,
        v_status,
        v_published_at,
        v_published_by;

end;
$$;


-- ============================================================
-- 5. DROITS D'EXECUTION
-- ============================================================

revoke all
on function public.get_admin_report_cards(
    uuid,
    uuid,
    uuid,
    text
)
from public;

revoke all
on function public.get_admin_report_cards(
    uuid,
    uuid,
    uuid,
    text
)
from anon;


revoke all
on function public.get_admin_report_card_subjects(uuid)
from public;

revoke all
on function public.get_admin_report_card_subjects(uuid)
from anon;


revoke all
on function public.update_admin_report_card_review(
    uuid,
    text,
    text
)
from public;

revoke all
on function public.update_admin_report_card_review(
    uuid,
    text,
    text
)
from anon;


revoke all
on function public.publish_admin_report_card(uuid)
from public;

revoke all
on function public.publish_admin_report_card(uuid)
from anon;


grant execute
on function public.get_admin_report_cards(
    uuid,
    uuid,
    uuid,
    text
)
to authenticated;


grant execute
on function public.get_admin_report_card_subjects(uuid)
to authenticated;


grant execute
on function public.update_admin_report_card_review(
    uuid,
    text,
    text
)
to authenticated;


grant execute
on function public.publish_admin_report_card(uuid)
to authenticated;


commit;