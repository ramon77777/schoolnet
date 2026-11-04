import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  class_name: string | null;
  avatar_url: string | null;
};

type Alert = {
  kind: "success" | "error" | "info";
  message: string;
};

const AVATAR_BUCKET = "schoolnet-profile-avatars";
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const AVATAR_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const inputClasses =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
const primaryButtonClasses =
  "rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClasses =
  "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function roleLabel(role: string) {
  if (role === "student") return "Apprenant";
  if (role === "teacher") return "Enseignant";
  if (role === "parent") return "Parent / Tuteur";
  if (role === "admin") return "Administrateur";
  return role || "Compte scolaire";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "SN";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}

export default function MyProfile() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "personal" | "email" | "password" | "avatar">(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const realUserId = user && !user.isDemo ? user.id : null;

  const fetchMyProfile = useCallback(async () => {
    if (!realUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setAlert(null);

      const [profileResult, authResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, role, class_name, avatar_url")
          .eq("id", realUserId)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (authResult.error) throw authResult.error;

      const current = profileResult.data as ProfileRow;
      setProfile(current);
      setFullName(current.full_name ?? "");
      setPhone(current.phone ?? "");
      setEmail(authResult.data.user?.email ?? user?.email ?? "");

      const path = current.avatar_url?.trim() || null;
      if (!path) {
        setAvatarUrl(null);
      } else if (/^https:\/\//i.test(path)) {
        // Compatibilite avec d'eventuelles anciennes photos stockees sous forme d'URL.
        setAvatarUrl(path);
      } else if (path.startsWith(`${realUserId}/`)) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(path, 3600);
        if (error) {
          console.warn("[MyProfile] Avatar non accessible :", error.message);
          setAvatarUrl(null);
        } else {
          setAvatarUrl(data.signedUrl);
        }
      } else {
        setAvatarUrl(null);
      }
    } catch (error) {
      setAlert({ kind: "error", message: readableError(error) });
    } finally {
      setLoading(false);
    }
  }, [realUserId, user?.email]);

  useEffect(() => {
    void fetchMyProfile();
  }, [fetchMyProfile]);

  async function savePersonal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!realUserId || busy) return;
    if (fullName.trim().length < 2 || fullName.trim().length > 150) {
      setAlert({ kind: "error", message: "Le nom doit contenir entre 2 et 150 caractères." });
      return;
    }
    if (phone.trim().length > 30) {
      setAlert({ kind: "error", message: "Le numéro de téléphone est trop long." });
      return;
    }

    try {
      setBusy("personal");
      setAlert(null);
      const { error } = await supabase.rpc("update_my_personal_profile", {
        p_full_name: fullName.trim(),
        p_phone: phone.trim() || null,
      });
      if (error) throw error;
      setProfile((before) => before ? {
        ...before,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      } : before);
      // Le fournisseur Auth existant recharge le nom lors de TOKEN_REFRESHED.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) console.warn("[MyProfile] Session non rafraichie :", refreshError.message);
      setAlert({ kind: "success", message: "Vos informations ont été enregistrées." });
    } catch (error) {
      setAlert({ kind: "error", message: readableError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!realUserId || busy) return;
    const candidate = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      setAlert({ kind: "error", message: "Veuillez saisir une adresse e-mail valide." });
      return;
    }
    if (candidate === email.trim().toLowerCase()) {
      setAlert({ kind: "info", message: "Cette adresse est déjà celle de votre compte." });
      return;
    }

    try {
      setBusy("email");
      setAlert(null);
      const { error } = await supabase.auth.updateUser({ email: candidate });
      if (error) throw error;
      setNewEmail("");
      setAlert({
        kind: "success",
        message: "Demande enregistrée. Vérifiez les e-mails de confirmation envoyés par Supabase avant de considérer le changement comme effectif.",
      });
    } catch (error) {
      setAlert({ kind: "error", message: readableError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!realUserId || busy) return;
    if (newPassword.length < 10) {
      setAlert({ kind: "error", message: "Le nouveau mot de passe doit contenir au moins 10 caractères." });
      return;
    }
    if (newPassword !== repeatPassword) {
      setAlert({ kind: "error", message: "Les deux mots de passe ne correspondent pas." });
      return;
    }

    try {
      setBusy("password");
      setAlert(null);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setRepeatPassword("");
      setAlert({ kind: "success", message: "Votre mot de passe a été modifié." });
    } catch (error) {
      setAlert({ kind: "error", message: `${readableError(error)} Si une réauthentification est demandée, reconnectez-vous et réessayez.` });
    } finally {
      setBusy(null);
    }
  }

  async function uploadAvatar(file: File) {
    if (!realUserId || busy) return;
    const extension = AVATAR_EXT[file.type];
    if (!extension) {
      setAlert({ kind: "error", message: "Utilisez une photo PNG, JPEG ou WebP." });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAlert({ kind: "error", message: "La photo ne doit pas dépasser 3 Mo." });
      return;
    }

    const path = `${realUserId}/${crypto.randomUUID()}.${extension}`;
    let uploaded = false;
    const oldPath = profile?.avatar_url;
    try {
      setBusy("avatar");
      setAlert(null);
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;

      const { error: dbError } = await supabase.rpc("set_my_profile_avatar", {
        p_avatar_path: path,
      });
      if (dbError) throw dbError;
      uploaded = false; // Le fichier est desormais reference par le profil.
      setProfile((before) => before ? { ...before, avatar_url: path } : before);

      const { data, error: signedError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, 3600);
      if (signedError) {
        setAvatarUrl(null);
        setAlert({ kind: "info", message: "Photo enregistrée ; actualisez la page pour l'afficher." });
      } else {
        setAvatarUrl(data.signedUrl);
        setAlert({ kind: "success", message: "Votre photo de profil a été mise à jour." });
      }

      if (oldPath?.startsWith(`${realUserId}/`) && oldPath !== path) {
        const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
        if (cleanupError) console.warn("[MyProfile] Ancienne photo à nettoyer :", cleanupError.message);
      }
    } catch (error) {
      if (uploaded) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      }
      setAlert({ kind: "error", message: readableError(error) });
    } finally {
      setBusy(null);
    }
  }

  function onAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadAvatar(file);
  }

  async function removeAvatar() {
    if (!realUserId || busy || !profile?.avatar_url) return;
    const previousPath = profile.avatar_url;
    try {
      setBusy("avatar");
      setAlert(null);
      const { error } = await supabase.rpc("set_my_profile_avatar", {
        p_avatar_path: null,
      });
      if (error) throw error;
      setAvatarUrl(null);
      setProfile((before) => before ? { ...before, avatar_url: null } : before);
      if (previousPath.startsWith(`${realUserId}/`)) {
        const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
        if (cleanupError) console.warn("[MyProfile] Photo à nettoyer :", cleanupError.message);
      }
      setAlert({ kind: "success", message: "Votre photo a été retirée." });
    } catch (error) {
      setAlert({ kind: "error", message: readableError(error) });
    } finally {
      setBusy(null);
    }
  }

  if (!user) return null;
  if (user.isDemo) {
    return (
      <section className="sn-card p-6">
        <h1 className="text-xl font-black text-slate-950">Mon profil</h1>
        <p className="mt-2 text-sm text-slate-600">Connectez-vous avec un compte réel pour modifier vos informations personnelles. Le mode démonstration est en lecture seule.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="sn-card overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">SCHOOLNET • Espace personnel</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Mon profil</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Gérez vos coordonnées, votre photo et la sécurité de votre compte. Vos droits scolaires restent protégés.</p>
        </div>
      </header>

      {alert && (
        <div
          role="status"
          className={`rounded-2xl border px-5 py-4 text-sm ${
            alert.kind === "error" ? "border-red-200 bg-red-50 text-red-800"
              : alert.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {alert.message}
        </div>
      )}

      {loading ? (
        <div className="sn-card p-8 text-sm text-slate-500">Chargement de votre profil…</div>
      ) : !profile ? (
        <div className="sn-card space-y-4 p-6">
          <p className="text-sm text-slate-700">Impossible de récupérer le profil de ce compte.</p>
          <button type="button" className={secondaryButtonClasses} onClick={() => void fetchMyProfile()}>Réessayer</button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
            <section className="sn-card p-5 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-blue-100 text-2xl font-black text-blue-700 ring-4 ring-blue-50">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Votre photo de profil" className="h-full w-full object-cover" />
                  ) : (
                    initials(profile.full_name || email || "Schoolnet")
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-xl font-black text-slate-950">{profile.full_name || "Utilisateur SCHOOLNET"}</h2>
                  <p className="mt-1 break-all text-sm text-slate-500">{email || "Adresse e-mail non renseignée"}</p>
                  <span className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{roleLabel(profile.role)}</span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  aria-label="Sélectionner une photo"
                  onChange={onAvatarSelected}
                  disabled={busy !== null}
                />
                <button type="button" className={secondaryButtonClasses} disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
                  {busy === "avatar" ? "Traitement…" : "📷 Changer la photo"}
                </button>
                {profile.avatar_url && (
                  <button type="button" className={secondaryButtonClasses} disabled={busy !== null} onClick={() => void removeAvatar()}>Retirer la photo</button>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">PNG, JPEG ou WebP • 3 Mo maximum • Photo conservée dans un espace privé.</p>
            </section>

            <aside className="sn-card p-5 sm:p-7">
              <h2 className="text-lg font-black text-slate-950">Mon accès SCHOOLNET</h2>
              <div className="mt-5 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rôle</p>
                  <p className="mt-1 font-semibold text-slate-800">{roleLabel(profile.role)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Classe courante</p>
                  <p className="mt-1 font-semibold text-slate-800">{profile.class_name || "Non applicable ou non renseignée"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  Pour protéger les dossiers scolaires, le rôle, les classes et les liens parent-enfant sont gérés uniquement par les personnes autorisées.
                </div>
              </div>
            </aside>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="sn-card p-5 sm:p-7">
              <h2 className="text-lg font-black text-slate-950">Informations personnelles</h2>
              <p className="mt-2 text-sm text-slate-500">Ces changements s'appliquent uniquement à votre propre profil.</p>
              <form className="mt-6 space-y-4" onSubmit={(event) => void savePersonal(event)}>
                <div>
                  <label htmlFor="my-profile-name" className="mb-2 block text-sm font-semibold text-slate-700">Nom complet *</label>
                  <input id="my-profile-name" className={inputClasses} value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} required disabled={busy !== null} />
                </div>
                <div>
                  <label htmlFor="my-profile-phone" className="mb-2 block text-sm font-semibold text-slate-700">Téléphone</label>
                  <input id="my-profile-phone" type="tel" autoComplete="tel" className={inputClasses} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} placeholder="+225 …" disabled={busy !== null} />
                </div>
                <button type="submit" className={primaryButtonClasses} disabled={busy !== null}>
                  {busy === "personal" ? "Enregistrement…" : "Enregistrer mes informations"}
                </button>
              </form>
            </section>

            <section className="sn-card p-5 sm:p-7">
              <h2 className="text-lg font-black text-slate-950">Adresse e-mail</h2>
              <p className="mt-2 text-sm text-slate-500">Le changement peut nécessiter la confirmation de l'ancienne et de la nouvelle adresse.</p>
              <form className="mt-6 space-y-4" onSubmit={(event) => void requestEmailChange(event)}>
                <div>
                  <label htmlFor="my-profile-current-email" className="mb-2 block text-sm font-semibold text-slate-700">Adresse actuelle</label>
                  <input id="my-profile-current-email" type="email" className={inputClasses} value={email} disabled readOnly />
                </div>
                <div>
                  <label htmlFor="my-profile-new-email" className="mb-2 block text-sm font-semibold text-slate-700">Nouvelle adresse e-mail</label>
                  <input id="my-profile-new-email" type="email" autoComplete="email" className={inputClasses} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="exemple@domaine.com" disabled={busy !== null} required />
                </div>
                <button type="submit" className={primaryButtonClasses} disabled={busy !== null}>
                  {busy === "email" ? "Demande en cours…" : "Demander le changement"}
                </button>
              </form>
            </section>

            <section className="sn-card p-5 sm:p-7 xl:col-span-2">
              <h2 className="text-lg font-black text-slate-950">Sécurité du compte</h2>
              <p className="mt-2 text-sm text-slate-500">Choisissez un mot de passe unique et difficile à deviner. Ne le communiquez à personne.</p>
              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void savePassword(event)}>
                <div>
                  <label htmlFor="my-profile-password" className="mb-2 block text-sm font-semibold text-slate-700">Nouveau mot de passe</label>
                  <input id="my-profile-password" type="password" autoComplete="new-password" className={inputClasses} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required disabled={busy !== null} />
                </div>
                <div>
                  <label htmlFor="my-profile-repeat-password" className="mb-2 block text-sm font-semibold text-slate-700">Confirmer le mot de passe</label>
                  <input id="my-profile-repeat-password" type="password" autoComplete="new-password" className={inputClasses} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} minLength={10} required disabled={busy !== null} />
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className={primaryButtonClasses} disabled={busy !== null}>
                    {busy === "password" ? "Mise à jour…" : "Modifier mon mot de passe"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
