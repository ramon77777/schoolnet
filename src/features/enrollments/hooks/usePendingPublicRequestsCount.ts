
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

/**
 * Compte les demandes publiques au statut "new".
 * Synchronisation via Realtime, focus et rafraichissement periodique.
 */
export default function usePendingPublicRequestsCount(): number {
  const { user } = useAuth();
  const userId = user?.id;
  const isAdmin = user?.role === "admin" && user.isDemo !== true;

  const [storedCount, setStoredCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;

    const { count, error } = await supabase
      .from("public_enrollment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");

    if (error) {
      console.error(
        "[SchoolNet] Lecture du compteur des demandes :",
        error
      );
      return;
    }

    setStoredCount(count ?? 0);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !userId) return;

    // Charger le compteur apres le montage.
    // Evite l'appel synchrone signale par ESLint.
    const initialRefreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    const channel = supabase
      .channel(`schoolnet-public-requests-count:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_enrollment_requests",
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60_000);

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, userId, refresh]);

  return isAdmin ? storedCount : 0;
}
