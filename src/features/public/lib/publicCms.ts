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
  | "benefit";

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
