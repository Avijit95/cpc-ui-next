"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Sync object state with URL query params. Each list page can swap a bag of
 * `useState`s (sort + filters + pagination) for a single `useUrlState`, so:
 *  - refresh preserves state
 *  - browser back/forward works
 *  - URLs are shareable
 *
 * Uses `router.replace` (not `push`) — sort/filter flips don't clutter history.
 *
 * Convention: empty strings, undefined, and null are removed from the URL.
 * Numbers are stringified. Keys outside `defaults` are passed through unchanged
 * (e.g. unrelated query params survive a sort change).
 */
export type UrlStatePrimitive = string | number | boolean | undefined | null;

export function useUrlState<T extends Record<string, UrlStatePrimitive>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo<T>(() => {
    const out: Record<string, UrlStatePrimitive> = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const defaultValue = defaults[key];
      if (typeof defaultValue === "number") {
        const n = Number(raw);
        out[key] = Number.isFinite(n) ? n : defaultValue;
      } else if (typeof defaultValue === "boolean") {
        out[key] = raw === "true";
      } else {
        out[key] = raw;
      }
    }
    return out as T;
  }, [defaults, searchParams]);

  const setState = useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      const next: Record<string, UrlStatePrimitive> = { ...state, ...patch };
      for (const key of Object.keys(defaults)) {
        const value = next[key];
        const isDefault = value === defaults[key];
        if (value === undefined || value === null || value === "" || isDefault) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [defaults, pathname, router, searchParams, state],
  );

  return [state, setState];
}
