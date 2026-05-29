// Server-side fetchers for Server Components.
// Public endpoints only — no auth, no refresh loop.
// React.cache() dedupes within a single request; Next's fetch cache
// (revalidate seconds) dedupes across requests.

import { cache } from "react";
import type {
  Banner,
  CatalogSort,
  CategoryNode,
  ProductListResponse,
} from "./types";

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

export type ServerNavLink = {
  name: string;
  href: string;
  hasDropdown: boolean;
};

const NAV_CATEGORY_LIMIT = 5;

export const serverGetNavLinks = cache(async (): Promise<ServerNavLink[]> => {
  const all = await serverGetCategories();
  return all
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, NAV_CATEGORY_LIMIT)
    .map((c) => ({
      name: c.name.toUpperCase(),
      href: `/products?category=${encodeURIComponent(c.slug.toLowerCase())}`,
      hasDropdown: c.children.length > 0,
    }));
});

export const serverListProducts = cache(
  async (opts: {
    sort?: CatalogSort;
    newOnly?: boolean;
    isFeatured?: boolean;
    isBestSeller?: boolean;
    limit?: number;
  }): Promise<ProductListResponse | null> => {
    const params = new URLSearchParams();
    if (opts.sort) params.set("sort", opts.sort);
    if (opts.newOnly) params.set("newOnly", "true");
    if (opts.isFeatured) params.set("isFeatured", "true");
    if (opts.isBestSeller) params.set("isBestSeller", "true");
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const path = `/products${qs ? `?${qs}` : ""}`;
    try {
      return await getJson<ProductListResponse>(path, 60);
    } catch {
      return null;
    }
  },
);
