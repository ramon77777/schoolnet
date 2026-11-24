import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type RequestState<T> = {
  owner: string | null;
  data: T | null;
  failed: boolean;
};

// Both the owner and the requested object must still match before any data is shown.
export function useParentResultRequest<T>(requestKey: string, request: () => Promise<T>) {
  const { user, loading: authLoading } = useAuth();
  const owner = !authLoading && user && !user.isDemo && user.role === "parent"
    ? `${user.id}:${requestKey}` : null;
  const generation = useRef(0);
  const [reload, setReload] = useState(0);
  const requestOwner = owner === null ? null : `${owner}:${reload}`;
  const [state, setState] = useState<RequestState<T>>({
    owner: null, data: null, failed: false,
  });

  useEffect(() => {
    const run = ++generation.current;
    const current = () => generation.current === run;
    if (!requestOwner) return () => { generation.current += 1; };
    void request().then(
      (data) => {
        if (current()) setState({ owner: requestOwner, data, failed: false });
      },
      () => {
        if (current()) setState({ owner: requestOwner, data: null, failed: true });
      },
    );
    return () => { generation.current += 1; };
  }, [requestOwner, request]);

  const visible = requestOwner !== null && state.owner === requestOwner ? state : null;
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  return {
    data: visible?.data ?? null,
    loading: authLoading || (requestOwner !== null && visible === null),
    failed: visible?.failed ?? false,
    isDemo: user?.isDemo ?? false,
    unavailable: !authLoading && owner === null && !user?.isDemo,
    refresh,
  };
}
