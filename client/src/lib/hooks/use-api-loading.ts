"use client";

import { useEffect, useState } from "react";
import { subscribeApiLoading, getApiInflightCount } from "@/lib/api";

/**
 * Returns the current global API in-flight count + a boolean for whether
 * ANY network request is pending. Used by the top progress bar so the user
 * has a clear "something's happening" signal across the whole app.
 *
 * The subscriber pattern means we don't re-render unless the count actually
 * changes — at-rest cost is one ref to the set.
 */
export function useApiLoading(): { count: number; pending: boolean } {
  const [count, setCount] = useState<number>(() => getApiInflightCount());
  useEffect(() => subscribeApiLoading(setCount), []);
  return { count, pending: count > 0 };
}
