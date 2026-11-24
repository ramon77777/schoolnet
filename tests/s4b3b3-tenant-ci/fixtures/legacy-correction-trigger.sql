-- Simule le declencheur V1 de publication (avant B.3) pour les tests PG.
-- Le SQL B.3 reproduit la fonction historique reelle avec un garde officiel.
CREATE TABLE IF NOT EXISTS public.parent_links(
 parent_id uuid REFERENCES public.profiles(id),
 student_id uuid REFERENCES public.profiles(id)
);
CREATE OR REPLACE FUNCTION public.notify_assessment_correction_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $v1$
BEGIN
 IF NEW.status::text='published' THEN
 INSERT INTO public.notifications(
  user_id,title,body,type,is_read,event_key,related_id,action_url)
 VALUES(NEW.student_id,'Correction disponible','V1 correction',
  'success',false,'correction_published',NEW.id,
  '/app/student/assessments/'||NEW.assessment_id::text||'/result')
 ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $v1$;
CREATE TRIGGER trg_notify_assessment_correction_published
AFTER INSERT OR UPDATE OF status ON public.assessment_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_assessment_correction_published();
