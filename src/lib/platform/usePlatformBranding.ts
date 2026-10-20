import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";

export const PLATFORM_SETTINGS_UPDATED_EVENT =
  "schoolnet:platform-settings-updated";

export type PlatformBranding = {
  platformName: string;
  institutionName: string | null;
  logoUrl: string | null;
};

type PlatformBrandingRow = {
  platform_name: string | null;
  institution_name: string | null;
  logo_url: string | null;
};

export const DEFAULT_PLATFORM_BRANDING: PlatformBranding = {
  platformName: "SchoolNet",
  institutionName: null,
  logoUrl: null,
};

let cachedBranding: PlatformBranding | null = null;
let inFlightRequest: Promise<PlatformBranding> | null = null;

function cleanOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  return normalized || null;
}

function normalizeBranding(
  row: PlatformBrandingRow | null
): PlatformBranding {
  const platformName = row?.platform_name?.trim();

  return {
    platformName:
      platformName || DEFAULT_PLATFORM_BRANDING.platformName,
    institutionName: cleanOptionalText(
      row?.institution_name
    ),
    logoUrl: cleanOptionalText(row?.logo_url),
  };
}

async function fetchPlatformBranding() {
  if (inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = (async () => {
    const { data, error } = await supabase
      .from("platform_settings")
      .select(
        `
          platform_name,
          institution_name,
          logo_url
        `
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const branding = normalizeBranding(
      (data ?? null) as PlatformBrandingRow | null
    );

    cachedBranding = branding;

    return branding;
  })().finally(() => {
    inFlightRequest = null;
  });

  return inFlightRequest;
}

export function notifyPlatformSettingsUpdated() {
  cachedBranding = null;

  window.dispatchEvent(
    new Event(PLATFORM_SETTINGS_UPDATED_EVENT)
  );
}

export function usePlatformBranding() {
  const [branding, setBranding] =
    useState<PlatformBranding>(
      cachedBranding ?? DEFAULT_PLATFORM_BRANDING
    );

  const [loading, setLoading] = useState(
    cachedBranding === null
  );

  const refresh = useCallback(async () => {
    try {
      setLoading(true);

      const nextBranding = await fetchPlatformBranding();

      setBranding(nextBranding);
    } catch (error) {
      console.error(
        "[usePlatformBranding] load error:",
        error
      );

      setBranding(
        cachedBranding ?? DEFAULT_PLATFORM_BRANDING
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleSettingsUpdated = () => {
      cachedBranding = null;
      void refresh();
    };

    window.addEventListener(
      PLATFORM_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated
    );

    return () => {
      window.removeEventListener(
        PLATFORM_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated
      );
    };
  }, [refresh]);

  return {
    branding,
    loading,
    refresh,
  };
}
