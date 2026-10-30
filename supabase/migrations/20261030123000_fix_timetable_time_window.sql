-- ============================================================
-- SCHOOLNET
-- LOT 2 - EMPLOI DU TEMPS
-- Correctif : génération sûre de time_window
--
-- Objectif :
-- permettre au CHECK ends_at > starts_at de traiter proprement
-- les horaires invalides avant utilisation par les contraintes
-- d'exclusion GiST.
-- ============================================================

begin;


-- ============================================================
-- 1. RETRAIT TEMPORAIRE DES CONTRAINTES DEPENDANTES
-- ============================================================

alter table public.timetable_slots
  drop constraint if exists timetable_slots_no_class_overlap;

alter table public.timetable_slots
  drop constraint if exists timetable_slots_no_teacher_overlap;

alter table public.timetable_slots
  drop constraint if exists timetable_slots_no_room_overlap;


-- ============================================================
-- 2. RECONSTRUCTION DE time_window
-- ============================================================

alter table public.timetable_slots
  drop column if exists time_window;


alter table public.timetable_slots
  add column time_window tsrange
  generated always as (
    case
      when ends_at > starts_at then
        tsrange(
          date '2000-01-01' + starts_at,
          date '2000-01-01' + ends_at,
          '[)'
        )

      else
        'empty'::tsrange
    end
  ) stored;


-- ============================================================
-- 3. RESTAURATION DES PROTECTIONS ANTI-CHEVAUCHEMENT
-- ============================================================

alter table public.timetable_slots
  add constraint timetable_slots_no_class_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    class_id with =,
    time_window with &&
  )
  where (is_active);


alter table public.timetable_slots
  add constraint timetable_slots_no_teacher_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    teacher_id with =,
    time_window with &&
  )
  where (is_active);


alter table public.timetable_slots
  add constraint timetable_slots_no_room_overlap
  exclude using gist (
    school_year_id with =,
    day_of_week with =,
    room_id with =,
    time_window with &&
  )
  where (
    is_active
    and room_id is not null
  );


commit;