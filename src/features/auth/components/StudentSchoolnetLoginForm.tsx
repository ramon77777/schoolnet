import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDefaultPathByRole } from '@/lib/auth';
import { signInWithSchoolnetStudent } from '@/lib/studentSchoolnetAuth';
import { validateStudentLoginPreview } from '@/lib/studentLoginPreviewValidation';

export default function StudentSchoolnetLoginForm({ preview = false }: { preview?: boolean }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !phone.trim() || !schoolCode.trim() || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (preview) {
        // Only client-side formatting checks, never Auth, RPC or navigation.
        // This mode is automatically disabled in Vite production builds.
        validateStudentLoginPreview({ phone, studentCode: schoolCode, password });
        setPassword('');
        setNotice("Formulaire de demonstration valide. Aucune connexion et aucune modification Supabase n'ont ete effectuees.");
        return;
      }
      const user = await signInWithSchoolnetStudent(phone, schoolCode, password);
      setPassword('');
      navigate(getDefaultPathByRole(user.role), {replace:true});
    } catch {
      setError(preview
        ? "Verification locale impossible : controlez le telephone, le code SCHOOLNET et un mot de passe fictif de 12 caracteres minimum."
        : "Connexion impossible. Verifiez vos identifiants ou contactez votre etablissement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      {preview && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Previsualisation locale : saisissez uniquement des donnees fictives. Aucune authentification reelle n'est effectuee.
        </div>
      )}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-slate-700">
        <div className="font-bold text-indigo-800">Espace Apprenant — sans e-mail personnel</div>
        <p className="mt-1">Utilisez le téléphone familial, votre identifiant SCHOOLNET personnel et votre mot de passe.</p>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Téléphone familial</span>
        <input type="tel" inputMode="tel" autoComplete="tel" required disabled={busy}
          value={phone} maxLength={64} onChange={(event) => setPhone(event.target.value)}
          placeholder="07 12 34 56 78"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Identifiant SCHOOLNET</span>
        <input type="text" autoComplete="username" autoCapitalize="characters" spellCheck={false}
          maxLength={60} required disabled={busy} value={schoolCode}
          onChange={(event) => setSchoolCode(event.target.value.toUpperCase())}
          placeholder="SN-XXXX-XXXX-XXXX"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium tracking-wider outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Mot de passe personnel</span>
        <div className="relative">
          <input type={revealPassword ? 'text' : 'password'} autoComplete="current-password"
            required disabled={busy} maxLength={256} value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Votre mot de passe"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-24 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          <button type="button" disabled={busy} onClick={() => setRevealPassword((value) => !value)}
            className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            aria-label={revealPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
            {revealPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>
      </label>
      <p className="text-right text-xs leading-5 text-slate-500">
        Code oublié ou première connexion ? Demandez un lien personnel à l'administration. Le parent ne doit pas communiquer son propre mot de passe.
      </p>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
      <button type="submit" disabled={busy || !phone.trim() || !schoolCode.trim() || !password}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Verification...' : preview ? 'Verifier le formulaire (sans connexion)' : 'Acceder a mon espace Apprenant'}
      </button>
      <div className="text-center text-sm text-slate-600">
        <Link to="/inscription" className="font-semibold text-blue-700 hover:underline">
          Demander une inscription
        </Link>
      </div>
    </form>
  );
}
