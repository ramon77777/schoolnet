import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import AdminRequestResolutionPanel, { type RequestResolution } from '@/features/enrollments/components/AdminRequestResolutionPanel';

type RequestStatus = 'new' | 'contacted' | 'processed' | 'rejected';
type RequestType = 'student_enrollment' | 'parent_access';

type EnrollmentRequest = {
  id: string; reference: string; student_full_name: string;
  request_type: RequestType; student_email: string | null;
  student_gender: 'male' | 'female' | null; requested_level: string | null;
  guardian_full_name: string; guardian_relationship: string;
  guardian_phone: string; guardian_email: string | null;
  message: string | null; status: RequestStatus;
  review_note: string | null;
  submitted_at: string; reviewed_at: string | null;
};

const REQUEST_SELECT_FIELDS = 'id, reference, request_type, student_email, student_full_name, student_gender, requested_level, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, message, status, review_note, submitted_at, reviewed_at';

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
  const [resolving, setResolving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestIdFromUrl = searchParams.get('request');

  const closeRequest = useCallback(() => {
    if (resolving) return;
    setSelected(null);
    if (requestIdFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.delete('request');
      setSearchParams(next, { replace: true });
    }
  }, [requestIdFromUrl, resolving, searchParams, setSearchParams]);

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
        .select(REQUEST_SELECT_FIELDS)
        .order('submitted_at', { ascending: false }).limit(200);
      if (queryError) throw queryError;
      setRows((data ?? []) as EnrollmentRequest[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les demandes.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);

  // Un clic sur une notification ouvre directement le bon dossier.
  // La recherche individuelle fonctionne meme pour les dossiers hors des 200 plus recents.
  useEffect(() => {
    if (!requestIdFromUrl || authLoading || loading || user?.role !== 'admin' || user.isDemo) return;
    let cancelled = false;

    void (async () => {
      const existing = rows.find((row) => row.id === requestIdFromUrl);
      if (existing) {
        if (!cancelled) {
          setSelected(existing);
          setNote(existing.review_note ?? '');
        }
        return;
      }

      const { data, error: lookupError } = await supabase
        .from('public_enrollment_requests')
        .select(REQUEST_SELECT_FIELDS)
        .eq('id', requestIdFromUrl)
        .maybeSingle();

      if (cancelled) return;
      if (lookupError) {
        setError('Impossible de retrouver la demande liee a la notification.');
      } else if (data) {
        const found = data as EnrollmentRequest;
        setSelected(found);
        setNote(found.review_note ?? '');
      } else {
        setError('La demande liee a cette notification est introuvable.');
      }
    })();

    return () => { cancelled = true; };
  }, [requestIdFromUrl, authLoading, loading, rows, user]);

  const displayed = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return rows.filter((row) => (filter === 'all' || row.status === filter) &&
      (!needle || [row.reference, row.student_full_name,
        row.guardian_full_name, row.guardian_phone, row.guardian_email,
        row.student_email, row.requested_level]
        .some((value) => (value ?? '').toLocaleLowerCase('fr').includes(needle))));
  }, [rows, filter, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    new: rows.filter((row) => row.status === 'new').length,
    contacted: rows.filter((row) => row.status === 'contacted').length,
    processed: rows.filter((row) => row.status === 'processed').length,
    parents: rows.filter((row) => row.request_type === 'parent_access').length,
  }), [rows]);

  async function review(status: 'contacted' | 'rejected') {
    if (!selected || saving || resolving) return;
    setSaving(true);
    try {
      const { error: mutationError } = await supabase.rpc(
        'admin_review_public_enrollment_request',
        { p_request_id: selected.id, p_status: status, p_note: note.trim() || null },
      );
      if (mutationError) throw mutationError;
      closeRequest();
      setNote('');
      setSuccess('Demande mise a jour.');
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.');
    } finally { setSaving(false); }
  }

  async function handleFinalized(result: RequestResolution) {
    // Le traitement serveur est atomique ; actualiser le compteur et la vue
    // sans fermer la preuve de rattachement ni perdre le lien de notification.
    setSelected((current) =>
      current?.id === result.request_id ? { ...current, status: 'processed' } : current,
    );
    setSuccess('Demande finalisée et comptes liés : ' + selected?.reference + '.');
    await load(true);
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([['Total', counts.total], ['Nouvelles', counts.new], ['Contactees', counts.contacted], ['Traitees', counts.processed], ['Acces parents', counts.parents]] as const)
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
                  <td className="px-5 py-4"><div className="font-semibold text-slate-950">{row.student_full_name}</div><div className="mt-1 text-xs font-semibold text-indigo-700">{row.request_type === 'parent_access' ? 'Acces parent / tuteur' : 'Inscription apprenant'}</div><div className="mt-1 text-xs text-slate-500">{row.reference}</div></td>
                  <td className="px-5 py-4 text-slate-700">{row.requested_level ?? '--'}</td>
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

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving && !resolving) closeRequest(); }}>
        <section role="dialog" aria-modal="true" aria-label="Examen de la demande" className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-xs font-bold tracking-wide text-blue-600">{selected.reference}</div>
              <p className="mt-2 text-xs font-bold text-indigo-700">{selected.request_type === 'parent_access' ? 'Demande de compte parent / tuteur' : 'Demande inscription apprenant'}</p>
              <h2 className="mt-2 text-2xl font-black">{selected.student_full_name}</h2>
              <p className="mt-2 text-sm text-slate-500">{selected.request_type === 'parent_access' ? 'Enfant a rattacher apres verification' : `${selected.requested_level ?? '--'} - ${selected.student_gender === 'male' ? 'Masculin' : selected.student_gender === 'female' ? 'Feminin' : '--'}`}</p>
            </div>
            <button onClick={closeRequest} disabled={saving || resolving} aria-label="Fermer" className="rounded-lg bg-slate-100 px-3 py-2">&#10005;</button>
          </div>
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="min-w-0 space-y-4">
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><div className="text-slate-500">Responsable</div><strong>{selected.guardian_full_name}</strong></div>
            <div><div className="text-slate-500">Lien</div><strong>{selected.guardian_relationship === 'father' ? 'Pere' : selected.guardian_relationship === 'mother' ? 'Mere' : 'Tuteur'}</strong></div>
            <div><div className="text-slate-500">Telephone</div><a className="font-bold text-blue-700 underline" href={`tel:${selected.guardian_phone.replace(/[^+\d]/g, '')}`}>{selected.guardian_phone}</a></div>
            <div><div className="text-slate-500">E-mail parent / tuteur</div><div className="break-all">{selected.guardian_email || 'Non renseigne (ancien dossier)'}</div></div>
            {selected.request_type === 'student_enrollment' && <div className="sm:col-span-2"><div className="text-slate-500">E-mail de l'apprenant</div>{selected.student_email || 'Non renseigne (facultatif)'}</div>}
            <div className="sm:col-span-2"><div className="text-slate-500">Observations</div>{selected.message || 'Aucune'}</div>
          </div>
          <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            La demande ne crée pas encore de compte. La vérification du lien familial
            reste obligatoire avant tout rattachement.{" "}
            <Link className="font-semibold underline" to="/app/admin/users">Utilisateurs</Link>
            {selected.request_type === 'student_enrollment' && (
              <> et <Link className="font-semibold underline" to="/app/admin/enrollments">Inscriptions</Link></>
            )} restent disponibles pour les démarches manuelles.
          </p>

              <details className="rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
                  Note de suivi (facultatif) · Afficher / masquer
                </summary>
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <label className="block text-sm font-semibold text-slate-700">Note interne (facultatif)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" />
          </label>

                </div>
              </details>
            </div>
            <div className="min-w-0">
          <AdminRequestResolutionPanel
            key={selected.id}
            request={selected}
            disabled={Boolean(user?.isDemo)}
            onFinalized={handleFinalized}
            onBusyChange={setResolving}
          />

            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
            <button onClick={closeRequest} disabled={saving || resolving} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">Fermer</button>
            {selected.status !== 'processed' && <>
              <button onClick={() => void review('rejected')} disabled={saving || resolving} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Refuser</button>
              <button onClick={() => void review('contacted')} disabled={saving || resolving} className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-bold text-amber-700">Famille contactée</button>
            </>}
            {selected.status === 'processed' && <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Traitée · Rattachement contrôlé</span>}
          </div>
        </section>
      </div>}
    </div>
  );
}
