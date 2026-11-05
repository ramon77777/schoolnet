-- SCHOOLNET - Public applications (student or parent access)
-- Additive migration. Existing requests and their history are preserved.
-- Run ONLY after 20261104140000_public_enrollment_requests.sql.

begin;

alter table public.public_enrollment_requests
  add column if not exists request_type text not null default 'student_enrollment';

alter table public.public_enrollment_requests
  add column if not exists student_email text;

-- Parent-only applications may not know the learner's gender or current level.
alter table public.public_enrollment_requests
  alter column student_gender drop not null;
alter table public.public_enrollment_requests
  alter column requested_level drop not null;

do $sql$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_enrollment_requests'::regclass
      and conname = 'public_enrollment_request_type_valid'
  ) then
    alter table public.public_enrollment_requests
      add constraint public_enrollment_request_type_valid
      check (
        request_type in ('student_enrollment', 'parent_access')
        and (
          request_type = 'parent_access'
          or (student_gender in ('male', 'female')
              and requested_level is not null
              and char_length(btrim(requested_level)) between 2 and 80)
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_enrollment_requests'::regclass
      and conname = 'public_enrollment_student_email_valid'
  ) then
    alter table public.public_enrollment_requests
      add constraint public_enrollment_student_email_valid
      check (
        student_email is null or (
          char_length(student_email) <= 254
          and student_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        )
      );
  end if;
end;
$sql$;

-- Preserve historic demo requests with a missing e-mail, but make it
-- impossible to INSERT a *new* request without a valid guardian e-mail.
-- A BEFORE INSERT trigger does not affect administrative reviews of old rows.
create or replace function public.validate_public_enrollment_request_email()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.guardian_email is null
     or char_length(btrim(new.guardian_email)) = 0
     or char_length(new.guardian_email) > 254
     or new.guardian_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'Une adresse e-mail valide du parent ou tuteur est obligatoire.'
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.validate_public_enrollment_request_email()
  from public, anon, authenticated;

drop trigger if exists validate_public_enrollment_request_email_before_insert
  on public.public_enrollment_requests;
create trigger validate_public_enrollment_request_email_before_insert
  before insert on public.public_enrollment_requests
  for each row
  execute function public.validate_public_enrollment_request_email();

comment on column public.public_enrollment_requests.request_type
  is 'student_enrollment = learner admission; parent_access = request for a parent/tutor account linked after admin verification.';
comment on column public.public_enrollment_requests.student_email
  is 'Optional personal learner email, for use only if an independently authenticated learner account is created.';

commit;
