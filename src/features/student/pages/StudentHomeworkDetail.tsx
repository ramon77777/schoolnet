import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type HomeworkRow = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  max_score: number | null;

  submission_mode: "online" | "file_upload" | null;

  instruction_file_url: string | null;
  instruction_file_name: string | null;

  courses:
    | { id: string; title: string }
    | { id: string; title: string }[]
    | null;

  course_sections:
    | { id: string; title: string }
    | { id: string; title: string }[]
    | null;
};

type HomeworkSubmissionRow = {
  id: string;
  file_url: string | null;
  file_name: string | null;
  note: string | null;
  submitted_at: string | null;
  status: "in_progress" | "submitted" | "graded" | "published";
  score: number | null;
  feedback: string | null;
  detailed_feedback: string | null;
};

function normalizeOne<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as { message?: string; error_description?: string; details?: string };
    return maybe.message || maybe.error_description || maybe.details || fallback;
  }
  return fallback;
}

export default function StudentHomeworkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [homework, setHomework] = useState<HomeworkRow | null>(null);
  const [submission, setSubmission] = useState<HomeworkSubmissionRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHomework = useCallback(async () => {
    if (!id) {
      setError("Devoir introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setError("Le dépôt réel n’est pas disponible en mode démo.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [homeworkResult, submissionResult] = await Promise.all([
        supabase
          .from("assessments")
          .select(
            `
            id,
            title,
            description,
            due_at,
            max_score,
            submission_mode,
            instruction_file_url,
            instruction_file_name,
            courses (
              id,
              title
            ),
            course_sections (
              id,
              title
            )
            `
        )
          .eq("id", id)
          .eq("type", "assignment")
          .eq("submission_mode", "file_upload")
          .single(),

        supabase
          .from("homework_submissions")
          .select("id, file_url, file_name, note, submitted_at, status, score, feedback, detailed_feedback")
          .eq("homework_id", id)
          .eq("student_id", user.id)
          .maybeSingle(),
      ]);

      if (homeworkResult.error) throw homeworkResult.error;
      if (submissionResult.error) throw submissionResult.error;

      const existingSubmission = submissionResult.data as HomeworkSubmissionRow | null;

      setHomework(homeworkResult.data as HomeworkRow);
      setSubmission(existingSubmission);
      setNote(existingSubmission?.note ?? "");
    } catch (err) {
      console.error("[StudentHomeworkDetail] loadHomework error:", err);
      setError(safeErrorMessage(err, "Impossible de charger ce devoir."));
      setHomework(null);
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadHomework();
  }, [authLoading, loadHomework]);

  async function submitHomework() {
    if (!id || !user || submitting) return;

    if (!file && !submission?.file_url && !note.trim()) {
      alert("Ajoute un fichier ou une note avant de soumettre.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      let finalFileUrl = submission?.file_url ?? null;
      let finalFileName = submission?.file_name ?? null;

      if (file) {
        const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
        const filePath = `${user.id}/${id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("homework-submissions")
          .upload(filePath, file, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("homework-submissions").getPublicUrl(filePath);

        finalFileUrl = data.publicUrl;
        finalFileName = file.name;
      }

      const payload = {
        homework_id: id,
        student_id: user.id,
        file_url: finalFileUrl,
        file_name: finalFileName,
        note: note.trim() || null,
        submitted_at: new Date().toISOString(),
        status: "submitted" as const,
      };

      const { error: upsertError } = await supabase
        .from("homework_submissions")
        .upsert(payload, { onConflict: "homework_id,student_id" });

      if (upsertError) throw upsertError;

      alert("✅ Devoir soumis.");
      await loadHomework();
      setFile(null);
    } catch (err) {
      console.error("[StudentHomeworkDetail] submitHomework error:", err);
      alert(safeErrorMessage(err, "Impossible de soumettre le devoir."));
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = authLoading || loading;
  const courseTitle = homework ? normalizeOne(homework.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = homework
    ? normalizeOne(homework.course_sections)?.title ?? "Sans section"
    : "Sans section";

  const isLocked =
    submission?.status === "graded" ||
    submission?.status === "published";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{homework?.title ?? "Devoir"}</div>
          <div className="text-sm text-gray-500">
            {courseTitle} • {sectionTitle}
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => navigate("/app/student/homework")}>
          ← Retour aux devoirs
        </button>
      </div>

      {isLoading && (
        <div className="sn-card p-6 animate-pulse space-y-3">
          <div className="h-6 w-1/3 rounded bg-gray-200" />
          <div className="h-20 rounded bg-gray-100" />
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {!isLoading && !error && homework && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="sn-card p-5 space-y-3">
              <div className="font-semibold">Consignes</div>

              {homework.description?.trim() ? (
                <div
                  className="prose max-w-none text-sm text-gray-700"
                  dangerouslySetInnerHTML={{
                    __html: homework.description,
                  }}
                />
              ) : (
                <div className="text-sm text-gray-500">
                  Aucune consigne fournie.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <InfoCard label="Date limite" value={formatDate(homework.due_at)} />
                <InfoCard
                  label="Note maximale"
                  value={homework.max_score !== null ? `${homework.max_score} pts` : "—"}
                />
              </div>
            </div>

            <div className="sn-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">Sujet du devoir</div>

                <span className="sn-badge sn-badge-blue">
                  Fichier enseignant
                </span>
              </div>

              {homework.instruction_file_url ? (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">
                      {homework.instruction_file_name || "Sujet du devoir"}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Téléchargez ce document, traitez le devoir puis déposez votre travail ci-dessous.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={homework.instruction_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="sn-btn-primary sn-press"
                    >
                      Ouvrir le sujet
                    </a>

                    <a
                      href={homework.instruction_file_url}
                      download
                      className="sn-btn-ghost sn-press"
                    >
                      Télécharger
                    </a>
                  </div>

                  {homework.instruction_file_name
                    ?.toLowerCase()
                    .endsWith(".pdf") && (
                    <iframe
                      src={homework.instruction_file_url}
                      title="Sujet du devoir"
                      className="w-full h-[700px] rounded-2xl border border-gray-200 bg-white"
                    />
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                  Aucun fichier de sujet n’est disponible pour ce devoir.
                </div>
              )}
            </div>

            <div className="sn-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Mon rendu</div>
                <span
                  className={
                    submission?.status === "published"
                      ? "sn-badge sn-badge-green"
                      : submission?.status === "graded"
                      ? "sn-badge sn-badge-blue"
                      : submission?.status === "submitted"
                      ? "sn-badge sn-badge-amber"
                      : "sn-badge sn-badge-gray"
                  }
                >
                  {submission?.status === "published"
                    ? "Publié"
                    : submission?.status === "graded"
                    ? "Corrigé"
                    : submission?.status === "submitted"
                    ? "Soumis"
                    : "À faire"}
                </span>
              </div>

              {submission?.file_url && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {submission.file_name ?? "Fichier soumis"}
                    </div>
                    <div className="text-xs text-gray-500">
                      Soumis le : {formatDate(submission.submitted_at)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sn-btn-ghost sn-press"
                    onClick={() =>
                      submission.file_url &&
                      window.open(submission.file_url, "_blank", "noopener,noreferrer")
                    }
                  >
                    Ouvrir
                  </button>
                </div>
              )}

              {isLocked ? (
                <div className="space-y-4">
                  <div
                    className={`rounded-2xl border p-4 ${
                      submission?.status === "published"
                        ? "border-green-100 bg-green-50"
                        : "border-blue-100 bg-blue-50"
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold ${
                        submission?.status === "published"
                          ? "text-green-900"
                          : "text-blue-900"
                      }`}
                    >
                      {submission?.status === "published"
                        ? "Correction publiée"
                        : "Rendu corrigé"}
                    </div>

                    <div
                      className={`mt-1 text-sm ${
                        submission?.status === "published"
                          ? "text-green-800"
                          : "text-blue-800"
                      }`}
                    >
                      {submission?.status === "published"
                        ? "Votre rendu est verrouillé. La note et les commentaires de l’enseignant sont maintenant disponibles dans la zone Correction."
                        : "Votre rendu a été corrigé par l’enseignant et ne peut plus être modifié. La correction sera visible après sa publication."}
                    </div>
                  </div>

                  {submission?.note && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs font-semibold text-gray-700">
                        Message envoyé à l’enseignant
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                        {submission.note}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="text-xs text-gray-500">
                      État du rendu
                    </div>

                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {submission?.status === "published"
                        ? "Correction publiée — rendu verrouillé"
                        : "Corrigé — en attente de publication"}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700">
                      Fichier à déposer
                    </label>

                    <input
                      type="file"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      disabled={submitting}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />

                    <div className="text-xs text-gray-500">
                      Formats acceptés : PDF, Word, PowerPoint, image, archive, etc.
                    </div>

                    {file && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        Nouveau fichier sélectionné :{" "}
                        <span className="font-semibold">{file.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700">
                      Note pour l’enseignant
                    </label>

                    <textarea
                      className="w-full min-h-[120px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={submitting}
                      placeholder="Ajoute un message si nécessaire..."
                    />
                  </div>

                  {submission?.status === "submitted" && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                      Votre devoir a déjà été soumis. Vous pouvez encore modifier votre rendu tant que l’enseignant ne l’a pas corrigé.
                    </div>
                  )}

                  <button
                    className="sn-btn-primary sn-press w-full"
                    onClick={submitHomework}
                    disabled={submitting}
                    type="button"
                  >
                    {submitting
                      ? "Soumission..."
                      : submission?.status === "submitted"
                      ? "Mettre à jour le rendu"
                      : "Soumettre le devoir"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="sn-card p-5 space-y-3">
              <div className="font-semibold">Correction</div>

              {submission?.status === "published" ? (
                <>
                  <InfoCard
                    label="Note"
                    value={
                      submission.score !== null &&
                      submission.score !== undefined
                        ? homework.max_score !== null &&
                          homework.max_score !== undefined
                          ? `${submission.score} / ${homework.max_score}`
                          : String(submission.score)
                        : "—"
                    }
                  />
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      Feedback global
                    </div>

                    <div className="whitespace-pre-wrap">
                      {submission.feedback || "Aucun feedback global."}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap">
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      Feedback détaillé
                    </div>
                    {submission.detailed_feedback || "Aucun feedback détaillé."}
                  </div>
                </>
              ) : submission?.status === "graded" ? (
                <div className="text-sm text-gray-600">
                  Le devoir est corrigé, en attente de publication par l’enseignant.
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  La correction apparaîtra ici après publication.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}