import { request } from "../client";
import type {
  CatalogSort,
  CategoryNode,
  CouponPreview,
  ProductDetail,
  ProductListResponse,
  SuggestItem,
} from "../types";

export type ListProductsQuery = {
  category?: string; // id or slug
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  minRating?: number; // 1-5; 2026-05-18 sweep
  search?: string;
  sort?: CatalogSort;
  newOnly?: boolean;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  limit?: number;
  offset?: number;
};

export const catalogApi = {
  getCategories(signal?: AbortSignal) {
    return request<CategoryNode[]>("/categories", {
      anonymous: true,
      signal,
    });
  },
  listProducts(query: ListProductsQuery = {}, signal?: AbortSignal) {
    return request<ProductListResponse>("/products", {
      anonymous: true,
      query,
      signal,
    });
  },
  getProduct(slug: string, signal?: AbortSignal) {
    return request<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
      anonymous: true,
      signal,
    });
  },
  suggest(q: string, limit = 6, signal?: AbortSignal) {
    return request<SuggestItem[]>("/products/suggest", {
      anonymous: true,
      query: { q, limit },
      signal,
    });
  },
  getProductCoupons(idOrSlug: string, signal?: AbortSignal) {
    return request<{ customer?: CouponPreview; retail?: CouponPreview }>(
      `/products/${encodeURIComponent(idOrSlug)}/coupons`,
      { signal },
    );
  },
};
