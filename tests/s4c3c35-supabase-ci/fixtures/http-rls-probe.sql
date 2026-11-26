-- C3-C.3.5.1: dummy-only RLS canary. In ephemeral GitHub Actions Supabase ONLY.
-- Intentionally separate from the official SCHOOLNET curriculum SQL.
CREATE TABLE public.schoolnet_c35_http_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 label text NOT NULL
);
ALTER TABLE public.schoolnet_c35_http_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_c35_http_probe FORCE ROW LEVEL SECURITY;
CREATE POLICY schoolnet_c35_read_own ON public.schoolnet_c35_http_probe
 FOR SELECT TO authenticated
 USING (owner_id = (SELECT auth.uid()));
REVOKE ALL ON public.schoolnet_c35_http_probe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.schoolnet_c35_http_probe TO authenticated;
GRANT ALL ON public.schoolnet_c35_http_probe TO service_role;
NOTIFY pgrst, 'reload schema';
