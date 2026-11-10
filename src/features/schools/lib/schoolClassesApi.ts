import { supabase } from "@/lib/supabaseClient";

export type SchoolClassLevel = {
  id: number;
  name: string;
  order_index: number;
};

export type SchoolClassYear = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

export type SchoolClassCatalog = {
  school_id: string;
  levels: SchoolClassLevel[];
  school_years: SchoolClassYear[];
};

export type LocalSchoolClass = {
  id: string;
  school_id: string;
  level_id: number;
  name: string;
  school_year: string;
  school_year_id: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

/**
 * Les deux RPC du lot S2-B ne sont pas déployées dans Supabase tant que
 * l'activation des lots S2-A et S2-B n'a pas été approuvée.
 * Une fonction absente est un état « en attente », pas une création réussie.
 */
export function isSchoolClassesActivationPending(cause: unknown): boolean {
  const error = (cause ?? {}) as SupabaseLikeError;
  const message = [error.message, error.details].filter(Boolean).join(" ").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("schoolnet_school_class_catalog") &&
      (message.includes("schema cache") || message.includes("not find"))) ||
    (message.includes("school_id") && message.includes("does not exist"))
  );
}

export function schoolClassErrorMessage(cause: unknown): string {
  const error = (cause ?? {}) as SupabaseLikeError;
  if (error.code === "23505") {
    return "Une classe portant ce nom existe déjà dans cet établissement pour cette année scolaire.";
  }
  if (error.code === "42501") {
    return "Vous n'avez pas l'autorisation de gérer les classes de cet établissement.";
  }
  if (error.code === "22023" || error.code === "23514") {
    return "Le nom, le niveau ou l'année scolaire sélectionnés ne sont pas valides.";
  }
  return "Impossible de traiter la demande. Veuillez réessayer ou contacter l'administration SCHOOLNET.";
}

function isCatalog(value: unknown, schoolId: string): value is SchoolClassCatalog {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.school_id !== schoolId ||
    !Array.isArray(row.levels) ||
    !Array.isArray(row.school_years)) return false;

  return row.levels.every((level: unknown) => {
    if (!level || typeof level !== "object") return false;
    const item = level as Record<string, unknown>;
    return typeof item.id === "number" &&
      typeof item.name === "string" && typeof item.order_index === "number";
  }) && row.school_years.every((year: unknown) => {
    if (!year || typeof year !== "object") return false;
    const item = year as Record<string, unknown>;
    return typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.starts_on === "string" &&
      typeof item.is_current === "boolean";
  });
}

export async function getLocalSchoolClassCatalog(
  schoolId: string,
): Promise<SchoolClassCatalog> {
  const { data, error } = await supabase.rpc("schoolnet_school_class_catalog", {
    p_school_id: schoolId,
  });
  if (error) throw error;
  if (!isCatalog(data, schoolId)) {
    throw new Error("Catalogue des classes invalide.");
  }
  return data;
}

export async function getLocalSchoolClasses(
  schoolId: string,
): Promise<LocalSchoolClass[]> {
  // La RLS S2-A, et non le filtre fourni par React, protège chaque ligne.
  const { data, error } = await supabase
    .from("classes")
    .select("id,school_id,level_id,name,school_year,school_year_id")
    .eq("school_id", schoolId)
    .eq("learning_context", "school")
    .order("school_year", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LocalSchoolClass[];
}

export async function createLocalSchoolClass(input: {
  schoolId: string;
  levelId: number;
  schoolYearId: string;
  name: string;
}): Promise<string> {
  // Jamais d'INSERT direct sur classes : tous les contrôles sont côté SQL.
  const { data, error } = await supabase.rpc("schoolnet_school_create_class", {
    p_school_id: input.schoolId,
    p_level_id: input.levelId,
    p_school_year_id: input.schoolYearId,
    p_name: input.name.trim(),
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("La création de la classe n'a pas été confirmée.");
  }
  return data;
}
