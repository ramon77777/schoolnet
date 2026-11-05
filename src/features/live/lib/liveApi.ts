import { supabase } from "@/lib/supabaseClient";

export type LiveStatus = "scheduled" | "live" | "completed" | "cancelled";

export type LiveSession = {
  id: string;
  course_id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: LiveStatus;
  created_at: string;
};

export type LiveCourse = {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
};

type CourseRecord = {
  id: string;
  title: string;
  class_id: string | null;
  created_by: string;
  status: string;
};

type ClassRecord = { id: string; name: string };

type IdRecord = { course_id: string };

type ClassIdRecord = { class_id: string };

export type DailyAccess = {
  session_id: string;
  room_url: string;
  meeting_token: string;
  is_teacher: boolean;
  expires_at: string;
};

export async function listLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase.from("live_sessions")
    .select("id, course_id, class_id, teacher_id, title, description, starts_at, ends_at, status, created_at")
    .order("starts_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as LiveSession[];
}

export async function listTeacherLiveCourses(userId: string): Promise<LiveCourse[]> {
  const [createdResult, assignedResult, classResult] = await Promise.all([
    supabase.from("courses")
      .select("id, title, class_id, created_by, status")
      .eq("created_by", userId).eq("status", "active"),
    supabase.from("course_teachers").select("course_id").eq("teacher_id", userId),
    supabase.from("class_teachers").select("class_id").eq("teacher_id", userId),
  ]);
  if (createdResult.error) throw createdResult.error;
  if (assignedResult.error) throw assignedResult.error;
  if (classResult.error) throw classResult.error;

  const assignedIds = new Set(((assignedResult.data ?? []) as IdRecord[]).map((x) => x.course_id));
  const classIds = new Set(((classResult.data ?? []) as ClassIdRecord[]).map((x) => x.class_id));

  // Fetch assigned courses as well as courses authored by the teacher.
  let assignedCourses: CourseRecord[] = [];
  if (assignedIds.size) {
    const { data, error } = await supabase.from("courses")
      .select("id, title, class_id, created_by, status")
      .in("id", [...assignedIds]).eq("status", "active");
    if (error) throw error;
    assignedCourses = (data ?? []) as CourseRecord[];
  }
  const createdCourses = (createdResult.data ?? []) as CourseRecord[];
  const uniqueCourses = new Map<string, CourseRecord>();
  for (const course of [...createdCourses, ...assignedCourses]) {
    if (course.class_id && classIds.has(course.class_id) &&
        (course.created_by === userId || assignedIds.has(course.id))) {
      uniqueCourses.set(course.id, course);
    }
  }
  const eligible = [...uniqueCourses.values()].sort((a, b) => a.title.localeCompare(b.title));
  const ids = [...new Set(eligible.map((x) => x.class_id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return [];
  const { data: classesData, error: classesError } = await supabase.from("classes")
    .select("id, name").in("id", ids);
  if (classesError) throw classesError;
  const names = new Map(((classesData ?? []) as ClassRecord[]).map((x) => [x.id, x.name]));
  return eligible.map((x) => ({
    id: x.id,
    title: x.title,
    class_id: x.class_id as string,
    class_name: names.get(x.class_id as string) ?? "Classe",
  }));
}

export async function scheduleLiveSession(input: {
  courseId: string;
  teacherId: string;
  startsAtIso: string;
  endsAtIso: string;
  title: string;
  description: string;
}): Promise<void> {
  const { error } = await supabase.rpc("live_create_session", {
    p_course_id: input.courseId,
    p_teacher_id: input.teacherId,
    p_starts_at: input.startsAtIso,
    p_ends_at: input.endsAtIso,
    p_title: input.title,
    p_description: input.description || null,
  });
  if (error) throw error;
}

export async function cancelLiveSession(id: string): Promise<void> {
  const { error } = await supabase.rpc("live_cancel_session", { p_session_id: id });
  if (error) throw error;
}

export async function getLiveAccess(id: string): Promise<DailyAccess> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("Connexion necessaire. Reconnectez-vous a SCHOOLNET.");
  }
  // Supabase-js sends the logged-in user's access token to the Edge Function.
  const { data, error } = await supabase.functions.invoke("schoolnet-live", {
    body: { session_id: id },
  });
  if (error) {
    let message = error.message || "Impossible d'ouvrir la salle video.";
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload?.error === "string") message = payload.error;
      } catch { /* Keep the generic error message. */ }
    }
    throw new Error(message);
  }
  const result = data as Partial<DailyAccess> | null;
  if (!result || !result.room_url || !result.meeting_token || result.session_id !== id) {
    throw new Error("Reponse du service video invalide.");
  }
  // The response must point to the SCHOOLNET Daily domain, never an arbitrary URL.
  const url = new URL(result.room_url);
  if (url.protocol !== "https:" || url.hostname !== "schoolnet-live.daily.co") {
    throw new Error("Adresse Daily non autorisee.");
  }
  return result as DailyAccess;
}

export function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Une erreur est survenue.";
}
