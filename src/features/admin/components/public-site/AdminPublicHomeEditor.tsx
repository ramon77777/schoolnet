import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabaseClient";

import type {
  PublicHomeCard,
  PublicHomeCardGroup,
  PublicSiteSettings,
} from "@/features/public/lib/publicCms";

type HomeTextField =
  | "hero_badge"
  | "hero_title"
  | "hero_highlight"
  | "hero_description"
  | "hero_primary_label"
  | "hero_primary_path"
  | "hero_secondary_label"
  | "hero_secondary_path"
  | "hero_panel_title"
  | "hero_panel_subtitle"
  | "hero_panel_banner"
  | "intro_eyebrow"
  | "intro_title"
  | "intro_description"
  | "why_eyebrow"
  | "why_title"
  | "why_description"
  | "cta_eyebrow"
  | "cta_title"
  | "cta_description"
  | "cta_button_label"
  | "cta_button_path";

const HOME_FIELDS: HomeTextField[] = [
  "hero_badge",
  "hero_title",
  "hero_highlight",
  "hero_description",
  "hero_primary_label",
  "hero_primary_path",
  "hero_secondary_label",
  "hero_secondary_path",
  "hero_panel_title",
  "hero_panel_subtitle",
  "hero_panel_banner",
  "intro_eyebrow",
  "intro_title",
  "intro_description",
  "why_eyebrow",
  "why_title",
  "why_description",
  "cta_eyebrow",
  "cta_title",
  "cta_description",
  "cta_button_label",
  "cta_button_path",
];

const GROUP_CONFIG: Record<
  PublicHomeCardGroup,
  {
    title: string;
    description: string;
    icon: string;
  }
