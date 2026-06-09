import { request, s3Put } from "../client";
import type {
  ActivityLogResponse,
  Address,
  AdminCategory,
  AdminCategoryListItem,
  AdminCouponDetail,
  AdminCouponRow,
  AdminCouponsList,
  AdminReviewRow,
  AdminReviewsListResponse,
  AdminOrderDetail,
  AdminOrderListResponse,
  AdminOrderStatusPatchResponse,
  AdminPartner,
  AdminPartnerDetail,
  AdminPartnersList,
  AdminProduct,
  AdminProductDetail,
  AdminProductsList,
  AdminRegenerateInvoiceResponse,
  AdminUserDetail,
  AdminUserRow,
  AdminUsersListResponse,
  AdminVariant,
  AdminProductVariantOption,
  AttachedSlotResponse,
  Banner,
  BannerPresignResponse,
  CouponStatus,
  CouponType,
  DashboardSummary,
  Deal,
  DealLifecycle,
  DealListResponse,
  ImportJobAccepted,
  ImportJobStatus,
  KycDocDownloadResponse,
  KycStatus,
  OrderStatus,
  PartnersReport,
  ProductCouponSlot,
  ProductImagePresignResponse,
  ProductImagesConfirmResponse,
  ProductStatus,
  ProductsReport,
  ProductsReportSort,
  ReportExportDetail,
  ReportExportListResponse,
  ReportExportType,
  ReportGroupBy,
  Role,
  SalesReport,
  Ticket,
  TicketDetail,
  TicketListResponse,
  TicketMessage,
  TicketStatus,
  UserStatus,
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
  isActive?: boolean;
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
  isBestSeller?: boolean;
  isFeatured?: boolean;
};

export type UpdateProductBody = Partial<CreateProductBody>;

/**
 * Shared sort + date-range query params for admin list endpoints.
 * Date strings are `YYYY-MM-DD` (from <input type="date">) and interpreted as
 * IST day boundaries on the server.
 */
