// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "") as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") as string;

// Petit helper pour afficher quoi faire si Vite ne lit pas .env
function envHelp() {
  return [
    "Vérifie que ton fichier .env est à la racine du projet (au même niveau que package.json).",
    "Vérifie que les variables commencent par VITE_.",
    "Redémarre le serveur après changement: CTRL+C puis npm run dev",
  ].join(" ");
}

if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl)) {
  // On log d'abord pour aider
  console.error("[supabaseClient] VITE_SUPABASE_URL invalide:", supabaseUrl);
  throw new Error(
    `Invalid VITE_SUPABASE_URL (got: "${supabaseUrl}"). ${envHelp()}`
  );
}

if (!supabaseAnonKey) {
  console.error("[supabaseClient] VITE_SUPABASE_ANON_KEY manquant.");
  throw new Error(`Missing VITE_SUPABASE_ANON_KEY. ${envHelp()}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // utile pour magic link / oauth
  },
});
