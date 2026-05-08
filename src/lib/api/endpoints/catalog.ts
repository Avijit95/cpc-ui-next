import { request } from "../client";
import type {
  CatalogSort,
  CategoryNode,
  ProductDetail,
  ProductListResponse,
} from "../types";

export type ListProductsQuery = {
  category?: string; // id or slug
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  sort?: CatalogSort;
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
};
