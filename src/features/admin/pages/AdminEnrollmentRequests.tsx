import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabaseClient';

type RequestStatus = 'new' | 'contacted' | 'processed' | 'rejected';

type EnrollmentRequest = {
  id: string; reference: string; student_full_name: string;
  student_gender: 'male' | 'female'; requested_level: string;
  guardian_full_name: string; guardian_relationship: string;
  guardian_phone: string; guardian_email: string | null;
  message: string | null; status: RequestStatus;
  review_note: string | null;
  submitted_at: string; reviewed_at: string | null;
};

const statusLabels: Record<RequestStatus, string> = {
  new: 'Nouvelle', contacted: 'Famille contactee',
  processed: 'Traitee', rejected: 'Refusee',
};

function displayDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminEnrollmentRequests() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<EnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | RequestStatus>('all');
  const [selected, setSelected] = useState<EnrollmentRequest | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user || user.role !== 'admin' || user.isDemo) {
      setRows([]); setLoading(false);
      return;
    }
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from('public_enrollment_requests')
        .select('id, reference, student_full_name, student_gender, requested_level, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, message, status, review_note, submitted_at, reviewed_at')
        .order('submitted_at', { ascending: false }).limit(200);
      if (queryError) throw queryError;
      setRows((data ?? []) as EnrollmentRequest[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les demandes.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);

  const displayed = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return rows.filter((row) => (filter === 'all' || row.status === filter) &&
      (!needle || [row.reference, row.student_full_name,
        row.guardian_full_name, row.guardian_phone, row.requested_level]
        .some((value) => value.toLocaleLowerCase('fr').includes(needle))));
  }, [rows, filter, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    new: rows.filter((row) => row.status === 'new').length,
    contacted: rows.filter((row) => row.status === 'contacted').length,
    processed: rows.filter((row) => row.status === 'processed').length,
  }), [rows]);

  async function review(status: Exclude<RequestStatus, 'new'>) {
    if (!selected || saving) return;
    if (status === 'processed' && !window.confirm(
      'Marquer cette demande comme traitee ? Verifiez que le compte et le dossier ont ete crees si la famille est admise.',
    )) return;
    setSaving(true);
    try {
      const { error: mutationError } = await supabase.rpc(
        'admin_review_public_enrollment_request',
        { p_request_id: selected.id, p_status: status, p_note: note.trim() || null },
      );
      if (mutationError) throw mutationError;
      setSelected(null);
      setNote('');
      setSuccess('Demande mise a jour.');
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.');
    } finally { setSaving(false); }
  }

  const badge = (status: RequestStatus) => status === 'new' ?
    'border-blue-200 bg-blue-50 text-blue-700' : status === 'contacted' ?
    'border-amber-200 bg-amber-50 text-amber-700' : status === 'processed' ?
    'border-emerald-200 bg-emerald-50 text-emerald-700' :
    'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className="space-y-6">
      <div className="sn-card flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-white to-blue-50 p-6">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">SchoolNet &middot; Lot 5</div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">Demandes d'inscription publiques</h1>
          <p className="mt-2 text-sm text-slate-600">Les demandes sont examin&eacute;es avant toute cr&eacute;ation de compte ou affectation scolaire.</p>
        </div>
        <button className="sn-btn-ghost" onClick={() => void load(true)} disabled={loading || refreshing}>Actualiser</button>
      </div>

      {user?.isDemo && <div className="sn-card border border-amber-200 bg-amber-50 p-5 text-amber-800">Les demandes r&eacute;elles ne sont pas visibles en mode d&eacute;mo.</div>}
      {error && <div role="alert" className="sn-card border border-red-200 bg-red-50 p-5 text-red-800">{error}</div>}
      {success && <div role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">{success}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([['Total', counts.total], ['Nouvelles', counts.new], ['Contactees', counts.contacted], ['Traitees', counts.processed]] as const)
          .map(([label, number]) => <div key={label} className="sn-card p-5"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-slate-900">{number}</div></div>)}
      </div>

      <div className="sn-card grid gap-4 p-5 sm:grid-cols-[1fr_230px]">
        <label className="block text-sm font-semibold text-slate-700">Recherche
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, enfant, responsable..."
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Statut
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500">
            <option value="all">Tous les statuts</option>
            {(Object.keys(statusLabels) as RequestStatus[]).map((status) =>
              <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
      </div>

      <div className="sn-card overflow-hidden">
        <div className="border-b border-slate-100 p-5 text-sm font-bold text-slate-900">{displayed.length} demande(s) affich&eacute;e(s)</div>
        {loading ? <div className="p-12 text-center text-sm text-slate-500">Chargement des demandes...</div> :
          displayed.length === 0 ? <div className="p-12 text-center text-slate-500">Aucune demande ne correspond aux filtres.</div> :
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-5 py-4">Demande / enfant</th><th className="px-5 py-4">Niveau</th>
                <th className="px-5 py-4">Responsable</th><th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Statut</th><th className="px-5 py-4 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map((row) => <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4"><div className="font-semibold text-slate-950">{row.student_full_name}</div><div className="mt-1 text-xs text-slate-500">{row.reference}</div></td>
                  <td className="px-5 py-4 text-slate-700">{row.requested_level}</td>
                  <td className="px-5 py-4 text-slate-700">{row.guardian_full_name}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{displayDate(row.submitted_at)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badge(row.status)}`}>{statusLabels[row.status]}</span></td>
                  <td className="px-5 py-4 text-right"><button onClick={() => { setSelected(row); setNote(row.review_note ?? ''); setSuccess(null); }}
                    className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700">Examiner</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      </div>

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setSelected(null); }}>
        <section role="dialog" aria-modal="true" aria-label="Examen de la demande" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-xs font-bold tracking-wide text-blue-600">{selected.reference}</div>
              <h2 className="mt-2 text-2xl font-black">{selected.student_full_name}</h2>
              <p className="mt-2 text-sm text-slate-500">{selected.requested_level} &middot; {selected.student_gender === 'male' ? 'Masculin' : 'Feminin'}</p>
            </div>
            <button onClick={() => setSelected(null)} disabled={saving} aria-label="Fermer" className="rounded-lg bg-slate-100 px-3 py-2">&#10005;</button>
          </div>
          <div className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
            <div><div className="text-slate-500">Responsable</div><strong>{selected.guardian_full_name}</strong></div>
            <div><div className="text-slate-500">Lien</div><strong>{selected.guardian_relationship === 'father' ? 'Pere' : selected.guardian_relationship === 'mother' ? 'Mere' : 'Tuteur'}</strong></div>
            <div><div className="text-slate-500">Telephone</div><a className="font-bold text-blue-700 underline" href={`tel:${selected.guardian_phone.replace(/[^+\d]/g, '')}`}>{selected.guardian_phone}</a></div>
            <div><div className="text-slate-500">E-mail</div>{selected.guardian_email || 'Non renseigne'}</div>
            <div className="sm:col-span-2"><div className="text-slate-500">Observations</div>{selected.message || 'Aucune'}</div>
          </div>
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            Une demande publique n'est pas un compte. Pour admettre l'apprenant, utilisez d'abord
            {' '}<Link className="font-bold underline" to="/app/admin/users">Utilisateurs</Link> puis
            {' '}<Link className="font-bold underline" to="/app/admin/enrollments">Inscriptions</Link>.
          </div>
          <label className="mt-6 block text-sm font-semibold text-slate-700">Note interne (facultatif)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
            <button onClick={() => setSelected(null)} disabled={saving} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">Fermer</button>
            <button onClick={() => void review('rejected')} disabled={saving} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Refuser</button>
            <button onClick={() => void review('contacted')} disabled={saving} className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-bold text-amber-700">Famille contactee</button>
            <button onClick={() => void review('processed')} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Traitee</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
