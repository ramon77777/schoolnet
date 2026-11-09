import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createAdminTimetableRoom,
  deleteAdminTimetableRoom,
  getAdminTimetableErrorMessage,
  setAdminTimetableRoomActive,
  updateAdminTimetableRoom,
} from "@/features/timetable/lib/adminTimetableApi";
import { getVisibleTimetableRooms } from "@/features/timetable/lib/timetableApi";
import type { TimetableRoom } from "@/features/timetable/types/timetable.types";

type RoomFilter = "all" | "active" | "inactive";
type RoomDraft = { name: string; code: string; capacity: string; notes: string };
const emptyDraft: RoomDraft = { name: "", code: "", capacity: "", notes: "" };

function validateRoomDraft(draft: RoomDraft): string | null {
  if (!draft.name.trim()) return "Le nom de la salle est obligatoire.";
  if (draft.name.trim().length > 120) return "Le nom ne doit pas dépasser 120 caractères.";
  if (draft.code.trim().length > 40) return "Le code ne doit pas dépasser 40 caractères.";
  if (draft.capacity.trim() && (!/^\d+$/.test(draft.capacity.trim()) || Number(draft.capacity) < 1 || !Number.isSafeInteger(Number(draft.capacity)))) {
    return "La capacité doit être un nombre entier positif.";
  }
  return null;
}

