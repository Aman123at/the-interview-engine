"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { FrameworkDef } from "@/contracts";

interface State {
  data: FrameworkDef[] | null;
  loading: boolean;
  error: ApiError | null;
}

export function useFrameworks() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchOnce = useCallback(async () => {
    try {
      const res = await api.getFrameworks();
      setState({ data: res.frameworks, loading: false, error: null });
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof ApiError ? e : new ApiError(0, "Unknown error"),
      });
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount is the intended subscription here; the rule's
    // "no setState in effects" guidance does not fit data-fetching hooks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
  }, [fetchOnce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    void fetchOnce();
  }, [fetchOnce]);

  return { ...state, reload };
}
