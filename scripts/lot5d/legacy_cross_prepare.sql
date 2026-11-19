-- LOT 5D-E | Historical snapshots + explicit source decision in PG17 fixture.
-- Synthetic parent, report card, school document; never real user data.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);

CREATE TABLE public.parent_links (
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  relation_type text NOT NULL DEFAULT 'parent',
  PRIMARY KEY (parent_id,student_id)
);
CREATE TABLE public.report_cards (
  id uuid PRIMARY KEY,student_id uuid NOT NULL REFERENCES public.profiles(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  school_year_id uuid NOT NULL REFERENCES public.school_years(id),
  status text NOT NULL DEFAULT 'published'
);
CREATE TABLE public.student_enrollment_documents (
  id uuid PRIMARY KEY,enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id),
  object_key text NOT NULL
);
CREATE TABLE public.fixture_5de_history_snapshot (
  kind text PRIMARY KEY,
  digest text NOT NULL
);

INSERT INTO public.profiles(id,role,full_name,child_ids) VALUES (
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','parent','Parent fictif',
 ARRAY['11111111-1111-4111-8111-111111111111']::uuid[]
);
INSERT INTO public.parent_links(parent_id,student_id) VALUES (
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111'
);
INSERT INTO public.report_cards(id,student_id,class_id,school_year_id) VALUES (
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '11111111-1111-4111-8111-111111111111',
 'c0250000-0000-4000-8000-000000000025',
 '20252025-2025-4025-8025-202520252025'
);
INSERT INTO public.student_enrollment_documents(id,enrollment_id,object_key)
SELECT 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',e.id,'fixture://schoolnet/old-proof'
FROM public.student_enrollments e
WHERE e.student_id='11111111-1111-4111-8111-111111111111'
  AND e.school_year_id='20252025-2025-4025-8025-202520252025';

INSERT INTO public.fixture_5de_history_snapshot(kind,digest) VALUES
 ('parents',(SELECT md5(string_agg(parent_id::text||student_id::text,','
      ORDER BY parent_id::text)) FROM public.parent_links)),
 ('bulletins',(SELECT md5(string_agg(id::text||student_id::text||class_id::text||
      school_year_id::text||status,',' ORDER BY id::text)) FROM public.report_cards)),
 ('documents',(SELECT md5(string_agg(id::text||enrollment_id::text||object_key,','
      ORDER BY id::text)) FROM public.student_enrollment_documents)),
 ('legacy_class',(SELECT md5(string_agg(class_id::text||student_id::text,','
      ORDER BY class_id::text)) FROM public.class_students
      WHERE class_id='c0250000-0000-4000-8000-000000000025')),
 ('parent_child_ids',(SELECT md5(child_ids::text) FROM public.profiles
      WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));

SELECT schoolnet_private.save_lot5d_legacy_decision(
 '20252025-2025-4025-8025-202520252025',
 '20262026-2026-4026-8026-202620262026',
 '11111111-1111-4111-8111-111111111111',
 'repeat','c0260000-0000-4000-8000-000000000026',
 'Recette fictive 5D-E', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
COMMIT;
\echo '5D-E: fictional history snapshots and decision saved'