export default function AdminRooms() {
  const [rooms, setRooms] = useState<TimetableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [editing, setEditing] = useState<TimetableRoom | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<RoomDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      setRooms(await getVisibleTimetableRooms());
    } catch (failure) {
      setError(getAdminTimetableErrorMessage(failure, "Impossible de charger les salles."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);

  const filtered = useMemo(() => {
    const text = search.trim().toLocaleLowerCase("fr");
    return rooms.filter((room) => {
      if (filter === "active" && !room.isActive) return false;
      if (filter === "inactive" && room.isActive) return false;
      return !text || [room.name, room.code, room.notes].some((item) => item?.toLocaleLowerCase("fr").includes(text));
    });
  }, [rooms, search, filter]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };
  const openEdit = (room: TimetableRoom) => {
    setEditing(room);
    setDraft({
      name: room.name,
      code: room.code ?? "",
      capacity: room.capacity?.toString() ?? "",
      notes: room.notes ?? "",
    });
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issue = validateRoomDraft(draft);
    if (issue) { setError(issue); return; }
    setSaving(true);
    setError(null);
    try {
      const input = {
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        capacity: draft.capacity.trim() ? Number(draft.capacity) : null,
        notes: draft.notes.trim() || null,
        isActive: editing?.isActive ?? true,
      };
      if (editing) await updateAdminTimetableRoom(editing.id, input);
      else await createAdminTimetableRoom(input);
      setFormOpen(false);
      setEditing(null);
      setSuccess(editing ? "La salle a été modifiée." : "La salle a été créée.");
      await refresh();
    } catch (failure) {
      setError(getAdminTimetableErrorMessage(failure, "Impossible d'enregistrer la salle."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (room: TimetableRoom) => {
    const verb = room.isActive ? "désactiver" : "réactiver";
    if (!window.confirm(`Voulez-vous ${verb} la salle « ${room.name} » ?`)) return;
    setPendingId(room.id);
    setError(null);
    setSuccess(null);
    try {
      await setAdminTimetableRoomActive(room.id, !room.isActive);
      setSuccess(room.isActive ? "Salle désactivée." : "Salle réactivée.");
      await refresh();
    } catch (failure) {
      setError(getAdminTimetableErrorMessage(failure, "La salle ne peut pas changer de statut."));
    } finally { setPendingId(null); }
  };

  const remove = async (room: TimetableRoom) => {
    if (!window.confirm(`Supprimer définitivement « ${room.name} » ? Cette action est réservée aux salles qui ne sont pas utilisées dans un emploi du temps.`)) return;
    setPendingId(room.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminTimetableRoom(room.id);
      setSuccess("Salle supprimée.");
      await refresh();
    } catch (failure) {
      setError(getAdminTimetableErrorMessage(failure, "La salle est liée à un créneau : désactivez-la au lieu de la supprimer."));
    } finally { setPendingId(null); }
  };

  const active = rooms.filter((room) => room.isActive).length;
  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const buttonClass = "rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-blue-700 to-violet-700 p-6 text-white shadow-lg">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">SchoolNet · Administration</p>
          <h1 className="mt-2 text-2xl font-extrabold">Gestion des salles</h1>
          <p className="mt-1 text-sm text-blue-100">Répertoriez les salles physiques de votre établissement et utilisez-les dans l'emploi du temps.</p>
        </div>
        <button type="button" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50" onClick={openCreate}>+ Nouvelle salle</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Salles enregistrées", rooms.length],
          ["Salles actives", active],
          ["Salles inactives", rooms.length - active],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Rechercher une salle</span>
            <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, code, observations…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Statut</span>
            <select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value as RoomFilter)}>
              <option value="all">Toutes les salles</option>
              <option value="active">Salles actives</option>
              <option value="inactive">Salles inactives</option>
            </select>
          </label>
          <button type="button" className={`${buttonClass} border border-slate-200 text-slate-700 hover:bg-slate-50`} disabled={refreshing || loading} onClick={() => void refresh()}>{refreshing ? "Actualisation…" : "↻ Actualiser"}</button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Chargement des salles…</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-semibold text-slate-800">{rooms.length ? "Aucune salle ne correspond aux filtres." : "Aucune salle enregistrée pour le moment."}</p>
            <p className="mt-1 text-sm text-slate-500">Créez une salle pour pouvoir l'affecter aux créneaux d'un établissement.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((room) => (
              <article key={room.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-950">{room.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{room.code ? `Code : ${room.code}` : "Sans code"} · {room.capacity ? `${room.capacity} places` : "Capacité non renseignée"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${room.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{room.isActive ? "Active" : "Inactive"}</span>
                </div>
                {room.notes && <p className="mt-3 line-clamp-2 min-h-9 text-xs text-slate-600">{room.notes}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={`${buttonClass} bg-blue-50 text-blue-700 hover:bg-blue-100`} disabled={pendingId !== null} onClick={() => openEdit(room)}>Modifier</button>
                  <button type="button" className={`${buttonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`} disabled={pendingId !== null} onClick={() => void toggle(room)}>{pendingId === room.id ? "Traitement…" : room.isActive ? "Désactiver" : "Réactiver"}</button>
                  <button type="button" className={`${buttonClass} text-red-600 hover:bg-red-50`} disabled={pendingId !== null} onClick={() => void remove(room)}>Supprimer</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Les classes pédagogiques sont gérées séparément. Les salles physiques sont facultatives dans <Link className="font-semibold text-blue-700 underline" to="/app/admin/timetable">Emploi du temps</Link>. Une salle déjà utilisée par un créneau ne doit pas être supprimée : désactivez-la pour conserver l'historique.
      </p>

      {formOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label={editing ? "Modifier la salle" : "Nouvelle salle"} className="mx-auto mt-[8vh] w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-950">{editing ? "Modifier la salle" : "Nouvelle salle"}</h2>
                <p className="mt-1 text-sm text-slate-500">Les champs avec * sont obligatoires.</p>
              </div>
              <button type="button" aria-label="Fermer" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" disabled={saving} onClick={() => setFormOpen(false)}>✕</button>
            </div>
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Nom de la salle *</span><input className={inputClass} maxLength={120} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex. Salle 6e A, Laboratoire informatique…" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Code (facultatif)</span><input className={inputClass} maxLength={40} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="Ex. BAT-A-101" /></label>
                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Nombre de places</span><input className={inputClass} inputMode="numeric" type="number" min="1" step="1" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="Ex. 40" /></label>
              </div>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Observations</span><textarea className={inputClass} rows={3} maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Étage, équipement, particularités…" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" className={`${buttonClass} border border-slate-200 text-slate-700`} disabled={saving} onClick={() => setFormOpen(false)}>Annuler</button>
                <button type="submit" disabled={saving} className={`${buttonClass} bg-blue-600 px-5 text-white hover:bg-blue-700`}>{saving ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Créer la salle"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
