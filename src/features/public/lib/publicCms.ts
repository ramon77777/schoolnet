import { supabase } from "@/lib/supabaseClient";

export type PublicSiteSettings = {
  id: number;
  header_tagline: string | null;
  login_button_label: string | null;

  hero_badge: string | null;
  hero_title: string | null;
  hero_highlight: string | null;
  hero_description: string | null;
  hero_primary_label: string | null;
  hero_primary_path: string | null;
  hero_secondary_label: string | null;
  hero_secondary_path: string | null;

  hero_panel_title: string | null;
  hero_panel_subtitle: string | null;
  hero_panel_banner: string | null;

  hero_image_url: string | null;
  hero_image_alt: string | null;

  intro_eyebrow: string | null;
  intro_title: string | null;
  intro_description: string | null;

  why_eyebrow: string | null;
  why_title: string | null;
  why_description: string | null;

  cta_eyebrow: string | null;
  cta_title: string | null;
  cta_description: string | null;
  cta_button_label: string | null;
  cta_button_path: string | null;

  footer_description: string | null;
  footer_ambition_title: string | null;
  footer_ambition_text: string | null;
  footer_bottom_text: string | null;
  copyright_text: string | null;

  is_published: boolean;

  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PublicNavigationItem = {
  id: string;
  label: string;
  path: string;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PublicHomeCardGroup =
  | "hero_feature"
  | "audience"
  | "benefit"
  | "platform_feature"
  | "class_space_feature"
  | "library_feature"
  | "parent_feature";

export type PublicHomeCard = {
  id: string;
  group_key: PublicHomeCardGroup;
  icon: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PublicPage = {
  slug: string;
  nav_title: string | null;
  eyebrow: string | null;
  title: string | null;
  intro: string | null;
  body: string | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PublicFooterLink = {
  id: string;
  group_key: string;
  group_title: string;
  label: string;
  path: string;
  group_sort_order: number;
  link_sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PublicShellContent = {
  settings: PublicSiteSettings | null;
  navigation: PublicNavigationItem[];
  footerLinks: PublicFooterLink[];
};

export type PublicHomeContent = PublicShellContent & {
  heroFeatures: PublicHomeCard[];
  audiences: PublicHomeCard[];
  benefits: PublicHomeCard[];

  platformFeatures: PublicHomeCard[];
  classSpaceFeatures: PublicHomeCard[];
  libraryFeatures: PublicHomeCard[];
  parentFeatures: PublicHomeCard[];
};

function errorMessage(
  source: string,
  message: string | undefined,
) {
  return `${source}: ${message ?? "erreur inconnue"}`;
}

export async function loadPublicShellContent(): Promise<PublicShellContent> {
  const [
    settingsResult,
    navigationResult,
    footerResult,
  ] = await Promise.all([
    supabase
      .from("public_site_settings")
      .select("*")
      .eq("id", 1)
      .eq("is_published", true)
      .maybeSingle(),

    supabase
      .from("public_navigation_items")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("public_footer_links")
      .select("*")
      .eq("is_visible", true)
      .order("group_sort_order", { ascending: true })
      .order("link_sort_order", { ascending: true }),
  ]);

  const errors: string[] = [];

  if (settingsResult.error) {
    errors.push(
      errorMessage(
        "Paramètres du site",
        settingsResult.error.message,
      ),
    );
  }

  if (navigationResult.error) {
    errors.push(
      errorMessage(
        "Navigation",
        navigationResult.error.message,
      ),
    );
  }

  if (footerResult.error) {
    errors.push(
      errorMessage(
        "Footer",
        footerResult.error.message,
      ),
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  return {
    settings:
      (settingsResult.data as PublicSiteSettings | null) ??
      null,

    navigation:
      (navigationResult.data as PublicNavigationItem[] | null) ??
      [],

    footerLinks:
      (footerResult.data as PublicFooterLink[] | null) ??
      [],
  };
}

export async function loadPublicHomeContent(): Promise<PublicHomeContent> {
  const [shell, cardsResult] = await Promise.all([
    loadPublicShellContent(),

    supabase
      .from("public_home_cards")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (cardsResult.error) {
    throw new Error(
      errorMessage(
        "Cartes de la page d'accueil",
        cardsResult.error.message,
      ),
    );
  }

  const cards =
    (cardsResult.data as PublicHomeCard[] | null) ?? [];

  return {
    ...shell,

    heroFeatures: cards.filter(
      (card) => card.group_key === "hero_feature",
    ),

    audiences: cards.filter(
      (card) => card.group_key === "audience",
    ),

    benefits: cards.filter(
      (card) => card.group_key === "benefit",
    ),

    platformFeatures: cards.filter(
      (card) => card.group_key === "platform_feature",
    ),

    classSpaceFeatures: cards.filter(
      (card) => card.group_key === "class_space_feature",
    ),

    libraryFeatures: cards.filter(
      (card) => card.group_key === "library_feature",
    ),

    parentFeatures: cards.filter(
      (card) => card.group_key === "parent_feature",
    ),
  };
}

export async function loadPublicPage(
  slug: string,
): Promise<PublicPage | null> {
  const { data, error } = await supabase
    .from("public_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      errorMessage(
        `Page publique "${slug}"`,
        error.message,
      ),
    );
  }

  return (data as PublicPage | null) ?? null;
}


export type PublicLevel = {
  id: string;
  name: string;
  slug: string;
  short_label: string | null;
  description: string | null;
  audience: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type PublicSubject = {
  id: string;
  name: string;
  slug: string;
  short_label: string | null;
  description: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type PublicLibraryItem = {
  id: string;

  title: string;
  slug: string;
  description: string | null;

  resource_type: string;

  /*
   * subject est conservé pour compatibilité
   * avec les premières données SchoolNet.
   */
  subject: string | null;
  subject_id: string | null;

  level_id: string | null;

  author: string | null;

  file_url: string | null;
  external_url: string | null;
  cover_url: string | null;

  download_label: string;

  is_featured: boolean;
  sort_order: number;
  is_visible: boolean;

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  level: PublicLevel | null;
  subjectRef: PublicSubject | null;
};

export async function loadPublicLevels(): Promise<
  PublicLevel[]
> {
  const { data, error } = await supabase
    .from("public_levels")
    .select("*")
    .eq("is_visible", true)
    .order("sort_order", {
      ascending: true,
    })
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      errorMessage(
        "Niveaux publics",
        error.message,
      ),
    );
  }

  return (
    (data as PublicLevel[] | null) ?? []
  );
}

export type PublicLibraryContent = {
  items: PublicLibraryItem[];
  levels: PublicLevel[];
  subjects: PublicSubject[];
};

export async function loadPublicLibraryContent(): Promise<
  PublicLibraryContent
> {
  const [
    itemsResult,
    levelsResult,
    subjectsResult,
  ] = await Promise.all([
    supabase
      .from("public_library_items")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      }),

    supabase
      .from("public_levels")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("public_subjects")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      }),
  ]);

  if (itemsResult.error) {
    throw new Error(
      errorMessage(
        "Bibliothèque publique",
        itemsResult.error.message,
      ),
    );
  }

  if (levelsResult.error) {
    throw new Error(
      errorMessage(
        "Niveaux publics",
        levelsResult.error.message,
      ),
    );
  }

  if (subjectsResult.error) {
    throw new Error(
      errorMessage(
        "Matières publiques",
        subjectsResult.error.message,
      ),
    );
  }

  const levels =
    (levelsResult.data as PublicLevel[] | null) ??
    [];

  const subjects =
    (subjectsResult.data as PublicSubject[] | null) ??
    [];

  const levelsById = new Map(
    levels.map((level) => [
      level.id,
      level,
    ]),
  );

  const subjectsById = new Map(
    subjects.map((subject) => [
      subject.id,
      subject,
    ]),
  );

  type RawLibraryItem = Omit<
    PublicLibraryItem,
    "level" | "subjectRef"
  >;

  const rawItems =
    (itemsResult.data as RawLibraryItem[] | null) ??
    [];

  const items: PublicLibraryItem[] =
    rawItems.map((item) => ({
      ...item,

      level: item.level_id
        ? levelsById.get(item.level_id) ??
          null
        : null,

      subjectRef: item.subject_id
        ? subjectsById.get(
            item.subject_id,
          ) ?? null
        : null,
    }));

  return {
    items,
    levels,
    subjects,
  };
}

/*
 * Conservé pour d'autres composants éventuels
 * qui auraient déjà besoin uniquement des ressources.
 */
export async function loadPublicLibraryItems(): Promise<
  PublicLibraryItem[]
> {
  const content =
    await loadPublicLibraryContent();

  return content.items;
}

export type PublicPricingPlan = {
  id: string;

  name: string;
  slug: string;

  eyebrow: string | null;
  description: string | null;

  price_amount: number | string | null;
  currency: string;
  billing_period: string | null;

  features: string[];

  cta_label: string;
  cta_path: string;

  is_featured: boolean;
  sort_order: number;
  is_visible: boolean;

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export async function loadPublicPricingPlans(): Promise<
  PublicPricingPlan[]
> {
  const { data, error } = await supabase
    .from("public_pricing_plans")
    .select("*")
    .eq("is_visible", true)
    .order("sort_order", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      errorMessage(
        "Tarifs publics",
        error.message,
      ),
    );
  }

  return (
    (data as PublicPricingPlan[] | null) ??
    []
  );
}