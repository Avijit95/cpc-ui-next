import { request, s3Put } from "../client";
import type {
  AdminCategory,
  AdminCategoryListItem,
  AdminCouponDetail,
  AdminCouponRow,
  AdminCouponsList,
  AdminPartner,
  AdminPartnerDetail,
  AdminPartnersList,
  AdminProduct,
  AdminProductDetail,
  AdminProductsList,
  AdminVariant,
  AttachedSlotResponse,
  CouponStatus,
  CouponType,
  ImportJobAccepted,
  ImportJobStatus,
  KycStatus,
  ProductCouponSlot,
  ProductImagePresignResponse,
  ProductImagesConfirmResponse,
  ProductStatus,
} from "../types";

// ────────────────────────────────────────────────────────────────────────────
// Partner approval
// ────────────────────────────────────────────────────────────────────────────

export type ListPartnersQuery = {
  status?: KycStatus;
  limit?: number;
  offset?: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Categories
// ────────────────────────────────────────────────────────────────────────────

export type CreateCategoryBody = {
  name: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  imageObjectKey?: string;
};

export type UpdateCategoryBody = Partial<CreateCategoryBody>;

// ────────────────────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────────────────────

export type CreateProductBody = {
  name: string;
  slug?: string;
  categoryId: string;
  description: string;
  specs?: Record<string, unknown>;
  basePrice: number;
  stock?: number;
  status?: ProductStatus;
  brand?: string;
  hsnCode?: string;
};

export type UpdateProductBody = Partial<CreateProductBody>;

export type ListProductsAdminQuery = {
  status?: ProductStatus;
  categoryId?: string;
  brand?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Variants
// ────────────────────────────────────────────────────────────────────────────

export type CreateVariantBody = {
  sku: string;
  attributes: Record<string, unknown>;
  priceOverride?: number | null;
  stock?: number;
  imagesObjectKeys?: string[];
};

export type UpdateVariantBody = Partial<CreateVariantBody>;

// ────────────────────────────────────────────────────────────────────────────
// Images
// ────────────────────────────────────────────────────────────────────────────

export type ProductImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type ProductImagePresignBody = {
  contentType: ProductImageContentType;
  contentLength: number;
};

export type ProductImagesConfirmBody = {
  objectKeys: string[];
  sortOrder?: number[];
  replace?: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Coupons (Sprint 3)
// ────────────────────────────────────────────────────────────────────────────

export type ListCouponsQuery = {
  type?: CouponType;
  status?: CouponStatus;
  limit?: number;
  offset?: number;
};

export type CreateCouponBody = {
  name: string;
  type: CouponType;
  status?: CouponStatus;
};

export type UpdateCouponBody = {
  name?: string;
  status?: CouponStatus;
};

export type AttachProductCouponBody = {
  couponId: string;
  value: number;
};

export const adminApi = {
  // ── Partners ────────────────────────────────────────────────────────────
  listPartners(query: ListPartnersQuery = {}) {
    return request<AdminPartnersList>("/admin/partners", { query });
  },
  getPartner(id: string) {
    return request<AdminPartnerDetail>(`/admin/partners/${id}`);
  },
  approvePartner(id: string) {
    return request<AdminPartner>(`/admin/partners/${id}/approve`, {
      method: "POST",
    });
  },
  rejectPartner(id: string, reason: string) {
    return request<AdminPartner>(`/admin/partners/${id}/reject`, {
      method: "POST",
      body: { reason },
    });
  },

  // ── Categories ──────────────────────────────────────────────────────────
  listCategories() {
    return request<AdminCategoryListItem[]>("/admin/categories");
  },
  getCategory(id: string) {
    return request<AdminCategoryListItem>(`/admin/categories/${id}`);
  },
  createCategory(body: CreateCategoryBody) {
    return request<AdminCategory>("/admin/categories", {
      method: "POST",
      body,
    });
  },
  updateCategory(id: string, body: UpdateCategoryBody) {
    return request<AdminCategory>(`/admin/categories/${id}`, {
      method: "PATCH",
      body,
    });
  },
  deleteCategory(id: string) {
    return request<{ id: string }>(`/admin/categories/${id}`, {
      method: "DELETE",
    });
  },

  // ── Products ────────────────────────────────────────────────────────────
  listProducts(query: ListProductsAdminQuery = {}) {
    return request<AdminProductsList>("/admin/products", { query });
  },
  getProduct(id: string) {
    return request<AdminProductDetail>(`/admin/products/${id}`);
  },
  createProduct(body: CreateProductBody) {
    return request<AdminProduct>("/admin/products", {
      method: "POST",
      body,
    });
  },
  updateProduct(id: string, body: UpdateProductBody) {
    return request<AdminProduct>(`/admin/products/${id}`, {
      method: "PATCH",
      body,
    });
  },
  archiveProduct(id: string) {
    return request<AdminProduct>(`/admin/products/${id}/archive`, {
      method: "POST",
    });
  },

  // ── Variants ────────────────────────────────────────────────────────────
  createVariant(productId: string, body: CreateVariantBody) {
    return request<AdminVariant>(
      `/admin/products/${productId}/variants`,
      { method: "POST", body },
    );
  },
  updateVariant(
    productId: string,
    variantId: string,
    body: UpdateVariantBody,
  ) {
    return request<AdminVariant>(
      `/admin/products/${productId}/variants/${variantId}`,
      { method: "PATCH", body },
    );
  },
  deleteVariant(productId: string, variantId: string) {
    return request<{ id: string }>(
      `/admin/products/${productId}/variants/${variantId}`,
      { method: "DELETE" },
    );
  },

  // ── Product images (presign → S3 PUT → confirm) ─────────────────────────
  presignProductImage(productId: string, body: ProductImagePresignBody) {
    return request<ProductImagePresignResponse>(
      `/admin/products/${productId}/images/presign`,
      { method: "POST", body },
    );
  },
  confirmProductImages(productId: string, body: ProductImagesConfirmBody) {
    return request<ProductImagesConfirmResponse>(
      `/admin/products/${productId}/images/confirm`,
      { method: "POST", body },
    );
  },
  // Convenience: presign + S3 PUT, returns objectKey ready to confirm.
  async uploadProductImage(
    productId: string,
    file: File,
  ): Promise<{ objectKey: string; publicUrl: string | null }> {
    const ct = file.type as ProductImageContentType;
    const presigned = await this.presignProductImage(productId, {
      contentType: ct,
      contentLength: file.size,
    });
    await s3Put(presigned.uploadUrl, file);
    return {
      objectKey: presigned.objectKey,
      publicUrl: presigned.publicUrl,
    };
  },

  // ── Bulk CSV import ─────────────────────────────────────────────────────
  importProducts(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<ImportJobAccepted>("/admin/products/import", {
      method: "POST",
      body: form,
    });
  },
  getImportJob(jobId: string) {
    return request<ImportJobStatus>(
      `/admin/products/import/${encodeURIComponent(jobId)}`,
    );
  },

  // ── Coupons (Sprint 3) ──────────────────────────────────────────────────
  listCoupons(query: ListCouponsQuery = {}) {
    return request<AdminCouponsList>("/admin/coupons", { query });
  },
  getCoupon(id: string) {
    return request<AdminCouponDetail>(`/admin/coupons/${id}`);
  },
  createCoupon(body: CreateCouponBody) {
    return request<AdminCouponRow>("/admin/coupons", {
      method: "POST",
      body,
    });
  },
  updateCoupon(id: string, body: UpdateCouponBody) {
    return request<AdminCouponRow>(`/admin/coupons/${id}`, {
      method: "PATCH",
      body,
    });
  },
  deleteCoupon(id: string) {
    return request<void>(`/admin/coupons/${id}`, { method: "DELETE" });
  },

  // ── Product ↔ coupon attachments (Sprint 3) ─────────────────────────────
  attachProductCoupon(
    productId: string,
    slot: ProductCouponSlot,
    body: AttachProductCouponBody,
  ) {
    return request<AttachedSlotResponse>(
      `/admin/products/${productId}/coupons/${slot}`,
      { method: "PUT", body },
    );
  },
  detachProductCoupon(productId: string, slot: ProductCouponSlot) {
    return request<void>(`/admin/products/${productId}/coupons/${slot}`, {
      method: "DELETE",
    });
  },
};
