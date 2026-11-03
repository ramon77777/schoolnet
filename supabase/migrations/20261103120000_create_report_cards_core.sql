-- ============================================================
-- SCHOOLNET
-- Module Bulletins
-- Lot 3.1 - Noyau des bulletins scolaires
-- ============================================================

begin;

-- ============================================================
-- 1. BULLETINS
-- ============================================================

create table if not exists public.report_cards (
    id uuid primary key default gen_random_uuid(),

    student_id uuid not null
        references public.profiles(id),

    class_id uuid not null
        references public.classes(id),

    period_id uuid not null
        references public.grading_periods(id),

    school_year_id uuid not null
        references public.school_years(id),

    -- --------------------------------------------------------
    -- Etat du bulletin
    -- --------------------------------------------------------

    status text not null default 'draft'
        check (
            status in (
                'draft',
                'published'
            )
        ),

    -- --------------------------------------------------------
    -- Snapshots d'identité
    --
    -- Ces valeurs permettent de conserver un bulletin
    -- historiquement stable même si les libellés changent
    -- ultérieurement dans SchoolNet.
    -- --------------------------------------------------------

    student_name_snapshot text,
    class_name_snapshot text,
    period_name_snapshot text,
    school_year_name_snapshot text,

    -- --------------------------------------------------------
    -- Résultats généraux figés
    -- --------------------------------------------------------

    general_average numeric,

    rank_position bigint,

    ranked_students_count bigint,

    subjects_count bigint,

    subjects_coefficient_total numeric,

    -- --------------------------------------------------------
    -- Informations pédagogiques
    -- --------------------------------------------------------

    general_comment text,

    decision text,

    -- --------------------------------------------------------
    -- Cycle de génération / publication
    -- --------------------------------------------------------

    generated_at timestamp with time zone
        not null default now(),

    published_at timestamp with time zone,

    published_by uuid
        references public.profiles(id)
        on delete set null,

    created_at timestamp with time zone
        not null default now(),

    updated_at timestamp with time zone
        not null default now(),

    constraint report_cards_student_period_unique
        unique (
            student_id,
            period_id
        ),

    constraint report_cards_publication_consistency
        check (
            status = 'draft'
            or (
                status = 'published'
                and published_at is not null
            )
        )
);


-- ============================================================
-- 2. LIGNES MATIERES DU BULLETIN
-- ============================================================

create table if not exists public.report_card_subjects (
    id uuid primary key default gen_random_uuid(),

    report_card_id uuid not null
        references public.report_cards(id)
        on delete cascade,

    -- student_subject_averages expose déjà subject_id en UUID.
    --
    -- Nous conservons volontairement ici l'identifiant comme
    -- UUID sans imposer encore de FK vers une table métier :
    -- la source officielle sera raccordée dans le Lot 3.2.
    subject_id uuid not null,

    -- --------------------------------------------------------
    -- Snapshot matière
    -- --------------------------------------------------------

    subject_name_snapshot text not null,

    subject_average numeric,

    subject_coefficient numeric
        not null default 1,

    assessments_count bigint,

    assessments_coefficient_total numeric,

    -- --------------------------------------------------------
    -- Enseignant / appréciation
    -- --------------------------------------------------------

    teacher_id uuid
        references public.profiles(id)
        on delete set null,

    teacher_name_snapshot text,

    teacher_comment text,

    -- --------------------------------------------------------
    -- Présentation du bulletin
    -- --------------------------------------------------------

    sort_order integer
        not null default 0,

    created_at timestamp with time zone
        not null default now(),

    updated_at timestamp with time zone
        not null default now(),

    constraint report_card_subjects_unique_subject
        unique (
            report_card_id,
            subject_id
        )
);


-- ============================================================
-- 3. INDEX
-- ============================================================

create index if not exists
    report_cards_student_idx
on public.report_cards (
    student_id
);


create index if not exists
    report_cards_class_period_idx
on public.report_cards (
    class_id,
    period_id
);


create index if not exists
    report_cards_period_status_idx
on public.report_cards (
    period_id,
    status
);


create index if not exists
    report_cards_school_year_idx
on public.report_cards (
    school_year_id
);


create index if not exists
    report_card_subjects_report_card_idx
on public.report_card_subjects (
    report_card_id
);


create index if not exists
    report_card_subjects_subject_idx
on public.report_card_subjects (
    subject_id
);


create index if not exists
    report_card_subjects_teacher_idx
on public.report_card_subjects (
    teacher_id
);


-- ============================================================
-- 4. UPDATED_AT
-- ============================================================

create or replace function
public.set_report_card_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();

    return new;
end;
$$;


drop trigger if exists
    trg_report_cards_updated_at
on public.report_cards;


create trigger
    trg_report_cards_updated_at
before update
on public.report_cards
for each row
execute function
    public.set_report_card_updated_at();


drop trigger if exists
    trg_report_card_subjects_updated_at
on public.report_card_subjects;


create trigger
    trg_report_card_subjects_updated_at
before update
on public.report_card_subjects
for each row
execute function
    public.set_report_card_updated_at();


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

alter table public.report_cards
enable row level security;


alter table public.report_card_subjects
enable row level security;


-- ============================================================
-- 6. DROITS SQL
-- ============================================================

grant
    select,
    insert,
    update,
    delete
on public.report_cards
to authenticated;


grant
    select,
    insert,
    update,
    delete
on public.report_card_subjects
to authenticated;


-- ============================================================
-- 7. POLITIQUE ADMIN - BULLETINS
--
-- Les accès élève / parent / enseignant seront ajoutés
-- progressivement dans les Lots 3.2 à 3.4.
-- ============================================================

drop policy if exists
    "report_cards_admin_all"
on public.report_cards;


create policy
    "report_cards_admin_all"
on public.report_cards
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'admin'
    )
);


-- ============================================================
-- 8. POLITIQUE ADMIN - MATIERES
-- ============================================================

drop policy if exists
    "report_card_subjects_admin_all"
on public.report_card_subjects;


create policy
    "report_card_subjects_admin_all"
on public.report_card_subjects
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text = 'admin'
    )
);


commit;