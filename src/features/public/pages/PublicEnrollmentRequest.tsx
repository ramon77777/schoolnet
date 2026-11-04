import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import studentBanner from '@/assets/public/enrollment/students-banner.png';
import booksBanner from '@/assets/public/enrollment/books-banner.png';
import './schoolnet-enrollment.css';

type RequestType = 'student_enrollment' | 'parent_access';
type TurnstileApi = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string | number;
  remove: (widget: string | number) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const LEVELS = [
  'Petite section', 'Moyenne section', 'Grande section',
  'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2',
  '6e', '5e', '4e', '3e', 'Seconde', 'Premiere', 'Terminale',
];

const EMPTY_FORM = {
  student_full_name: '',
  student_gender: '',
  requested_level: '',
  student_email: '',
  guardian_full_name: '',
  guardian_relationship: '',
  guardian_phone: '',
  guardian_email: '',
  message: '',
};

type FormKey = keyof typeof EMPTY_FORM;

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
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Le formulaire est en cours de configuration. Les demandes ne peuvent pas encore &ecirc;tre envoy&eacute;es.
    </p>;
  }
  return <div ref={elementRef} aria-label="Vérification anti-robot" />;
}

export default function PublicEnrollmentRequest() {
  const [requestType, setRequestType] = useState<RequestType>('student_enrollment');
  const [form, setForm] = useState(EMPTY_FORM);
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const onCaptchaToken = useRef((value: string) => setToken(value)).current;
  const isStudentRequest = requestType === 'student_enrollment';

  const update = (key: FormKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  function chooseType(type: RequestType) {
    if (saving || type === requestType) return;
    setRequestType(type);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed || !token || !SITE_KEY || saving) return;

    const guardianEmail = form.guardian_email.trim().toLowerCase();
    const studentEmail = form.student_email.trim().toLowerCase();
    if (isStudentRequest && studentEmail && guardianEmail === studentEmail) {
      setError('Pour deux comptes distincts, l\'adresse e-mail de l\'apprenant doit être différente de celle du parent.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        request_type: requestType,
        guardian_email: guardianEmail,
        student_email: isStudentRequest ? studentEmail : null,
        student_gender: isStudentRequest ? form.student_gender : null,
        requested_level: isStudentRequest ? form.requested_level : null,
        consent: true,
        captcha_token: token,
      };
      const { data, error: requestError } = await supabase.functions.invoke(
        'public-enrollment-request',
        { body: payload },
      );
      if (requestError || data?.success !== true || typeof data?.reference !== 'string') {
        throw new Error(typeof data?.error === 'string' ? data.error :
          requestError?.message ?? 'Impossible de transmettre la demande.');
      }
      setReference(data.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.');
      setToken('');
      // Every Turnstile response is one-time-use, including unsuccessful submissions.
      setCaptchaNonce((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'sn-enroll-input';
  const labelClass = 'sn-enroll-label';

  return (
    <section className="sn-enroll-page">
      <div className="sn-enroll-hero">
        <div className="sn-enroll-hero-content">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">SCHOOLNET &middot; ADMISSION ET COMPTES</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">S'inscrire sur SCHOOLNET</h1>
        <p className="sn-enroll-hero-subtitle">Cr&eacute;ez une demande d'admission pour un enfant ou un acc&egrave;s parent/tuteur, et rejoignez la communaut&eacute; scolaire SCHOOLNET.</p>
        <img className="sn-enroll-hero-illustration" src={studentBanner} alt="Deux apprenants souriants en uniforme scolaire" />
        </div>
      </div>

      <div className="sn-enroll-grid">
        <div className="sn-enroll-form-card">
          {reference ? (
            <div className="py-12 text-center" role="status">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-3xl text-emerald-700">&#10003;</div>
              <h2 className="mt-5 text-2xl font-black text-slate-950">Demande bien re&ccedil;ue</h2>
              <p className="mt-3 leading-7 text-slate-600">
                R&eacute;f&eacute;rence : <strong className="text-slate-900">{reference}</strong>.
                Conservez-la pour vos &eacute;changes avec l'administration.
              </p>
              <p className="mt-3 text-sm text-slate-500">La demande ne cr&eacute;e pas encore de compte ni de lien parent-enfant.</p>
              <Link to="/" className="mt-8 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">Retour &agrave; l'accueil</Link>
            </div>
          ) : (
            <form className="sn-enroll-form" onSubmit={(event) => void submit(event)}>
              <fieldset className="sn-enroll-choices">
                <legend className="sn-enroll-section-lead">Quelle est votre demande ?</legend>
                <div className="sn-enroll-choice-grid">
                  <button type="button" aria-pressed={isStudentRequest} onClick={() => chooseType('student_enrollment')}
                    className="sn-enroll-option sn-enroll-option-student">
                    <span className="sn-enroll-option-title">Inscrire un apprenant</span>
                    <span className="sn-enroll-option-description">Demander l'admission d'un enfant &agrave; SCHOOLNET.</span>
                  </button>
                  <button type="button" aria-pressed={!isStudentRequest} onClick={() => chooseType('parent_access')}
                    className="sn-enroll-option sn-enroll-option-parent">
                    <span className="sn-enroll-option-title">Acc&egrave;s parent / tuteur</span>
                    <span className="sn-enroll-option-description">Demander un compte pour suivre un enfant d&eacute;j&agrave; inscrit.</span>
                  </button>
                </div>
              </fieldset>

              <div className="sn-enroll-section-heading">
                <h2 className="sn-enroll-section-title">
                  {isStudentRequest ? "Informations de l'apprenant" : "Identifier l'enfant concern\u00e9"}
                </h2>
                <p className="sn-enroll-section-description">Les champs marqu&eacute;s d'un * sont obligatoires.</p>
              </div>

              <label className={labelClass}>{isStudentRequest ? "Nom et pr\u00e9noms de l'apprenant *" : "Nom et pr\u00e9noms de l'enfant d\u00e9j\u00e0 inscrit *"}
                <input className={inputClass} required minLength={3} maxLength={160} autoComplete="off"
                  value={form.student_full_name} onChange={(e) => update('student_full_name', e.target.value)} placeholder="Ex. : Amani Koffi" />
              </label>

              {isStudentRequest ? (
                <>
                  <div className="sn-enroll-two-cols">
                    <label className={labelClass}>Genre *
                      <select className={inputClass} required value={form.student_gender} onChange={(e) => update('student_gender', e.target.value)}>
                        <option value="">S&eacute;lectionner le genre</option><option value="male">Masculin</option><option value="female">F&eacute;minin</option>
                      </select>
                    </label>
                    <label className={labelClass}>Niveau souhait&eacute; *
                      <select className={inputClass} required value={form.requested_level} onChange={(e) => update('requested_level', e.target.value)}>
                        <option value="">S&eacute;lectionner le niveau</option>
                        {LEVELS.map((level) => <option key={level} value={level}>{level === 'Premiere' ? 'Première' : level}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className={labelClass}>E-mail personnel de l'apprenant (si disponible)
                    <input className={inputClass} type="email" autoComplete="off" maxLength={254} value={form.student_email}
                      onChange={(e) => update('student_email', e.target.value)} placeholder="eleve@exemple.com" />
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                      Facultatif pour un mineur sans adresse personnelle. Cet e-mail devra &ecirc;tre unique si un compte apprenant lui est cr&eacute;&eacute;.
                    </span>
                  </label>
                </>
              ) : (
                <p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  Cette demande servira &agrave; v&eacute;rifier votre lien avec un enfant d&eacute;j&agrave; connu de SCHOOLNET.
                  Elle ne vous donne pas automatiquement acc&egrave;s &agrave; ses informations scolaires.
                </p>
              )}

              <div className="sn-enroll-section-heading">
                <h2 className="sn-enroll-section-title">Informations du parent ou tuteur</h2>
                <p className="sn-enroll-section-description">Le responsable fournit sa propre adresse e-mail pour &ecirc;tre contact&eacute; et activer son compte apr&egrave;s validation.</p>
              </div>
              <label className={labelClass}>Nom et pr&eacute;noms du parent / tuteur *
                <input className={inputClass} required minLength={3} maxLength={160} autoComplete="name"
                  value={form.guardian_full_name} onChange={(e) => update('guardian_full_name', e.target.value)} placeholder="Ex. : Mariam Kouadio" />
              </label>
              <div className="sn-enroll-two-cols">
                <label className={labelClass}>Lien avec l'enfant *
                  <select className={inputClass} required value={form.guardian_relationship} onChange={(e) => update('guardian_relationship', e.target.value)}>
                    <option value="">S&eacute;lectionner le lien</option><option value="mother">M&egrave;re</option><option value="father">P&egrave;re</option><option value="guardian">Tuteur / Tutrice</option>
                  </select>
                </label>
                <label className={labelClass}>T&eacute;l&eacute;phone *
                  <input className={inputClass} required type="tel" minLength={8} maxLength={30} autoComplete="tel"
                    value={form.guardian_phone} onChange={(e) => update('guardian_phone', e.target.value)} placeholder="+225 07 00 00 00 00" />
                </label>
              </div>
              <label className={labelClass}>Adresse e-mail personnelle du parent / tuteur *
                <input className={inputClass} required type="email" autoComplete="email" maxLength={254} value={form.guardian_email}
                  onChange={(e) => update('guardian_email', e.target.value)} placeholder="parent@exemple.com" />
              </label>
              <label className={labelClass}>Informations compl&eacute;mentaires (facultatif)
                <textarea className={`${inputClass} sn-enroll-textarea`} maxLength={1000} value={form.message}
                  onChange={(e) => update('message', e.target.value)} placeholder="Précisez toute information utile pour l'administration..." />
              </label>
              <div className="sn-enroll-note">
                Le formulaire transmet uniquement une demande. Apr&egrave;s v&eacute;rification, l'administration utilise les adresses e-mail fournies pour cr&eacute;er les comptes autoris&eacute;s.
              </div>
              <label className="sn-enroll-consent">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-600" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>Je confirme &ecirc;tre parent ou tuteur habilit&eacute; et j'autorise SCHOOLNET &agrave; utiliser ces informations pour examiner ma demande.</span>
              </label>
              <Captcha key={captchaNonce} onToken={onCaptchaToken} />
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
              <div className="sn-enroll-actions">
                <Link to="/" className="sn-enroll-cancel">Annuler</Link>
                <button type="submit" disabled={saving || !SITE_KEY || !token || !agreed}
                  className="sn-enroll-send">
                  {saving ? 'Envoi en cours...' : 'Envoyer ma demande'}
                </button>
              </div>
            </form>
          )}
        </div>
        <aside className="sn-enroll-aside">
          <div className="sn-enroll-steps">
          <h2 className="sn-enroll-step-title">Et ensuite ?</h2>
          <ol className="sn-enroll-step-list">
            <li><strong className="text-blue-700">Envoi</strong> le responsable transmet sa demande.</li>
            <li><strong className="text-blue-700">V&eacute;rification</strong> l'administration contacte la famille et v&eacute;rifie le lien avec l'enfant.</li>
            <li><strong className="text-blue-700">Acc&egrave;s</strong> apr&egrave;s validation, les comptes autoris&eacute;s sont cr&eacute;&eacute;s avec les e-mails fournis.</li>
          </ol>
          <div className="sn-enroll-step-footer">
            D&eacute;j&agrave; un compte ? <Link to="/auth/login" className="font-bold text-blue-700 underline-offset-4 hover:underline">Se connecter</Link>
          </div>
          </div>
          <div className="sn-enroll-benefits">
            <img className="sn-enroll-books" src={booksBanner} alt="Livres scolaires et chapeau de diplome" />
            <h2>Pourquoi SCHOOLNET ?</h2>
            <ul>
              <li>Un suivi scolaire simple et transparent</li>
              <li>Un espace s&eacute;curis&eacute; pour les familles</li>
              <li>Une communication facilit&eacute;e avec l'&eacute;tablissement</li>
              <li>Un acc&egrave;s aux ressources p&eacute;dagogiques</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
