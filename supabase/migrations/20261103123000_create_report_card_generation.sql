-- ============================================================
-- SCHOOLNET
-- LOT 3.2 - GENERATION AUTOMATIQUE DES BULLETINS
-- ============================================================
--
-- Sources officielles :
--   student_subject_averages
--   student_period_averages
--   student_period_rankings
--
-- Le bulletin est un SNAPSHOT.
-- Les moyennes ne sont PAS recalculées ici.
--
-- ============================================================


-- ============================================================
-- 1. GENERATION D'UN BULLETIN POUR UN ELEVE / UNE PERIODE
-- ============================================================

create or replace function public.generate_report_card(
    p_student_id uuid,
    p_period_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_id uuid := auth.uid();

    v_report_card_id uuid;
    v_existing_status text;

    v_class_id uuid;
    v_school_year_id uuid;

    v_student_name text;
    v_class_name text;
    v_period_name text;
    v_school_year_name text;

    v_general_average numeric;
    v_subjects_count bigint;
    v_subjects_coefficient_total numeric;

    v_rank_position bigint;
    v_ranked_students_count bigint;
begin

    -- ========================================================
    -- SECURITE
    -- Seul un administrateur SchoolNet peut générer un bulletin.
    -- ========================================================

    if
        v_actor_id is null
        or not exists (
            select 1
            from public.profiles p
            where p.id = v_actor_id
              and p.role::text = 'admin'
        )
    then
        raise exception
            'Seul un administrateur peut générer un bulletin.'
            using errcode = '42501';
    end if;


    -- ========================================================
    -- MOYENNE GENERALE + CLASSEMENT
    -- ========================================================

    select
        spr.class_id,
        spa.general_average,
        spa.subjects_count::bigint,
        spa.subjects_coefficient_total,
        spr.rank_position::bigint,
        spr.ranked_students_count::bigint
    into
        v_class_id,
        v_general_average,
        v_subjects_count,
        v_subjects_coefficient_total,
        v_rank_position,
        v_ranked_students_count
    from public.student_period_averages spa
    join public.student_period_rankings spr
      on spr.student_id = spa.student_id
     and spr.period_id = spa.period_id
    where spa.student_id = p_student_id
      and spa.period_id = p_period_id
    limit 1;

    if not found then
        raise exception
            'Aucune moyenne générale ou aucun classement disponible pour cet élève et cette période.';
    end if;

    if v_class_id is null then
        raise exception
            'Impossible de déterminer la classe de l''élève pour cette période.';
    end if;

    if coalesce(v_subjects_count, 0) = 0 then
        raise exception
            'Aucune moyenne de matière n''est disponible pour générer ce bulletin.';
    end if;


    -- ========================================================
    -- PERIODE + ANNEE SCOLAIRE
    -- ========================================================

    select
        gp.school_year_id,
        gp.name,
        sy.name
    into
        v_school_year_id,
        v_period_name,
        v_school_year_name
    from public.grading_periods gp
    join public.school_years sy
      on sy.id = gp.school_year_id
    where gp.id = p_period_id;

    if not found then
        raise exception
            'La période scolaire demandée est introuvable.';
    end if;


    -- ========================================================
    -- IDENTITE ELEVE
    -- ========================================================

    select p.full_name
    into v_student_name
    from public.profiles p
    where p.id = p_student_id;

    if
        not found
        or v_student_name is null
        or btrim(v_student_name) = ''
    then
        raise exception
            'Le profil de l''élève est introuvable ou incomplet.';
    end if;


    -- ========================================================
    -- CLASSE
    -- ========================================================

    select c.name
    into v_class_name
    from public.classes c
    where c.id = v_class_id;

    if
        not found
        or v_class_name is null
        or btrim(v_class_name) = ''
    then
        raise exception
            'La classe associée au bulletin est introuvable.';
    end if;


    -- ========================================================
    -- PROTECTION D'UN BULLETIN DEJA PUBLIE
    -- ========================================================

    select
        rc.id,
        rc.status
    into
        v_report_card_id,
        v_existing_status
    from public.report_cards rc
    where rc.student_id = p_student_id
      and rc.period_id = p_period_id
    limit 1;

    if
        found
        and v_existing_status = 'published'
    then
        raise exception
            'Ce bulletin est déjà publié et ne peut plus être régénéré.';
    end if;


    -- ========================================================
    -- ENTETE DU BULLETIN
    -- ========================================================
    --
    -- La contrainte UNIQUE (student_id, period_id)
    -- garantit qu'un élève ne possède qu'un bulletin
    -- par période.
    --
    -- Les appréciations déjà saisies ne sont pas écrasées.
    -- ========================================================

    insert into public.report_cards (
        student_id,
        class_id,
        period_id,
        school_year_id,
        status,

        student_name_snapshot,
        class_name_snapshot,
        period_name_snapshot,
        school_year_name_snapshot,

        general_average,
        rank_position,
        ranked_students_count,
        subjects_count,
        subjects_coefficient_total,

        generated_at,
        created_at,
        updated_at
    )
    values (
        p_student_id,
        v_class_id,
        p_period_id,
        v_school_year_id,
        'draft',

        v_student_name,
        v_class_name,
        v_period_name,
        v_school_year_name,

        v_general_average,
        v_rank_position,
        v_ranked_students_count,
        v_subjects_count,
        v_subjects_coefficient_total,

        now(),
        now(),
        now()
    )
    on conflict (
        student_id,
        period_id
    )
    do update
    set
        class_id =
            excluded.class_id,

        school_year_id =
            excluded.school_year_id,

        student_name_snapshot =
            excluded.student_name_snapshot,

        class_name_snapshot =
            excluded.class_name_snapshot,

        period_name_snapshot =
            excluded.period_name_snapshot,

        school_year_name_snapshot =
            excluded.school_year_name_snapshot,

        general_average =
            excluded.general_average,

        rank_position =
            excluded.rank_position,

        ranked_students_count =
            excluded.ranked_students_count,

        subjects_count =
            excluded.subjects_count,

        subjects_coefficient_total =
            excluded.subjects_coefficient_total,

        generated_at =
            excluded.generated_at,

        updated_at =
            now()

    returning id
    into v_report_card_id;


    -- ========================================================
    -- DETAIL PAR MATIERE
    -- ========================================================
    --
    -- Moyenne :
    --   student_subject_averages
    --
    -- Coefficient matière :
    --   class_subject_settings
    --
    -- Matière :
    --   academic_subjects
    --
    -- Enseignant :
    --   course_subjects
    --   courses
    --   course_teachers
    --
    -- ========================================================

    with subject_source as (
        select
            ssa.subject_id,

            subject.name
                as subject_name_snapshot,

            ssa.subject_average,

            coalesce(
                css.coefficient,
                1
            )::numeric
                as subject_coefficient,

            ssa.assessments_count::bigint,

            ssa.assessments_coefficient_total,

            teacher_choice.teacher_id,

            teacher_profile.full_name
                as teacher_name_snapshot,

            subject.sort_order

        from public.student_subject_averages ssa

        join public.academic_subjects subject
          on subject.id = ssa.subject_id

        left join public.class_subject_settings css
          on css.class_id = v_class_id
         and css.subject_id = ssa.subject_id
         and css.is_active = true

        -- ----------------------------------------------------
        -- Recherche de l'enseignant de la matière.
        --
        -- Priorité :
        --   1. enseignant explicitement affecté au cours
        --   2. enseignant ayant créé le cours
        -- ----------------------------------------------------

        left join lateral (

            select candidate.teacher_id

            from (

                select
                    ct.teacher_id,
                    0 as priority,
                    c.updated_at

                from public.courses c

                join public.course_subjects cs
                  on cs.course_id = c.id

                join public.course_teachers ct
                  on ct.course_id = c.id

                join public.profiles teacher_profile_check
                  on teacher_profile_check.id =
                     ct.teacher_id
                 and teacher_profile_check.role::text =
                     'teacher'

                where c.class_id = v_class_id
                  and cs.subject_id =
                      ssa.subject_id
                  and c.status::text = 'active'


                union all


                select
                    c.created_by as teacher_id,
                    1 as priority,
                    c.updated_at

                from public.courses c

                join public.course_subjects cs
                  on cs.course_id = c.id

                join public.profiles creator_profile
                  on creator_profile.id =
                     c.created_by
                 and creator_profile.role::text =
                     'teacher'

                where c.class_id = v_class_id
                  and cs.subject_id =
                      ssa.subject_id
                  and c.status::text = 'active'

            ) candidate

            order by
                candidate.priority,
                candidate.updated_at desc nulls last,
                candidate.teacher_id

            limit 1

        ) teacher_choice
          on true

        left join public.profiles teacher_profile
          on teacher_profile.id =
             teacher_choice.teacher_id

        where ssa.student_id = p_student_id
          and ssa.period_id = p_period_id
    )

    insert into public.report_card_subjects (
        report_card_id,
        subject_id,

        subject_name_snapshot,
        subject_average,
        subject_coefficient,

        assessments_count,
        assessments_coefficient_total,

        teacher_id,
        teacher_name_snapshot,

        sort_order,

        created_at,
        updated_at
    )

    select
        v_report_card_id,
        source.subject_id,

        source.subject_name_snapshot,
        source.subject_average,
        source.subject_coefficient,

        source.assessments_count,
        source.assessments_coefficient_total,

        source.teacher_id,
        source.teacher_name_snapshot,

        source.sort_order,

        now(),
        now()

    from subject_source source

    on conflict (
        report_card_id,
        subject_id
    )
    do update
    set
        subject_name_snapshot =
            excluded.subject_name_snapshot,

        subject_average =
            excluded.subject_average,

        subject_coefficient =
            excluded.subject_coefficient,

        assessments_count =
            excluded.assessments_count,

        assessments_coefficient_total =
            excluded.assessments_coefficient_total,

        teacher_id =
            excluded.teacher_id,

        teacher_name_snapshot =
            excluded.teacher_name_snapshot,

        sort_order =
            excluded.sort_order,

        updated_at =
            now();


    -- ========================================================
    -- SUPPRESSION DES ANCIENNES LIGNES DEVENUES OBSOLETES
    -- ========================================================

    delete from public.report_card_subjects rcs

    where rcs.report_card_id =
          v_report_card_id

      and not exists (

          select 1

          from public.student_subject_averages ssa

          where ssa.student_id =
                p_student_id

            and ssa.period_id =
                p_period_id

            and ssa.subject_id =
                rcs.subject_id
      );


    -- ========================================================
    -- RESULTAT
    -- ========================================================

    return v_report_card_id;
end;
$$;


-- ============================================================
-- 2. GENERATION EN MASSE POUR UNE CLASSE / PERIODE
-- ============================================================

create or replace function public.generate_report_cards_for_class(
    p_class_id uuid,
    p_period_id uuid
)
returns table (
    student_id uuid,
    report_card_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_actor_id uuid := auth.uid();
    v_student_id uuid;
begin

    -- ========================================================
    -- SECURITE
    -- ========================================================

    if
        v_actor_id is null
        or not exists (
            select 1
            from public.profiles p
            where p.id = v_actor_id
              and p.role::text = 'admin'
        )
    then
        raise exception
            'Seul un administrateur peut générer les bulletins.'
            using errcode = '42501';
    end if;


    -- ========================================================
    -- GENERATION
    -- ========================================================
    --
    -- On utilise student_period_rankings comme source de
    -- rattachement élève / classe / période.
    --
    -- Les bulletins déjà publiés sont laissés intacts.
    -- ========================================================

    for v_student_id in

        select distinct
            spr.student_id

        from public.student_period_rankings spr

        where spr.class_id = p_class_id
          and spr.period_id = p_period_id

          and not exists (
              select 1
              from public.report_cards rc
              where rc.student_id =
                    spr.student_id
                and rc.period_id =
                    p_period_id
                and rc.status =
                    'published'
          )

        order by spr.student_id

    loop

        student_id :=
            v_student_id;

        report_card_id :=
            public.generate_report_card(
                v_student_id,
                p_period_id
            );

        return next;

    end loop;

end;
$$;


-- ============================================================
-- 3. DROITS D'EXECUTION
-- ============================================================

revoke all
on function public.generate_report_card(uuid, uuid)
from public;

revoke all
on function public.generate_report_card(uuid, uuid)
from anon;

grant execute
on function public.generate_report_card(uuid, uuid)
to authenticated;


revoke all
on function public.generate_report_cards_for_class(uuid, uuid)
from public;

revoke all
on function public.generate_report_cards_for_class(uuid, uuid)
from anon;

grant execute
on function public.generate_report_cards_for_class(uuid, uuid)
to authenticated;


-- ============================================================
-- 4. DOCUMENTATION SQL
-- ============================================================

comment on function public.generate_report_card(uuid, uuid)
is
'Génère ou régénère le bulletin brouillon d''un élève pour une période à partir des vues officielles de moyennes et de classement SchoolNet. Les bulletins publiés sont protégés.';


comment on function public.generate_report_cards_for_class(uuid, uuid)
is
'Génère les bulletins brouillons des élèves classés d''une classe pour une période. Les bulletins déjà publiés sont ignorés.';