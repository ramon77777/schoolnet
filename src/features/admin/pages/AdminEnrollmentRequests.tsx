import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import AdminRequestResolutionPanel, { type RequestResolution } from '@/features/enrollments/components/AdminRequestResolutionPanel';
import AdminStudentNoEmailPanel from '@/features/enrollments/components/AdminStudentNoEmailPanel';

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
  const [activeTab, setActiveTab] = useState<'access' | 'family' | 'details'>('access');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestIdFromUrl = searchParams.get('request');

  const closeRequest = useCallback(() => {
    if (resolving) return;
    setSelected(null);
    setActiveTab('access');
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
    if (status === 'rejected' && !window.confirm('Refuser définitivement cette demande ?')) return;
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

  const noEmailAccess = selected?.request_type === 'student_enrollment' && !selected.student_email;
  const currentTab = !noEmailAccess && activeTab === 'access' ? 'family' : activeTab;

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

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 sm:p-4"
          role="presentation" onMouseDown={event => {
            if(event.currentTarget === event.target && !saving && !resolving) closeRequest();
          }}>
          <section role="dialog" aria-modal="true" aria-label={'Dossier ' + selected.reference}
            className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:rounded-3xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-700">{selected.reference} · {selected.request_type === 'parent_access' ? 'Accès Parent' : 'Inscription Apprenant'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-950 sm:text-2xl">{selected.student_full_name}</h2>
                  <span className={'rounded-full border px-2 py-0.5 text-xs font-bold ' + badge(selected.status)}>{statusLabels[selected.status]}</span>
                </div>
                <p className="text-xs text-slate-500">{selected.requested_level || 'Niveau non renseigné'}
                  {selected.student_gender === 'male' ? ' · Masculin' : selected.student_gender === 'female' ? ' · Féminin' : ''}
                </p>
              </div>
              <button type="button" aria-label="Fermer la fiche" onClick={closeRequest} disabled={saving || resolving}
                className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 hover:bg-slate-200">✕</button>
            </header>
            <div className="grid shrink-0 gap-x-6 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs sm:grid-cols-2 sm:px-6">
              <p className="min-w-0"><span className="text-slate-500">Responsable : </span><strong>{selected.guardian_full_name}</strong>
                <span className="text-slate-500"> · {selected.guardian_relationship === 'father' ? 'Père' : selected.guardian_relationship === 'mother' ? 'Mère' : 'Tuteur'}</span></p>
              <p><span className="text-slate-500">Téléphone : </span>
                <a className="font-bold text-blue-700 underline" href={'tel:' + selected.guardian_phone.replace(/[^+\d]/g, '')}>{selected.guardian_phone}</a></p>
              <p className="min-w-0 break-words"><span className="text-slate-500">E-mail parent : </span>{selected.guardian_email || 'Non renseigné'}</p>
              <p><span className="text-slate-500">Accès : </span><strong>{noEmailAccess ? 'Apprenant sans e-mail' : 'Compte classique'}</strong></p>
            </div>
            <nav aria-label="Étapes du dossier" className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3 sm:px-6">
              {noEmailAccess && <button type="button" onClick={() => setActiveTab('access')} aria-current={currentTab === 'access' ? 'step' : undefined}
                className={currentTab === 'access' ? 'shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white' : 'shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700'}>
                1. Accès Apprenant</button>}
              <button type="button" onClick={() => setActiveTab('family')} aria-current={currentTab === 'family' ? 'step' : undefined}
                className={currentTab === 'family' ? 'shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white' : 'shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700'}>
                {noEmailAccess ? '2. Famille & finalisation' : 'Famille & finalisation'}</button>
              <button type="button" onClick={() => setActiveTab('details')} aria-current={currentTab === 'details' ? 'step' : undefined}
                className={currentTab === 'details' ? 'shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white' : 'shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700'}>
                Dossier & suivi</button>
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
              <div className={currentTab === 'access' ? 'block' : 'hidden'} aria-hidden={currentTab !== 'access'}>
                <AdminStudentNoEmailPanel request={selected} />
              </div>
              <div className={currentTab === 'family' ? 'block' : 'hidden'} aria-hidden={currentTab !== 'family'}>
                <AdminRequestResolutionPanel key={selected.id} request={selected}
                  disabled={Boolean(user?.isDemo)} onFinalized={handleFinalized} onBusyChange={setResolving} />
              </div>
              <div className={currentTab === 'details' ? 'space-y-3' : 'hidden'} aria-hidden={currentTab !== 'details'}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="font-bold text-slate-900">Informations complémentaires</p>
                  <p className="mt-2 text-slate-600">E-mail Apprenant : {selected.student_email || 'Aucun e-mail personnel'}</p>
                  <p className="mt-1 text-slate-600">Date : {displayDate(selected.submitted_at)}</p>
                  <p className="mt-1 text-slate-600">Observations : {selected.message || 'Aucune'}</p>
                </div>
                <details className="rounded-xl border border-slate-200">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">Note interne de suivi</summary>
                  <div className="border-t border-slate-100 p-4">
                    <label className="block text-sm font-semibold text-slate-700">Note administrative
                      <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000}
                        className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" />
                    </label>
                  </div>
                </details>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-blue-700">
                  <Link className="underline" to="/app/admin/users">Utilisateurs</Link>
                  <Link className="underline" to="/app/admin/enrollments">Inscriptions & affectations</Link>
                </div>
              </div>
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
              <button type="button" onClick={closeRequest} disabled={saving || resolving}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">Fermer</button>
              {selected.status !== 'processed' ? <>
                <button type="button" onClick={() => void review('rejected')} disabled={saving || resolving}
                  className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Refuser</button>
                <button type="button" onClick={() => void review('contacted')} disabled={saving || resolving}
                  className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-bold text-amber-700">Famille contactée</button>
              </> : <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Traité</span>}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