export type AdminListSortFilter = {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

export type ListProductsAdminQuery = AdminListSortFilter & {
  status?: ProductStatus;
  categoryId?: string;
  brand?: string;
  search?: string;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  limit?: number;
  offset?: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Variants
// ────────────────────────────────────────────────────────────────────────────

export type CreateVariantBody = {
  sku: string;
  attributes: Record<string, unknown>;
  basePrice?: number | null;
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

export type ListCouponsQuery = AdminListSortFilter & {
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

export type ListAdminOrdersQuery = AdminListSortFilter & {
  status?: OrderStatus;
  userId?: string;
  q?: string;
  from?: string; // ISO date — legacy filter on createdAt
  to?: string; // ISO date — legacy filter on createdAt
  limit?: number;
  offset?: number;
};

export type PatchOrderStatusBody = {
  toStatus: OrderStatus;
  note?: string;
};

export type CreateAdminOrderItem = {
  productId: string;
  variantId?: string;
  qty: number;
};

export type CreateAdminOrderBody = {
  userId: string;
  addressId: string;
  items: CreateAdminOrderItem[];
  idempotencyKey?: string;
};

export type CreateAdminOrderResponse = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
};

// ── Activity log + admin users + dashboard + reports (Sprint 5a) ─────────

export type ListActivityLogsQuery = AdminListSortFilter & {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type ListAdminUsersQuery = AdminListSortFilter & {
  role?: Role;
  status?: UserStatus;
  kycStatus?: KycStatus;
  q?: string;
  limit?: number;
  offset?: number;
};

export type PatchUserRoleBody = { role: Role };
export type PatchUserStatusBody = { status: "ACTIVE" | "SUSPENDED" };

export type SalesReportQuery = {
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
};

export type PartnersReportQuery = {
  from?: string;
  to?: string;
};

export type ProductsReportQuery = {
  from?: string;
  to?: string;
  sort?: ProductsReportSort;
  limit?: number;
};

export type SalesExportBody = {
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
};

export type PartnersExportBody = {
  from?: string;
  to?: string;
};

export type ProductsExportBody = {
  from?: string;
  to?: string;
  sort?: ProductsReportSort;
  limit?: number;
};

export type ListAdminTicketsQuery = AdminListSortFilter & {
  status?: TicketStatus;
  assigneeId?: string;
  q?: string; // subject contains — 2026-05-18 sweep
  limit?: number;
  offset?: number;
};

export type UpdateTicketBody = {
  status?: TicketStatus;
  assigneeId?: string | null;
};

export type AdminTicketMessageBody = {
  body: string;
  attachments?: string[];
  isInternalNote?: boolean;
};

// ── Reviews moderation (Sprint 6) ───────────────────────────────────────
export type ListAdminReviewsQuery = AdminListSortFilter & {
  productId?: string;
  isApproved?: boolean;
  limit?: number;
  offset?: number;
};

export type PatchAdminReviewBody = { isApproved: boolean };

export type BannerPresignContentType = "image/jpeg" | "image/png" | "image/webp";

export type BannerPresignBody = {
  contentType: BannerPresignContentType;
  contentLength: number;
};

export type CreateBannerBody = {
  imageObjectKey: string;
  position: string;
  linkUrl?: string;
  sortOrder?: number;
  activeFrom?: string | null;
  activeTo?: string | null;
  isActive?: boolean;
};

// PATCH allows nulling out linkUrl / activeFrom / activeTo per the spec.
export type UpdateBannerBody = {
  imageObjectKey?: string;
  position?: string;
  linkUrl?: string | null;
  sortOrder?: number;
  activeFrom?: string | null;
  activeTo?: string | null;
  isActive?: boolean;
};

export type AttachProductCouponBody = {
  couponId: string;
  value: number;
};

export type CreateDealBody = {
  productId: string;
  variantId?: string | null;
  dealPrice: number;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
};

export type UpdateDealBody = {
  dealPrice?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
};

export type ListAdminDealsQuery = AdminListSortFilter & {
  status?: DealLifecycle;
  productId?: string;
  limit?: number;
  offset?: number;
};

// ── Brands (Sprint 8.5) — derived from Product.brand ──────────────────────
export type AdminBrandRow = {
  name: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListAdminBrandsQuery = {
  search?: string;
  sortBy?: "name" | "productCount" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  createdFrom?: string;
  createdTo?: string;
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
  // 2026-05-18 sweep — Gap #8
  downloadKycDoc(userId: string, docId: string) {
    return request<KycDocDownloadResponse>(
      `/admin/partners/${encodeURIComponent(userId)}/kyc-docs/${encodeURIComponent(docId)}/download`,
    );
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
  listVariants(productId: string) {
    return request<AdminProductVariantOption[]>(
      `/admin/products/${productId}/variants`,
    );
  },
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

  // ── Orders (Sprint 4) ───────────────────────────────────────────────────
  listOrders(query: ListAdminOrdersQuery = {}) {
    return request<AdminOrderListResponse>("/admin/orders", { query });
  },
  getOrder(id: string) {
    return request<AdminOrderDetail>(
      `/admin/orders/${encodeURIComponent(id)}`,
    );
  },
  patchOrderStatus(id: string, body: PatchOrderStatusBody) {
    return request<AdminOrderStatusPatchResponse>(
      `/admin/orders/${encodeURIComponent(id)}/status`,
      { method: "PATCH", body },
    );
  },
  regenerateInvoice(id: string) {
    return request<AdminRegenerateInvoiceResponse>(
      `/admin/orders/${encodeURIComponent(id)}/regenerate-invoice`,
      { method: "POST" },
    );
  },
  createOrder(body: CreateAdminOrderBody) {
    return request<CreateAdminOrderResponse>("/admin/orders", {
      method: "POST",
      body,
    });
  },

  // ── Brands (derived) ────────────────────────────────────────────────────
  listBrands(query: ListAdminBrandsQuery = {}) {
    return request<{ items: AdminBrandRow[]; total: number }>(
      "/admin/brands",
      { query },
    );
  },

  // ── Today Deals ─────────────────────────────────────────────────────────
  listDeals(query: ListAdminDealsQuery = {}) {
    return request<DealListResponse>("/admin/deals", { query });
  },
  getDeal(id: string) {
    return request<Deal>(`/admin/deals/${encodeURIComponent(id)}`);
  },
  createDeal(body: CreateDealBody) {
    return request<Deal>("/admin/deals", { method: "POST", body });
  },
  updateDeal(id: string, body: UpdateDealBody) {
    return request<Deal>(`/admin/deals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  toggleDeal(id: string) {
    return request<Deal>(`/admin/deals/${encodeURIComponent(id)}/toggle`, {
      method: "POST",
    });
  },
  deleteDeal(id: string) {
    return request<{ id: string }>(`/admin/deals/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  // ── Banners (Sprint 5b) ─────────────────────────────────────────────────
  listBanners() {
    return request<Banner[]>("/admin/banners");
  },
  getBanner(id: string) {
    return request<Banner>(`/admin/banners/${encodeURIComponent(id)}`);
  },
  createBanner(body: CreateBannerBody) {
    return request<Banner>("/admin/banners", { method: "POST", body });
  },
  updateBanner(id: string, body: UpdateBannerBody) {
    return request<Banner>(`/admin/banners/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  deleteBanner(id: string) {
    return request<{ id: string }>(
      `/admin/banners/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
  presignBanner(body: BannerPresignBody) {
    return request<BannerPresignResponse>("/admin/banners/presign", {
      method: "POST",
      body,
    });
  },
  // Convenience: presign + S3 PUT, returns objectKey ready to attach.
  async uploadBannerImage(
    file: File,
  ): Promise<{ objectKey: string; publicUrl: string | null }> {
    const ct = file.type as BannerPresignContentType;
    const presigned = await this.presignBanner({
      contentType: ct,
      contentLength: file.size,
    });
    await s3Put(presigned.uploadUrl, file);
    return {
      objectKey: presigned.objectKey,
      publicUrl: presigned.publicUrl,
    };
  },

  // ── Activity logs (Sprint 5a) ───────────────────────────────────────────
  listActivityLogs(query: ListActivityLogsQuery = {}) {
    return request<ActivityLogResponse>("/admin/activity-logs", { query });
  },

  // ── Admin users (Sprint 5a) ─────────────────────────────────────────────
  listAdminUsers(query: ListAdminUsersQuery = {}) {
    return request<AdminUsersListResponse>("/admin/users", { query });
  },
  getAdminUser(id: string) {
    return request<AdminUserDetail>(
      `/admin/users/${encodeURIComponent(id)}`,
    );
  },
  listUserAddresses(userId: string) {
    return request<Address[]>(
      `/admin/users/${encodeURIComponent(userId)}/addresses`,
    );
  },

  // ── Reviews moderation (Sprint 6) ─────────────────────────────────────
  listReviews(query: ListAdminReviewsQuery = {}) {
    return request<AdminReviewsListResponse>("/admin/reviews", { query });
  },
  patchReview(id: string, body: PatchAdminReviewBody) {
    return request<AdminReviewRow>(
      `/admin/reviews/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    );
  },
  patchUserRole(id: string, body: PatchUserRoleBody) {
    return request<AdminUserRow>(
      `/admin/users/${encodeURIComponent(id)}/role`,
      { method: "PATCH", body },
    );
  },
  patchUserStatus(id: string, body: PatchUserStatusBody) {
    return request<AdminUserRow>(
      `/admin/users/${encodeURIComponent(id)}/status`,
      { method: "PATCH", body },
    );
  },

  // ── Dashboard (Sprint 5a) ───────────────────────────────────────────────
  getDashboard() {
    return request<DashboardSummary>("/admin/dashboard");
  },

  // ── Reports (Sprint 5a) ─────────────────────────────────────────────────
  getSalesReport(query: SalesReportQuery) {
    return request<SalesReport>("/admin/reports/sales", { query });
  },
  getPartnersReport(query: PartnersReportQuery = {}) {
    return request<PartnersReport>("/admin/reports/partners", { query });
  },
  getProductsReport(query: ProductsReportQuery = {}) {
    return request<ProductsReport>("/admin/reports/products", { query });
  },

  // ── Report exports (Sprint 5a) ──────────────────────────────────────────
  enqueueSalesExport(body: SalesExportBody) {
    return request<ReportExportDetail>("/admin/reports/sales/export", {
      method: "POST",
      body,
    });
  },
  enqueuePartnersExport(body: PartnersExportBody) {
    return request<ReportExportDetail>("/admin/reports/partners/export", {
      method: "POST",
      body,
    });
  },
  enqueueProductsExport(body: ProductsExportBody) {
    return request<ReportExportDetail>("/admin/reports/products/export", {
      method: "POST",
      body,
    });
  },
  listReportExports() {
    return request<ReportExportListResponse>("/admin/reports/exports");
  },
  getReportExport(id: string) {
    return request<ReportExportDetail>(
      `/admin/reports/exports/${encodeURIComponent(id)}`,
    );
  },
  // Convenience: tell TypeScript which export type returned. (Same shape.)
  enqueueReportExport(
    type: ReportExportType,
    body: SalesExportBody | PartnersExportBody | ProductsExportBody,
  ) {
    const path = `/admin/reports/${type}/export`;
    return request<ReportExportDetail>(path, { method: "POST", body });
  },

  // ── Support tickets (Sprint 5b — admin side) ────────────────────────────
  listTickets(query: ListAdminTicketsQuery = {}) {
    return request<TicketListResponse>("/admin/tickets", { query });
  },
  getTicket(id: string) {
    return request<TicketDetail>(`/admin/tickets/${encodeURIComponent(id)}`);
  },
  updateTicket(id: string, body: UpdateTicketBody) {
    return request<Ticket>(`/admin/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  postTicketMessage(id: string, body: AdminTicketMessageBody) {
    return request<TicketMessage>(
      `/admin/tickets/${encodeURIComponent(id)}/messages`,
      { method: "POST", body },
    );
  },
};
