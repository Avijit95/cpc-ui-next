// Server-side fetchers for Server Components.
// Public endpoints only — no auth, no refresh loop.
// React.cache() dedupes within a single request; Next's fetch cache
// (revalidate seconds) dedupes across requests.

import { cache } from "react";
import type { Banner, CategoryNode } from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

async function getJson<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const serverGetActiveBanners = cache(async (): Promise<Banner[]> => {
  try {
    return await getJson<Banner[]>("/banners/active", 60);
  } catch {
    return [];
  }
});

export const serverGetCategories = cache(async (): Promise<CategoryNode[]> => {
  try {
    return await getJson<CategoryNode[]>("/categories", 300);
  } catch {
    return [];
  }
});
