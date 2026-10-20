import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  notifyPlatformSettingsUpdated,
} from "@/lib/platform/usePlatformBranding";

type PlatformSettingsRow = {
  id: number;
  platform_name: string;
  institution_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  logo_url: string | null;
  logo_path: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type SchoolYearRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
};

type SettingsForm = {
  platformName: string;
  institutionName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  logoUrl: string;
};

const EMPTY_FORM: SettingsForm = {
  platformName: "",
  institutionName: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  logoUrl: "",
};

const inputClassName =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

const LOGO_BUCKET = "platform-assets";
const LOGO_MAX_SIZE = 5 * 1024 * 1024;

const LOGO_ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const LOGO_EXTENSION_BY_TYPE: Record<
  string,
  string
> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function settingsRowToForm(
  row: PlatformSettingsRow
): SettingsForm {
  return {
    platformName: row.platform_name ?? "",
    institutionName: row.institution_name ?? "",
    contactEmail: row.contact_email ?? "",
    contactPhone: row.contact_phone ?? "",
    address: row.address ?? "",
    logoUrl: row.logo_url ?? "",
  };
}

function nullableText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function formatDateOnly(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Jamais";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWebUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "SN";
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export default function AdminSettings() {
  const [settingsRow, setSettingsRow] =
    useState<PlatformSettingsRow | null>(null);

  const [currentSchoolYear, setCurrentSchoolYear] =
    useState<SchoolYearRow | null>(null);

  const [form, setForm] =
    useState<SettingsForm>(EMPTY_FORM);

  const [savedForm, setSavedForm] =
    useState<SettingsForm>(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [logoPreviewError, setLogoPreviewError] =
    useState(false);

  const logoInputRef =
    useRef<HTMLInputElement | null>(null);

  const [selectedLogoFile, setSelectedLogoFile] =
    useState<File | null>(null);

  const [selectedLogoPreview, setSelectedLogoPreview] =
    useState<string | null>(null);

  const [removeLogoRequested, setRemoveLogoRequested] =
    useState(false);

  const isDirty = useMemo(
    () =>
      JSON.stringify(form) !==
        JSON.stringify(savedForm) ||
      selectedLogoFile !== null ||
      removeLogoRequested,
    [
      form,
      savedForm,
      selectedLogoFile,
      removeLogoRequested,
    ]
  );

  const loadSettings = useCallback(
    async (manualRefresh = false) => {
      try {
        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);
        setSuccess(null);

        const [
          settingsResult,
          activeSchoolYearResult,
        ] = await Promise.all([
          supabase
            .from("platform_settings")
            .select(
              `
                id,
                platform_name,
                institution_name,
                contact_email,
                contact_phone,
                address,
                logo_url,
                logo_path,
                created_at,
                updated_at,
                updated_by
              `
            )
            .eq("id", 1)
            .single(),

          supabase
            .from("school_years")
            .select(
              `
                id,
                name,
                starts_on,
                ends_on,
                is_current
              `
            )
            .eq("is_current", true)
            .maybeSingle(),
        ]);

        if (settingsResult.error) {
          throw settingsResult.error;
        }

        if (activeSchoolYearResult.error) {
          throw activeSchoolYearResult.error;
        }

        const loadedSettings =
          settingsResult.data as PlatformSettingsRow;

        const loadedForm =
          settingsRowToForm(loadedSettings);

        setSettingsRow(loadedSettings);
        setForm(loadedForm);
        setSavedForm(loadedForm);
        setSelectedLogoFile(null);
        setRemoveLogoRequested(false);
        setLogoPreviewError(false);

        if (logoInputRef.current) {
          logoInputRef.current.value = "";
        }

        setCurrentSchoolYear(
          (activeSchoolYearResult.data ??
            null) as SchoolYearRow | null
        );
      } catch (err) {
        console.error(
          "[AdminSettings] loadSettings error:",
          err
        );

        setError(
          "Impossible de charger les paramètres de SchoolNet. Vérifiez votre session administrateur puis réessayez."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!selectedLogoFile) {
      setSelectedLogoPreview(null);
      return;
    }

    const objectUrl =
      URL.createObjectURL(selectedLogoFile);

    setSelectedLogoPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedLogoFile]);

  useEffect(() => {
    setLogoPreviewError(false);
  }, [
    form.logoUrl,
    selectedLogoPreview,
    removeLogoRequested,
  ]);

  useEffect(() => {
    if (!success) return;

    const timeout = window.setTimeout(() => {
      setSuccess(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [success]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (
      event: BeforeUnloadEvent
    ) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [isDirty]);

  const updateField = <K extends keyof SettingsForm>(
    field: K,
    value: SettingsForm[K]
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearSelectedLogo = () => {
    setSelectedLogoFile(null);

    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const handleLogoFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!LOGO_ALLOWED_TYPES.has(file.type)) {
      setError(
        "Le logo doit être au format PNG, JPEG ou WebP."
      );

      event.target.value = "";
      setSelectedLogoFile(null);
      return;
    }

    if (file.size > LOGO_MAX_SIZE) {
      setError(
        "Le fichier sélectionné dépasse la limite autorisée de 5 Mo."
      );

      event.target.value = "";
      setSelectedLogoFile(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setRemoveLogoRequested(false);
    setSelectedLogoFile(file);
  };

  const handleCancelLogoSelection = () => {
    clearSelectedLogo();
    setRemoveLogoRequested(false);
    setError(null);
    setSuccess(null);
  };

  const handleRemoveLogo = () => {
    clearSelectedLogo();
    setRemoveLogoRequested(true);
    updateField("logoUrl", "");
    setError(null);
    setSuccess(null);
  };

  const handleRefresh = () => {
    if (
      isDirty &&
      !window.confirm(
        "Les modifications non enregistrées seront perdues. Continuer ?"
      )
    ) {
      return;
    }

    void loadSettings(true);
  };

  const handleReset = () => {
    if (!isDirty) return;

    setForm(savedForm);
    setError(null);
    setSuccess(null);
    clearSelectedLogo();
    setRemoveLogoRequested(false);
    setLogoPreviewError(false);
  };

  const handleSave = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (saving || !isDirty) {
      return;
    }

    const platformName = form.platformName.trim();
    const institutionName =
      form.institutionName.trim();
    const contactEmail =
      form.contactEmail.trim().toLowerCase();
    const contactPhone = form.contactPhone.trim();
    const address = form.address.trim();
    const logoUrl = form.logoUrl.trim();

    if (!platformName) {
      setError(
        "Le nom de la plateforme est obligatoire."
      );
      return;
    }

    if (
      contactEmail &&
      !isValidEmail(contactEmail)
    ) {
      setError(
        "L’adresse e-mail de contact n’est pas valide."
      );
      return;
    }

    if (
      !selectedLogoFile &&
      logoUrl &&
      !isValidWebUrl(logoUrl)
    ) {
      setError(
        "L’URL du logo doit commencer par http:// ou https://."
      );
      return;
    }

    if (
      selectedLogoFile &&
      !LOGO_ALLOWED_TYPES.has(selectedLogoFile.type)
    ) {
      setError(
        "Le logo doit être au format PNG, JPEG ou WebP."
      );
      return;
    }

    if (
      selectedLogoFile &&
      selectedLogoFile.size > LOGO_MAX_SIZE
    ) {
      setError(
        "Le fichier sélectionné dépasse la limite autorisée de 5 Mo."
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const previousLogoPath =
        settingsRow?.logo_path ?? null;

      let uploadedLogoPath: string | null = null;

      let nextLogoUrl: string | null =
        nullableText(logoUrl);

      let nextLogoPath: string | null =
        previousLogoPath;

      if (selectedLogoFile) {
        const extension =
          LOGO_EXTENSION_BY_TYPE[
            selectedLogoFile.type
          ];

        const filePath =
          `branding/logo-${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from(LOGO_BUCKET)
            .upload(
              filePath,
              selectedLogoFile,
              {
                cacheControl: "3600",
                contentType:
                  selectedLogoFile.type,
                upsert: false,
              }
            );

        if (uploadError) {
          throw uploadError;
        }

        uploadedLogoPath = filePath;

        const { data: publicUrlData } =
          supabase.storage
            .from(LOGO_BUCKET)
            .getPublicUrl(filePath);

        nextLogoPath = filePath;
        nextLogoUrl =
          `${publicUrlData.publicUrl}?v=${Date.now()}`;
      } else if (
        removeLogoRequested ||
        !nextLogoUrl
      ) {
        nextLogoUrl = null;
        nextLogoPath = null;
      } else if (
        nextLogoUrl !== settingsRow?.logo_url
      ) {
        nextLogoPath = null;
      }

      const { data, error: updateError } =
        await supabase
          .from("platform_settings")
          .update({
            platform_name: platformName,
            institution_name:
              nullableText(institutionName),
            contact_email:
              nullableText(contactEmail),
            contact_phone:
              nullableText(contactPhone),
            address: nullableText(address),
            logo_url: nextLogoUrl,
            logo_path: nextLogoPath,
          })
          .eq("id", 1)
          .select(
            `
              id,
              platform_name,
              institution_name,
              contact_email,
              contact_phone,
              address,
              logo_url,
              logo_path,
              created_at,
              updated_at,
              updated_by
            `
          )
          .single();

      if (updateError) {
        if (uploadedLogoPath) {
          await supabase.storage
            .from(LOGO_BUCKET)
            .remove([uploadedLogoPath]);
        }

        throw updateError;
      }

      const updatedSettings =
        data as PlatformSettingsRow;

      const updatedForm =
        settingsRowToForm(updatedSettings);

      setSettingsRow(updatedSettings);
      setForm(updatedForm);
      setSavedForm(updatedForm);
      notifyPlatformSettingsUpdated();
      clearSelectedLogo();
      setRemoveLogoRequested(false);
      setLogoPreviewError(false);

      if (
        previousLogoPath &&
        previousLogoPath !== nextLogoPath
      ) {
        const { error: cleanupError } =
          await supabase.storage
            .from(LOGO_BUCKET)
            .remove([previousLogoPath]);

        if (cleanupError) {
          console.warn(
            "[AdminSettings] old logo cleanup error:",
            cleanupError
          );
        }
      }

      setSuccess(
        "Les paramètres de SchoolNet ont été enregistrés avec succès."
      );
    } catch (err) {
      console.error(
        "[AdminSettings] handleSave error:",
        err
      );

      setError(
        "Impossible d’enregistrer les paramètres. Vérifiez vos droits administrateur puis réessayez."
      );
    } finally {
      setSaving(false);
    }
  };

  const logoPreviewUrl = selectedLogoFile
    ? selectedLogoPreview ?? ""
    : removeLogoRequested
      ? ""
      : form.logoUrl.trim();

  const displayName =
    form.platformName.trim() || "SchoolNet";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xl font-semibold text-gray-900">
            Paramètres
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Configurez l’identité et les coordonnées
            générales de SchoolNet.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              Modifications non enregistrées
            </span>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || saving}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing
              ? "Actualisation…"
              : "Actualiser"}
          </button>

          <button
            type="submit"
            form="platform-settings-form"
            disabled={
              loading ||
              saving ||
              !isDirty
            }
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Enregistrement…"
              : "Enregistrer"}
          </button>
        </div>
      </div>

      {success && (
        <div className="sn-card border border-emerald-200 bg-emerald-50 p-4">
          <div className="font-semibold text-emerald-800">
            ✅ Opération réussie
          </div>

          <div className="mt-1 text-sm text-emerald-700">
            {success}
          </div>
        </div>
      )}

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-4">
          <div className="font-semibold text-red-800">
            Erreur
          </div>

          <div className="mt-1 text-sm text-red-700">
            {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map(
            (_, index) => (
              <div
                key={index}
                className="sn-card animate-pulse p-5"
              >
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="mt-4 h-8 w-44 rounded bg-gray-200" />
                <div className="mt-3 h-3 w-28 rounded bg-gray-100" />
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Plateforme
              </div>

              <div className="mt-2 text-xl font-semibold text-gray-900">
                {savedForm.platformName ||
                  "SchoolNet"}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                Identité affichée dans la plateforme
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Année scolaire active
              </div>

              <div className="mt-2 text-xl font-semibold text-blue-600">
                {currentSchoolYear?.name ??
                  "Aucune année active"}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                {currentSchoolYear
                  ? `${formatDateOnly(
                      currentSchoolYear.starts_on
                    )} → ${formatDateOnly(
                      currentSchoolYear.ends_on
                    )}`
                  : "À définir dans Années scolaires"}
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Dernière modification
              </div>

              <div className="mt-2 text-lg font-semibold text-gray-900">
                {formatDateTime(
                  settingsRow?.updated_at ?? null
                )}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                Audit automatique des paramètres
              </div>
            </div>
          </div>

          <form
            id="platform-settings-form"
            onSubmit={handleSave}
            className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"
          >
            <div className="space-y-6">
              <section className="sn-card p-5">
                <div className="text-base font-semibold text-gray-900">
                  Identité de la plateforme
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Informations principales affichées dans
                  SchoolNet.
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Nom de la plateforme
                    </label>

                    <input
                      type="text"
                      value={form.platformName}
                      onChange={(event) =>
                        updateField(
                          "platformName",
                          event.target.value
                        )
                      }
                      placeholder="SchoolNet"
                      disabled={saving}
                      required
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Nom de l’établissement
                    </label>

                    <input
                      type="text"
                      value={form.institutionName}
                      onChange={(event) =>
                        updateField(
                          "institutionName",
                          event.target.value
                        )
                      }
                      placeholder="Ex. Groupe scolaire..."
                      disabled={saving}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Logo de la plateforme
                  </label>

                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          Importer depuis l’ordinateur
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          PNG, JPEG ou WebP — 5 Mo maximum
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={logoInputRef}
                          id="platform-logo-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoFileChange}
                          disabled={saving}
                          className="hidden"
                        />

                        <label
                          htmlFor="platform-logo-file"
                          className={`cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 ${
                            saving
                              ? "pointer-events-none opacity-50"
                              : ""
                          }`}
                        >
                          Choisir un fichier
                        </label>

                        {selectedLogoFile && (
                          <button
                            type="button"
                            onClick={
                              handleCancelLogoSelection
                            }
                            disabled={saving}
                            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Annuler la sélection
                          </button>
                        )}

                        {settingsRow?.logo_url &&
                          !removeLogoRequested &&
                          !selectedLogoFile && (
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              disabled={saving}
                              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Supprimer le logo
                            </button>
                          )}
                      </div>
                    </div>

                    {selectedLogoFile && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        Fichier sélectionné :{" "}
                        <span className="font-semibold">
                          {selectedLogoFile.name}
                        </span>
                        {" · "}
                        {(
                          selectedLogoFile.size /
                          1024 /
                          1024
                        ).toFixed(2)}
                        {" Mo"}
                      </div>
                    )}

                    {removeLogoRequested && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Le logo actuel sera supprimé lors de
                        l’enregistrement.
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Ou utiliser une URL externe
                    </label>

                    <input
                      type="url"
                      value={form.logoUrl}
                      onChange={(event) => {
                        clearSelectedLogo();
                        setRemoveLogoRequested(false);

                        updateField(
                          "logoUrl",
                          event.target.value
                        );
                      }}
                      placeholder="https://..."
                      disabled={
                        saving ||
                        selectedLogoFile !== null
                      }
                      className={inputClassName}
                    />
                  </div>
                </div>
              </section>

              <section className="sn-card p-5">
                <div className="text-base font-semibold text-gray-900">
                  Coordonnées de l’établissement
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Informations de contact utilisées par
                  l’administration.
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Adresse e-mail
                    </label>

                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(event) =>
                        updateField(
                          "contactEmail",
                          event.target.value
                        )
                      }
                      placeholder="contact@etablissement.ci"
                      disabled={saving}
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Téléphone
                    </label>

                    <input
                      type="tel"
                      value={form.contactPhone}
                      onChange={(event) =>
                        updateField(
                          "contactPhone",
                          event.target.value
                        )
                      }
                      placeholder="+225 01 02 03 04 05"
                      disabled={saving}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Adresse
                  </label>

                  <textarea
                    value={form.address}
                    onChange={(event) =>
                      updateField(
                        "address",
                        event.target.value
                      )
                    }
                    placeholder="Commune, quartier, rue ou adresse postale..."
                    disabled={saving}
                    rows={4}
                    className={`${inputClassName} resize-y`}
                  />
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="sn-card p-5">
                <div className="text-base font-semibold text-gray-900">
                  Aperçu de l’identité
                </div>

                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-sm">
                      {logoPreviewUrl &&
                      !logoPreviewError ? (
                        <img
                          src={logoPreviewUrl}
                          alt={`Logo ${displayName}`}
                          className="h-full w-full object-cover"
                          onError={() =>
                            setLogoPreviewError(true)
                          }
                        />
                      ) : (
                        getInitials(displayName)
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-gray-900">
                        {displayName}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {form.institutionName.trim() ||
                          "Nom de l’établissement non renseigné"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="sn-card p-5">
                <div className="text-base font-semibold text-gray-900">
                  Année scolaire
                </div>

                {currentSchoolYear ? (
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Année active
                    </div>

                    <div className="mt-1 text-xl font-semibold text-blue-900">
                      {currentSchoolYear.name}
                    </div>

                    <div className="mt-2 text-sm text-blue-700">
                      Du{" "}
                      {formatDateOnly(
                        currentSchoolYear.starts_on
                      )}{" "}
                      au{" "}
                      {formatDateOnly(
                        currentSchoolYear.ends_on
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                    Aucune année scolaire active n’est
                    définie.
                  </div>
                )}

                <Link
                  to="/app/admin/school-years"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Gérer les années scolaires
                </Link>
              </section>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between xl:col-span-2">
              <div>
                <div className="font-semibold text-gray-900">
                  Enregistrer les modifications
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Les nouvelles informations seront
                  disponibles pour les utilisateurs
                  connectés.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!isDirty || saving}
                  className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler les modifications
                </button>

                <button
                  type="submit"
                  disabled={!isDirty || saving}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Enregistrement…"
                    : "Enregistrer"}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
