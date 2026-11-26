-- SCHOOLNET V2: 100% FICTITIOUS PostgreSQL 17 restoration fixture.
-- Never install on Supabase principal. No auth.users, no grades of real children.
CREATE SCHEMA schoolnet_rehearsal;

CREATE TABLE schoolnet_rehearsal.students (
  student_id uuid PRIMARY KEY,
  school_id uuid NOT NULL,
  display_name text NOT NULL,
  average_on20 numeric(5,2),
  state text NOT NULL CHECK (state IN ('ready','incomplete'))
);
ALTER TABLE schoolnet_rehearsal.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_rehearsal.students FORCE ROW LEVEL SECURITY;

CREATE TABLE schoolnet_rehearsal.mock_auth_accounts (
  account_id uuid PRIMARY KEY,
  school_id uuid NOT NULL,
  mock_role text NOT NULL,
  email text NOT NULL
);
ALTER TABLE schoolnet_rehearsal.mock_auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_rehearsal.mock_auth_accounts FORCE ROW LEVEL SECURITY;

CREATE TABLE schoolnet_rehearsal.mock_storage_metadata (
  object_id uuid PRIMARY KEY,
  school_id uuid NOT NULL,
  object_path text NOT NULL UNIQUE,
  bytes_sha256 text NOT NULL CHECK (bytes_sha256 ~ '^[a-f0-9]{64}$')
);
ALTER TABLE schoolnet_rehearsal.mock_storage_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_rehearsal.mock_storage_metadata FORCE ROW LEVEL SECURITY;

CREATE POLICY rehearsal_students_a ON schoolnet_rehearsal.students FOR SELECT
 TO schoolnet_rehearsal_a
 USING (school_id = '00000000-0000-4000-8000-000000000010');
CREATE POLICY rehearsal_students_b ON schoolnet_rehearsal.students FOR SELECT
 TO schoolnet_rehearsal_b
 USING (school_id = '00000000-0000-4000-8000-000000000011');
CREATE POLICY rehearsal_auth_a ON schoolnet_rehearsal.mock_auth_accounts FOR SELECT
 TO schoolnet_rehearsal_a
 USING (school_id = '00000000-0000-4000-8000-000000000010');
CREATE POLICY rehearsal_auth_b ON schoolnet_rehearsal.mock_auth_accounts FOR SELECT
 TO schoolnet_rehearsal_b
 USING (school_id = '00000000-0000-4000-8000-000000000011');
CREATE POLICY rehearsal_storage_a ON schoolnet_rehearsal.mock_storage_metadata FOR SELECT
 TO schoolnet_rehearsal_a
 USING (school_id = '00000000-0000-4000-8000-000000000010');
CREATE POLICY rehearsal_storage_b ON schoolnet_rehearsal.mock_storage_metadata FOR SELECT
 TO schoolnet_rehearsal_b
 USING (school_id = '00000000-0000-4000-8000-000000000011');

GRANT USAGE ON SCHEMA schoolnet_rehearsal
 TO schoolnet_rehearsal_a,schoolnet_rehearsal_b,schoolnet_rehearsal_guest;
GRANT SELECT ON ALL TABLES IN SCHEMA schoolnet_rehearsal
 TO schoolnet_rehearsal_a,schoolnet_rehearsal_b;

INSERT INTO schoolnet_rehearsal.students VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000010','Élève fictif 001',17.25,'ready'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000010','Élève fictif 002',0.00,'ready'),
 ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000010','Élève fictif 003',NULL,'incomplete'),
 ('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000011','Élève fictif 004',14.50,'ready'),
 ('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000011','Élève fictif 005',12.00,'ready');

INSERT INTO schoolnet_rehearsal.mock_auth_accounts VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000010','school_admin','synthetic-admin-a@example.test'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000010','teacher','synthetic-teacher-a@example.test'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000011','school_admin','synthetic-admin-b@example.test'),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000011','teacher','synthetic-teacher-b@example.test');
-- Storage metadata rows are inserted by the CI script after hashing
-- synthetic blob bytes. A DB dump alone does not contain those bytes.
