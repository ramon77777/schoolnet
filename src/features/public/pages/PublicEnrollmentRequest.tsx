import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

type TurnstileApi = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string | number;
  remove: (widget: string | number) => void;
  reset: (widget: string | number) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

const levels = [
  'Petite section', 'Moyenne section', 'Grande section',
  'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2',
  '6e', '5e', '4e', '3e', 'Seconde', 'Premiere', 'Terminale',
];

const emptyForm = {
  student_full_name: '', student_gender: '', requested_level: '',
  guardian_full_name: '', guardian_relationship: '',
  guardian_phone: '', guardian_email: '', message: '',
};

function Captcha({ onToken }: { onToken: (value: string) => void }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    const draw = () => {
      if (cancelled || !elementRef.current || !window.turnstile || widgetRef.current !== null) return;
      widgetRef.current = window.turnstile.render(elementRef.current, {
        sitekey: SITE_KEY,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-schoolnet-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-schoolnet-turnstile', 'true');
      document.head.appendChild(script);
    }
    script.addEventListener('load', draw);
    draw();
    return () => {
      cancelled = true;
      script?.removeEventListener('load', draw);
      if (widgetRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [onToken]);

  if (!SITE_KEY) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Le formulaire est en cours de configuration. Les demandes ne peuvent pas encore &ecirc;tre envoy&eacute;es.
    </p>;
  }
  return <div ref={elementRef} aria-label="Verification anti-robot" />;
}

export default function PublicEnrollmentRequest() {
  const [form, setForm] = useState(emptyForm);
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // Stable callback prevents re-creating the captcha every time the user types.
  const onCaptchaToken = useRef((value: string) => setToken(value)).current;
  const update = (key: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed || !token || !SITE_KEY || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: requestError } = await supabase.functions.invoke(
        'public-enrollment-request',
        { body: { ...form, consent: true, captcha_token: token } },
      );
      if (requestError || data?.success !== true || typeof data?.reference !== 'string') {
        throw new Error(typeof data?.error === 'string' ? data.error :
          requestError?.message ?? 'Impossible de transmettre la demande.');
      }
      setReference(data.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.');
      setToken('');
      // A challenge token is one-time-use; mount a fresh challenge after failure.
      setCaptchaNonce((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';
  const labelClass = 'block text-sm font-semibold text-slate-700';

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-9 rounded-[2rem] bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 p-8 text-white shadow-xl sm:p-12">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">SchoolNet &middot; Admission</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Demander une inscription</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-blue-100">
          Un parent ou tuteur remplit ce formulaire en quelques minutes. Notre &eacute;quipe v&eacute;rifie ensuite la demande et accompagne la famille pour finaliser l'inscription.
        </p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          {reference ? (
            <div className="py-12 text-center" role="status">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-3xl text-emerald-700">&#10003;</div>
              <h2 className="mt-5 text-2xl font-black">Demande bien re&ccedil;ue</h2>
              <p className="mt-3 leading-7 text-slate-600">
                Votre demande porte la r&eacute;f&eacute;rence <strong className="text-slate-900">{reference}</strong>. Conservez-la pour vos &eacute;changes avec l'administration.
              </p>
              <p className="mt-3 text-sm text-slate-500">Cette confirmation ne constitue pas encore une inscription d&eacute;finitive.</p>
              <Link to="/" className="mt-8 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">Retour &agrave; l'accueil</Link>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-7">
              <div>
                <h2 className="text-xl font-black text-slate-950">Informations de l'apprenant</h2>
                <p className="mt-1 text-sm text-slate-500">Champs marqu&eacute;s d'un * obligatoires.</p>
              </div>
              <label className={labelClass}>Nom et pr&eacute;noms de l'apprenant *
                <input className={inputClass} required minLength={3} maxLength={160} autoComplete="off"
                  value={form.student_full_name} onChange={(e) => update('student_full_name', e.target.value)} placeholder="Nom et pr&eacute;noms" />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={labelClass}>Genre *
                  <select className={inputClass} required value={form.student_gender} onChange={(e) => update('student_gender', e.target.value)}>
                    <option value="">S&eacute;lectionner</option><option value="male">Masculin</option><option value="female">F&eacute;minin</option>
                  </select>
                </label>
                <label className={labelClass}>Niveau souhait&eacute; *
                  <select className={inputClass} required value={form.requested_level} onChange={(e) => update('requested_level', e.target.value)}>
                    <option value="">S&eacute;lectionner le niveau</option>
                    {levels.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
              </div>
              <div className="border-t border-slate-100 pt-6">
                <h2 className="text-xl font-black text-slate-950">Parent ou tuteur</h2>
                <p className="mt-1 text-sm text-slate-500">La demande doit &ecirc;tre d&eacute;pos&eacute;e par une personne responsable de l'apprenant.</p>
              </div>
              <label className={labelClass}>Nom et pr&eacute;noms du responsable *
                <input className={inputClass} required minLength={3} maxLength={160} autoComplete="name" value={form.guardian_full_name}
                  onChange={(e) => update('guardian_full_name', e.target.value)} />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={labelClass}>Lien avec l'apprenant *
                  <select className={inputClass} required value={form.guardian_relationship} onChange={(e) => update('guardian_relationship', e.target.value)}>
                    <option value="">S&eacute;lectionner</option><option value="mother">M&egrave;re</option><option value="father">P&egrave;re</option><option value="guardian">Tuteur / Tutrice</option>
                  </select>
                </label>
                <label className={labelClass}>T&eacute;l&eacute;phone *
                  <input className={inputClass} required type="tel" minLength={8} maxLength={30} autoComplete="tel"
                    value={form.guardian_phone} onChange={(e) => update('guardian_phone', e.target.value)} placeholder="+225 ..." />
                </label>
              </div>
              <label className={labelClass}>Adresse e-mail (facultatif)
                <input className={inputClass} type="email" maxLength={254} autoComplete="email" value={form.guardian_email}
                  onChange={(e) => update('guardian_email', e.target.value)} placeholder="exemple@domaine.com" />
              </label>
              <label className={labelClass}>Pr&eacute;cisions utiles (facultatif)
                <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={1000} value={form.message}
                  onChange={(e) => update('message', e.target.value)} placeholder="Votre question ou des informations utiles..." />
              </label>
              <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                La demande ne cr&eacute;e pas automatiquement de compte et n'affecte pas encore l'enfant &agrave; une classe.
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-600">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-600" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>Je suis parent ou tuteur habilit&eacute; et j'autorise SCHOOLNET &agrave; utiliser ces informations uniquement pour traiter cette demande d'inscription.</span>
              </label>
              <Captcha key={captchaNonce} onToken={onCaptchaToken} />
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6">
                <Link to="/" className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Annuler</Link>
                <button type="submit" disabled={saving || !SITE_KEY || !token || !agreed}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? 'Envoi...' : 'Envoyer ma demande'}
                </button>
              </div>
            </form>
          )}
        </div>
        <aside className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Et ensuite ?</h2>
          <ol className="mt-5 space-y-5 text-sm leading-7 text-slate-600">
            <li><strong className="text-blue-700">1. Envoi :</strong> le parent transmet sa demande.</li>
            <li><strong className="text-blue-700">2. V&eacute;rification :</strong> l'administration prend contact et contr&ocirc;le les informations.</li>
            <li><strong className="text-blue-700">3. Inscription :</strong> apr&egrave;s validation, le compte et le dossier sont cr&eacute;&eacute;s.</li>
          </ol>
          <div className="mt-7 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-600">
            D&eacute;j&agrave; inscrit ? <Link to="/auth/login" className="font-bold text-blue-700 underline-offset-4 hover:underline">Se connecter</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
