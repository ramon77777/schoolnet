import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type SchoolYearRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  created_at: string;
};

type FormState = {
  name: string;
  startsOn: string;
  endsOn: string;
};

function safeErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      details?: string;
    };
    return maybe.message || maybe.error_description || maybe.details || fallback;
  }
  return fallback;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

const initialForm: FormState = {
  name: "",
  startsOn: "",
  endsOn: "",
};

export default function AdminSchoolYears() {
  const { user, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<SchoolYearRow[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSchoolYears = useCallback(async () => {
    if (!user || user.isDemo) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("school_years")
        .select("id, name, starts_on, ends_on, is_current, created_at")
        .order("starts_on", { ascending: false });

      if (queryError) throw queryError;

      setRows((data ?? []) as SchoolYearRow[]);
    } catch (err) {
      console.error("[AdminSchoolYears] loadSchoolYears error:", err);
      setError(safeErrorMessage(err, "Impossible de charger les années scolaires."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadSchoolYears();
  }, [authLoading, loadSchoolYears]);

  const currentYear = useMemo(() => rows.find((row) => row.is_current) ?? null, [rows]);

  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length >= 4 &&
      form.startsOn.trim().length > 0 &&
      form.endsOn.trim().length > 0 &&
      !saving
    );
  }, [form, saving]);

  async function createSchoolYear() {
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError(null);

      const starts = new Date(form.startsOn).getTime();
      const ends = new Date(form.endsOn).getTime();

      if (Number.isNaN(starts) || Number.isNaN(ends)) {
        throw new Error("Dates invalides.");
      }

      if (ends <= starts) {
        throw new Error("La date de fin doit être après la date de début.");
      }

      const { error: insertError } = await supabase.from("school_years").insert({
        name: form.name.trim(),
        starts_on: form.startsOn,
        ends_on: form.endsOn,
        is_current: rows.length === 0,
      });

      if (insertError) throw insertError;

      setForm(initialForm);
      await loadSchoolYears();
    } catch (err) {
      console.error("[AdminSchoolYears] createSchoolYear error:", err);
      alert(safeErrorMessage(err, "Impossible de créer l’année scolaire."));
    } finally {
      setSaving(false);
    }
  }

  async function setCurrentYear(row: SchoolYearRow) {
    if (row.is_current || activatingId) return;

    const ok = window.confirm(`Définir "${row.name}" comme année scolaire active ?`);
    if (!ok) return;

    try {
      setActivatingId(row.id);

      const { error: clearError } = await supabase
        .from("school_years")
        .update({ is_current: false })
        .neq("id", row.id);

      if (clearError) throw clearError;

      const { error: activateError } = await supabase
        .from("school_years")
        .update({ is_current: true })
        .eq("id", row.id);

      if (activateError) throw activateError;

      await loadSchoolYears();
    } catch (err) {
      console.error("[AdminSchoolYears] setCurrentYear error:", err);
      alert(safeErrorMessage(err, "Impossible d’activer cette année scolaire."));
    } finally {
      setActivatingId(null);
    }
  }

  async function deleteSchoolYear(row: SchoolYearRow) {
    if (row.is_current) {
      alert("Impossible de supprimer l’année scolaire active.");
      return;
    }

    const ok = window.confirm(`Supprimer définitivement "${row.name}" ?`);
    if (!ok) return;

    try {
      setDeletingId(row.id);

      const { error: deleteError } = await supabase
        .from("school_years")
        .delete()
        .eq("id", row.id);

      if (deleteError) throw deleteError;

      await loadSchoolYears();
    } catch (err) {
      console.error("[AdminSchoolYears] deleteSchoolYear error:", err);
      alert(
        safeErrorMessage(
          err,
          "Impossible de supprimer cette année scolaire. Elle est peut-être déjà liée à des classes."
        )
      );
    } finally {
      setDeletingId(null);
    }
  }

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Années scolaires</div>
        <div className="text-sm text-gray-500">
          Gérez les périodes académiques et définissez l’année active.
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les années scolaires réelles ne sont pas chargées.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="sn-card p-5 space-y-4">
          <div>
            <div className="font-semibold text-gray-900">Nouvelle année</div>
            <div className="text-sm text-gray-500">
              Exemple : 2025-2026.
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-700">Nom</label>
              <input
                className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="2025-2026"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Début</label>
              <input
                type="date"
                className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                value={form.startsOn}
                onChange={(e) => setForm((prev) => ({ ...prev, startsOn: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Fin</label>
              <input
                type="date"
                className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                value={form.endsOn}
                onChange={(e) => setForm((prev) => ({ ...prev, endsOn: e.target.value }))}
              />
            </div>

            <button
              type="button"
              className="sn-btn-primary sn-press w-full"
              onClick={() => void createSchoolYear()}
              disabled={!canSubmit}
            >
              {saving ? "Création..." : "Créer l’année scolaire"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="sn-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">Année active</div>
                <div className="text-sm text-gray-500">
                  Utilisée par défaut pour les classes, cours et inscriptions.
                </div>
              </div>

              <span className="sn-badge sn-badge-green">
                {currentYear?.name ?? "Aucune"}
              </span>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="sn-card p-5 animate-pulse space-y-3">
                  <div className="h-5 w-1/3 rounded bg-gray-200" />
                  <div className="h-4 w-1/2 rounded bg-gray-100" />
                  <div className="h-8 w-40 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {!isLoading && !error && rows.length === 0 && (
            <div className="sn-card p-6 text-sm text-gray-600">
              Aucune année scolaire enregistrée.
            </div>
          )}

          {!isLoading && !error && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="sn-card sn-card-hover p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-gray-900">{row.name}</div>
                        {row.is_current && (
                          <span className="sn-badge sn-badge-green">Active</span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {formatDate(row.starts_on)} → {formatDate(row.ends_on)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() => void setCurrentYear(row)}
                        disabled={row.is_current || activatingId === row.id}
                      >
                        {activatingId === row.id ? "Activation..." : "Définir active"}
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press text-red-600"
                        onClick={() => void deleteSchoolYear(row)}
                        disabled={row.is_current || deletingId === row.id}
                      >
                        {deletingId === row.id ? "Suppression..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}