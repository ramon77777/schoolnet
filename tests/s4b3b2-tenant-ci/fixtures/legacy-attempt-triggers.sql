-- S4-B.3-B.2 / fixture LOCALE JETABLE UNIQUEMENT.
-- Reproduit deux triggers V1 verifies sur Supabase principal avant leur
-- durcissement par B.2, sans contacter de serveur heberge.
CREATE TABLE public.s4b3b2_progress_probe(
  student_id uuid,course_id uuid
);
GRANT SELECT ON public.s4b3b2_progress_probe TO authenticated;
CREATE OR REPLACE FUNCTION public.refresh_student_progress(
 p_student_id uuid,p_course_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $probe$
BEGIN
 INSERT INTO public.s4b3b2_progress_probe(student_id,course_id)
 VALUES(p_student_id,p_course_id);
END;
$probe$;
CREATE OR REPLACE FUNCTION public.trigger_refresh_progress_from_assessment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $old$
DECLARE v_assessment_id uuid;v_course_id uuid;v_student_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN
   v_assessment_id:=OLD.assessment_id;v_student_id:=OLD.student_id;
 ELSE v_assessment_id:=NEW.assessment_id;v_student_id:=NEW.student_id; END IF;
 SELECT course_id INTO v_course_id FROM public.assessments
 WHERE id=v_assessment_id;
 IF v_course_id IS NOT NULL THEN
  PERFORM public.refresh_student_progress(v_student_id,v_course_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$old$;
CREATE TRIGGER trg_refresh_progress_assessment_submission
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_submissions
FOR EACH ROW EXECUTE FUNCTION public.trigger_refresh_progress_from_assessment_submission();

CREATE TABLE IF NOT EXISTS public.course_teachers (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 teacher_id uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE OR REPLACE FUNCTION schoolnet_private.notify_teacher_on_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $old$
BEGIN
 IF TG_OP='INSERT' OR TG_OP='UPDATE' THEN RETURN NEW; END IF;
 RETURN NULL;
END;
$old$;
CREATE TRIGGER trg_notify_teacher_assessment_submitted
AFTER INSERT OR UPDATE OF status ON public.assessment_submissions
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.notify_teacher_on_submission();