> = {
  hero_feature: {
    title: "Cartes du panneau Hero",
    description:
      "Les quatre raccourcis affichés dans le panneau à droite du Hero.",
    icon: "✨",
  },
  audience: {
    title: "Utilisateurs SchoolNet",
    description:
      "Les profils présentés dans la section dédiée aux utilisateurs.",
    icon: "👥",
  },
  benefit: {
    title: "Avantages SchoolNet",
    description:
      "Les avantages présentés dans la section Pourquoi SchoolNet.",
    icon: "💡",
  },
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

function snapshotSettings(
  settings: PublicSiteSettings | null
) {
  if (!settings) {
    return "";
  }

  const result: Record<string, string> = {};

  HOME_FIELDS.forEach((field) => {
    result[field] = settings[field] ?? "";
  });

  return JSON.stringify(result);
}

function snapshotCards(cards: PublicHomeCard[]) {
  return JSON.stringify(
    cards.map((card) => ({
      id: card.id,
      group_key: card.group_key,
      icon: card.icon ?? "",
      title: card.title,
      description: card.description ?? "",
      sort_order: card.sort_order,
      is_visible: card.is_visible,
    }))
  );
}

type SectionProps = {
  icon: string;
  title: string;
  description: string;
  children: ReactNode;
};

function EditorSection({
  icon,
  title,
  description,
  children,
}: SectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">
            {icon}
          </div>

          <div>
            <div className="font-semibold text-gray-900">
              {title}
            </div>

            <div className="mt-1 text-sm leading-5 text-gray-500">
              {description}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        {children}
      </div>
    </section>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  help?: string;
  onChange: (value: string) => void;
};

function InputField({
  label,
  value,
  placeholder,
  help,
  onChange,
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />

      {help && (
        <span className="mt-1.5 block text-xs leading-5 text-gray-400">
          {help}
        </span>
      )}
    </label>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
};

function TextAreaField({
  label,
  value,
  placeholder,
  rows = 4,
  onChange,
}: TextAreaFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </span>

      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

export default function AdminPublicHomeEditor() {
  const [settings, setSettings] =
    useState<PublicSiteSettings | null>(null);

  const [cards, setCards] =
    useState<PublicHomeCard[]>([]);

  const [initialSettingsSnapshot, setInitialSettingsSnapshot] =
    useState("");

  const [initialCardsSnapshot, setInitialCardsSnapshot] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadEditor = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const [
        settingsResult,
        cardsResult,
      ] = await Promise.all([
        supabase
          .from("public_site_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle(),

        supabase
          .from("public_home_cards")
          .select("*")
          .order("group_key", {
            ascending: true,
          })
          .order("sort_order", {
            ascending: true,
          }),
      ]);

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      if (cardsResult.error) {
        throw cardsResult.error;
      }

      const loadedSettings =
        settingsResult.data as PublicSiteSettings | null;

      const loadedCards =
        (cardsResult.data as PublicHomeCard[] | null) ??
        [];

      if (!loadedSettings) {
        throw new Error(
          "Les paramètres de la page d'accueil sont introuvables."
        );
      }

      setSettings(loadedSettings);
      setCards(loadedCards);

      setInitialSettingsSnapshot(
        snapshotSettings(loadedSettings)
      );

      setInitialCardsSnapshot(
        snapshotCards(loadedCards)
      );
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger l'éditeur de la page d'accueil."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEditor();
  }, [loadEditor]);

  const currentSettingsSnapshot =
    useMemo(
      () => snapshotSettings(settings),
      [settings]
    );

  const currentCardsSnapshot =
    useMemo(
      () => snapshotCards(cards),
      [cards]
    );

  const hasChanges =
    currentSettingsSnapshot !==
      initialSettingsSnapshot ||
    currentCardsSnapshot !==
      initialCardsSnapshot;

  const updateSetting = (
    field: HomeTextField,
    value: string
  ) => {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });

    setSuccess(null);
  };

  const updateCard = (
    id: string,
    patch: Partial<PublicHomeCard>
  ) => {
    setCards((current) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              ...patch,
            }
          : card
      )
    );

    setSuccess(null);
  };

  const cardsByGroup = useMemo(() => {
    const result: Record<
      PublicHomeCardGroup,
      PublicHomeCard[]
    > = {
      hero_feature: [],
      audience: [],
      benefit: [],
    };

    cards.forEach((card) => {
      if (result[card.group_key]) {
        result[card.group_key].push(card);
      }
    });

    Object.values(result).forEach((items) => {
      items.sort(
        (a, b) =>
          a.sort_order - b.sort_order
      );
    });

    return result;
  }, [cards]);

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    const invalidCard = cards.find(
      (card) => !card.title.trim()
    );

    if (invalidCard) {
      setError(
        "Chaque carte doit avoir un titre."
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const updatedBy =
        authData.user?.id ?? null;

      const now =
        new Date().toISOString();

      const settingsPayload: Record<
        HomeTextField,
        string
      > = {} as Record<HomeTextField, string>;

      HOME_FIELDS.forEach((field) => {
        settingsPayload[field] =
          settings[field]?.trim() ?? "";
      });

      const {
        error: settingsError,
      } = await supabase
        .from("public_site_settings")
        .update({
          ...settingsPayload,
          updated_at: now,
          updated_by: updatedBy,
        })
        .eq("id", 1);

      if (settingsError) {
        throw settingsError;
      }

      const cardResults =
        await Promise.all(
          cards.map((card) =>
            supabase
              .from("public_home_cards")
              .update({
                icon:
                  card.icon?.trim() || null,
                title:
                  card.title.trim(),
                description:
                  card.description?.trim() ||
                  null,
                sort_order:
                  card.sort_order,
                is_visible:
                  card.is_visible,
                updated_at: now,
                updated_by: updatedBy,
              })
              .eq("id", card.id)
          )
        );

      const cardError =
        cardResults.find(
          (result) => result.error
        )?.error;

      if (cardError) {
        throw cardError;
      }

      const normalizedSettings = {
        ...settings,
        ...settingsPayload,
        updated_at: now,
        updated_by: updatedBy,
      };

      const normalizedCards =
        cards.map((card) => ({
          ...card,
          icon:
            card.icon?.trim() || null,
          title:
            card.title.trim(),
          description:
            card.description?.trim() ||
            null,
          updated_at: now,
          updated_by: updatedBy,
        }));

      setSettings(normalizedSettings);
      setCards(normalizedCards);

      setInitialSettingsSnapshot(
        snapshotSettings(
          normalizedSettings
        )
      );

      setInitialCardsSnapshot(
        snapshotCards(normalizedCards)
      );

      setSuccess(
        "La page d'accueil a été enregistrée avec succès."
      );
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d'enregistrer la page d'accueil."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="sn-card p-6">
        <div className="text-sm text-gray-500">
          Chargement de l’éditeur de la page d’accueil…
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error ??
          "Impossible de charger les paramètres de la page d'accueil."}
      </div>
    );
  }

  const valueOf = (
    field: HomeTextField
  ) => settings[field] ?? "";

  return (
    <div className="space-y-5">
      <div className="sn-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              Éditeur de la page d’accueil
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Modifiez les contenus puis enregistrez.
              Les changements seront utilisés par la
              vitrine publique SchoolNet.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasChanges && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                ● Modifications non enregistrées
              </span>
            )}

            <button
              type="button"
              onClick={() =>
                void loadEditor()
              }
              disabled={saving}
              className="sn-btn-ghost sn-press"
            >
              Annuler les modifications
            </button>

            <button
              type="button"
              onClick={() =>
                void handleSave()
              }
              disabled={
                saving || !hasChanges
              }
              className="sn-btn-primary sn-press disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Enregistrement…"
                : "Enregistrer"}
            </button>
          </div>
        </div>

        {success && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            <div className="font-semibold">
              ✅ Opération réussie
            </div>

            <div className="mt-1">
              {success}
            </div>
          </div>
        )}

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            <div className="font-semibold">
              ⚠️ Une erreur est survenue
            </div>

            <div className="mt-1">
              {error}
            </div>
          </div>
        )}
      </div>

      <EditorSection
        icon="🚀"
        title="Hero principal"
        description="Le premier contenu visible lorsque l’utilisateur arrive sur SchoolNet."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Badge"
            value={valueOf("hero_badge")}
            onChange={(value) =>
              updateSetting(
                "hero_badge",
                value
              )
            }
          />

          <InputField
            label="Titre principal"
            value={valueOf("hero_title")}
            onChange={(value) =>
              updateSetting(
                "hero_title",
                value
              )
            }
          />

          <InputField
            label="Texte mis en évidence"
            value={valueOf(
              "hero_highlight"
            )}
            onChange={(value) =>
              updateSetting(
                "hero_highlight",
                value
              )
            }
          />

          <div className="lg:col-span-2">
            <TextAreaField
              label="Description"
              value={valueOf(
                "hero_description"
              )}
              onChange={(value) =>
                updateSetting(
                  "hero_description",
                  value
                )
              }
            />
          </div>

          <InputField
            label="Bouton principal"
            value={valueOf(
              "hero_primary_label"
            )}
            onChange={(value) =>
              updateSetting(
                "hero_primary_label",
                value
              )
            }
          />

          <InputField
            label="Lien du bouton principal"
            value={valueOf(
              "hero_primary_path"
            )}
            help="Exemple : /bibliotheque"
            onChange={(value) =>
              updateSetting(
                "hero_primary_path",
                value
              )
            }
          />

          <InputField
            label="Bouton secondaire"
            value={valueOf(
              "hero_secondary_label"
            )}
            onChange={(value) =>
              updateSetting(
                "hero_secondary_label",
                value
              )
            }
          />

          <InputField
            label="Lien du bouton secondaire"
            value={valueOf(
              "hero_secondary_path"
            )}
            help="Exemple : /auth/login"
            onChange={(value) =>
              updateSetting(
                "hero_secondary_path",
                value
              )
            }
          />
        </div>
      </EditorSection>

      <EditorSection
        icon="📊"
        title="Panneau du Hero"
        description="Le bloc visuel situé à droite du Hero de la page d’accueil."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Titre du panneau"
            value={valueOf(
              "hero_panel_title"
            )}
            onChange={(value) =>
              updateSetting(
                "hero_panel_title",
                value
              )
            }
          />

          <InputField
            label="Sous-titre du panneau"
            value={valueOf(
              "hero_panel_subtitle"
            )}
            onChange={(value) =>
              updateSetting(
                "hero_panel_subtitle",
                value
              )
            }
          />

          <div className="lg:col-span-2">
            <InputField
              label="Bannière du panneau"
              value={valueOf(
                "hero_panel_banner"
              )}
              onChange={(value) =>
                updateSetting(
                  "hero_panel_banner",
                  value
                )
              }
            />
          </div>
        </div>
      </EditorSection>

      <EditorSection
        icon="🎓"
        title="Présentation de SchoolNet"
        description="Le titre et le texte introductif de la section qui présente la plateforme."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Sur-titre"
            value={valueOf(
              "intro_eyebrow"
            )}
            onChange={(value) =>
              updateSetting(
                "intro_eyebrow",
                value
              )
            }
          />

          <InputField
            label="Titre"
            value={valueOf(
              "intro_title"
            )}
            onChange={(value) =>
              updateSetting(
                "intro_title",
                value
              )
            }
          />

          <div className="lg:col-span-2">
            <TextAreaField
              label="Description"
              value={valueOf(
                "intro_description"
              )}
              onChange={(value) =>
                updateSetting(
                  "intro_description",
                  value
                )
              }
            />
          </div>
        </div>
      </EditorSection>

      <EditorSection
        icon="💜"
        title="Pourquoi SchoolNet ?"
        description="Le bloc de présentation des avantages et de la valeur apportée par la plateforme."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Sur-titre"
            value={valueOf(
              "why_eyebrow"
            )}
            onChange={(value) =>
              updateSetting(
                "why_eyebrow",
                value
              )
            }
          />

          <InputField
            label="Titre"
            value={valueOf(
              "why_title"
            )}
            onChange={(value) =>
              updateSetting(
                "why_title",
                value
              )
            }
          />

          <div className="lg:col-span-2">
            <TextAreaField
              label="Description"
              value={valueOf(
                "why_description"
              )}
              onChange={(value) =>
                updateSetting(
                  "why_description",
                  value
                )
              }
            />
          </div>
        </div>
      </EditorSection>

      <EditorSection
        icon="📣"
        title="Appel à l’action"
        description="Le dernier grand bloc incitant les visiteurs à accéder à leur espace SchoolNet."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Sur-titre"
            value={valueOf(
              "cta_eyebrow"
            )}
            onChange={(value) =>
              updateSetting(
                "cta_eyebrow",
                value
              )
            }
          />

          <InputField
            label="Titre"
            value={valueOf(
              "cta_title"
            )}
            onChange={(value) =>
              updateSetting(
                "cta_title",
                value
              )
            }
          />

          <div className="lg:col-span-2">
            <TextAreaField
              label="Description"
              value={valueOf(
                "cta_description"
              )}
              onChange={(value) =>
                updateSetting(
                  "cta_description",
                  value
                )
              }
            />
          </div>

          <InputField
            label="Texte du bouton"
            value={valueOf(
              "cta_button_label"
            )}
            onChange={(value) =>
              updateSetting(
                "cta_button_label",
                value
              )
            }
          />

          <InputField
            label="Lien du bouton"
            value={valueOf(
              "cta_button_path"
            )}
            onChange={(value) =>
              updateSetting(
                "cta_button_path",
                value
              )
            }
          />
        </div>
      </EditorSection>

      {(
        [
          "hero_feature",
          "audience",
          "benefit",
        ] as PublicHomeCardGroup[]
      ).map((group) => {
        const config =
          GROUP_CONFIG[group];

        const groupCards =
          cardsByGroup[group];

        return (
          <EditorSection
            key={group}
            icon={config.icon}
            title={config.title}
            description={
              config.description
            }
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {groupCards.map(
                (card, index) => (
                  <div
                    key={card.id}
                    className={[
                      "rounded-2xl border p-4 transition",
                      card.is_visible
                        ? "border-gray-200 bg-white"
                        : "border-gray-200 bg-gray-50 opacity-70",
                    ].join(" ")}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-900">
                        Élément {index + 1}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          updateCard(
                            card.id,
                            {
                              is_visible:
                                !card.is_visible,
                            }
                          )
                        }
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold transition",
                          card.is_visible
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-gray-200 text-gray-600",
                        ].join(" ")}
                      >
                        {card.is_visible
                          ? "● Visible"
                          : "○ Masqué"}
                      </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
                      <InputField
                        label="Icône"
                        value={
                          card.icon ?? ""
                        }
                        onChange={(
                          value
                        ) =>
                          updateCard(
                            card.id,
                            {
                              icon: value,
                            }
                          )
                        }
                      />

                      <InputField
                        label="Titre"
                        value={card.title}
                        onChange={(
                          value
                        ) =>
                          updateCard(
                            card.id,
                            {
                              title: value,
                            }
                          )
                        }
                      />
                    </div>

                    {group !==
                      "hero_feature" && (
                      <div className="mt-4">
                        <TextAreaField
                          label="Description"
                          rows={3}
                          value={
                            card.description ??
                            ""
                          }
                          onChange={(
                            value
                          ) =>
                            updateCard(
                              card.id,
                              {
                                description:
                                  value,
                              }
                            )
                          }
                        />
                      </div>
                    )}

                    <div className="mt-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">
                          Ordre
                        </span>

                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={
                            card.sort_order
                          }
                          onChange={(
                            event
                          ) =>
                            updateCard(
                              card.id,
                              {
                                sort_order:
                                  Number(
                                    event.target
                                      .value
                                  ) || 0,
                              }
                            )
                          }
                          className="w-32 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                  </div>
                )
              )}
            </div>
          </EditorSection>
        );
      })}

      <div className="sn-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-gray-900">
            Enregistrer les modifications
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Les nouveaux contenus seront disponibles sur la vitrine publique.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              void loadEditor()
            }
            disabled={
              saving || !hasChanges
            }
            className="sn-btn-ghost sn-press disabled:opacity-50"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={() =>
              void handleSave()
            }
            disabled={
              saving || !hasChanges
            }
            className="sn-btn-primary sn-press disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Enregistrement…"
              : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
