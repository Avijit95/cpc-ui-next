// Shared types mirroring the Cell Phone Crowd backend (api-integration.md, commit b6526b2).

export type Role = "CUSTOMER" | "PARTNER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type KycStatus = "NONE" | "PENDING" | "VERIFIED" | "REJECTED";

export type PublicUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  kycStatus: KycStatus;
  companyName: string | null;
  gstNumber: string | null;
  profilePicUrl: string | null;
  phoneRequired: boolean;
};

export type LoginResponse = {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
};

export type RefreshResponse = {
  accessToken: string;
  expiresIn: number;
};

export type OtpRequestResponse = {
  requestId: string;
  expiresIn: number;
};

export type EmailChangeResponse = {
  message: string;
  expiresIn: number;
};

export type ProfilePicPresignResponse = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresIn: number;
};

export type KycDocType = "GST_CERT" | "BUSINESS_PROOF" | "OTHER";

export type KycPresignResponse = {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
};

export type KycDocument = {
  id: string;
  docType: KycDocType;
  objectKey: string;
};

export type KycDocumentDetail = KycDocument & {
  uploadedAt: string;
};

export type AdminPartner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  kycStatus: KycStatus;
  companyName: string | null;
  gstNumber: string | null;
  profilePicUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  kycRejectedReason: string | null;
};

export type AdminPartnerDetail = AdminPartner & {
  kycDocuments: KycDocumentDetail[];
};

export type AdminPartnersList = {
  items: AdminPartner[];
  total: number;
  limit: number;
  offset: number;
};

export type HealthResponse = {
  status: "ok" | "down";
  db: "up" | "down";
  redis: "up" | "down";
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog — public
// ────────────────────────────────────────────────────────────────────────────

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CatalogSort =
  | "price-asc"
  | "price-desc"
  | "newest"
  | "popular"
  | "top-rated";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  children: CategoryNode[];
};

export type DealPreview = {
  dealPrice: number;
  basePrice: number;
  endsAt: string;
  percentOff: number;
};

export type ListCard = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  basePrice: number;
  finalPrice: number;
  lowestVariantPrice: number | null;
  primaryImageUrl: string | null;
  badges: string[];
  ratingAverage: number | null;
  reviewCount: number;
  isBestSeller: boolean;
  isFeatured: boolean;
  deal: DealPreview | null;
};

export type PriceBucket = {
  label: string;
  min: number;
  max: number | null;
  count: number;
};

export type BrandFacet = { name: string; count: number };

export type ProductListResponse = {
  items: ListCard[];
  total: number;
  limit: number;
  offset: number;
  sortApplied: CatalogSort;
  sortNote?: string;
  facets: {
    brands: BrandFacet[];
    priceBuckets: PriceBucket[];
  };
};

export type GstInfo = { hsnCode: string; ratePercent: number };

export type CatalogPricingPreview = {
  basePrice: number;
  finalPrice: number;
  gst: GstInfo;
};

export type ProductImage = {
  objectKey: string;
  url: string | null;
  sortOrder: number;
};

export type VariantImage = { objectKey: string; url: string | null };

export type Variant = {
  id: string;
  sku: string;
  attributes: Record<string, unknown>;
  stock: number;
  pricing: CatalogPricingPreview;
  images: VariantImage[];
};

export type Crumb = { id: string; name: string; slug: string };

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  specs: Record<string, unknown>;
  images: ProductImage[];
  breadcrumbs: Crumb[];
  pricing: CatalogPricingPreview;
  deal: DealPreview | null;
  variants: Variant[];
  stock: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog — admin
// ────────────────────────────────────────────────────────────────────────────

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  imageObjectKey: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCategoryListItem = AdminCategory & {
  _count?: { products?: number; children?: number };
};

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  categoryId: string;
  basePrice: number;
  stock: number;
  status: ProductStatus;
  hsnCode: string | null;
  specs: Record<string, unknown>;
  images: string[];
  imagesSortOrder: number[];
  isBestSeller: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductListItem = AdminProduct & {
  _count?: { variants?: number };
};

export type AdminProductsList = {
  items: AdminProductListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminVariant = {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, unknown>;
  priceOverride: number | null;
  stock: number;
  imagesObjectKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProductCouponInline = {
  id: string;
  name: string;
  status: CouponStatus;
  value: number;
};

export type AdminProductDetail = AdminProduct & {
  variants: AdminVariant[];
  category: AdminCategory & { breadcrumb?: Crumb[] };
  coupons: {
    customer?: ProductCouponInline;
    retail?: ProductCouponInline;
  };
};

export type ProductImagePresignResponse = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string | null;
  expiresIn: number;
};

export type ProductImagesConfirmResponse = {
  images: string[];
  imagesSortOrder: number[];
};

// ────────────────────────────────────────────────────────────────────────────
// Bulk CSV import
// ────────────────────────────────────────────────────────────────────────────

export type ImportJobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused";

export type ImportJobError = { row: number; error: string };

export type ImportJobResult = {
  imported: number;
  skipped: number;
  errors: ImportJobError[];
};

export type ImportJobStatus = {
  jobId: string;
  state: ImportJobState;
  progress: unknown;
  result: ImportJobResult | null;
  failedReason: string | null;
};

export type ImportJobAccepted = { jobId: string };

// ────────────────────────────────────────────────────────────────────────────
// Cart — Sprint 3 (mirrors apps/api/src/modules/pricing/pricing.types.ts and
// cart.service.ts CartViewResponse)
// ────────────────────────────────────────────────────────────────────────────

export type CouponPreview = { id: string; name: string; value: number };

export type AppliedCoupon = CouponPreview;

export type CartGstLine = {
  hsnCode: string;
  ratePercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type PricedCartLine = {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  primaryImageUrl: string | null;
  deal: DealPreview | null;
  availableCoupons: { customer?: CouponPreview; retail?: CouponPreview };
  appliedCoupons: { customer?: AppliedCoupon; retail?: AppliedCoupon };
  discount: { customer: number; retail: number; total: number };
  lineSubtotal: number;
  gst: CartGstLine;
  lineGrandTotal: number;
};

export type ShippingHint = {
  zone: string;
  estimatedRate: number;
  freeShipThreshold: number | null;
  amountAwayFromFree: number | null;
};

export type StaleApplication = {
  cartItemId: string;
  type: "customer" | "retail";
  reason: "COUPON_REMOVED" | "PARTNER_NOT_VERIFIED";
};

export type StockWarning = {
  cartItemId: string;
  requested: number;
  available: number;
};

export type CartView = {
  items: PricedCartLine[];
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  grandTotal: number;
  staleApplications: StaleApplication[];
  stockWarnings: StockWarning[];
  shippingHint: ShippingHint | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Wishlist — Sprint 3
// ────────────────────────────────────────────────────────────────────────────

export type WishlistCardItem = {
  wishlistItemId: string;
  variantId: string | null;
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  basePrice: number;
  finalPrice: number;
  lowestVariantPrice: number | null;
  primaryImageUrl: string | null;
  badges: string[];
};

export type WishlistView = { items: WishlistCardItem[] };

export type WishlistMoveToCartResponse = {
  cart: CartView;
  wishlist: WishlistView;
};

// ────────────────────────────────────────────────────────────────────────────
// Coupons — Sprint 3 (admin)
// ────────────────────────────────────────────────────────────────────────────

export type CouponType = "CUSTOMER_FIXED" | "RETAIL_PERCENT";
export type CouponStatus = "ACTIVE" | "PAUSED";

export type AdminCouponRow = {
  id: string;
  name: string;
  type: CouponType;
  status: CouponStatus;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminCouponDetail = AdminCouponRow & {
  attachments: { productId: string; productName: string; value: number }[];
};

export type AdminCouponsList = {
  items: AdminCouponRow[];
  total: number;
  limit: number;
  offset: number;
};

export type ProductCouponSlot = "customer" | "retail";

export type AttachedSlotResponse = {
  productId: string;
  slot: ProductCouponSlot;
  couponId: string;
  couponName: string;
  value: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Addresses — Sprint 4 (api-integration.md §11)
// ────────────────────────────────────────────────────────────────────────────

// ISO 3166-2:IN state codes. Order matches §11.2 of the integration doc.
export type StateCode =
  | "AN" | "AP" | "AR" | "AS" | "BR" | "CG" | "CH" | "DH" | "DL"
  | "GA" | "GJ" | "HP" | "HR" | "JH" | "JK" | "KA" | "KL" | "LA"
  | "LD" | "MH" | "ML" | "MN" | "MP" | "MZ" | "NL" | "OR" | "PB"
  | "PY" | "RJ" | "SK" | "TG" | "TN" | "TR" | "UK" | "UP" | "WB";

export type Address = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  stateCode: StateCode;
  pincode: string;
  country: "IN";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AddressDeleteResponse = { ok: true };

// ────────────────────────────────────────────────────────────────────────────
// Orders & Invoices — Sprint 4 (api-integration.md §13)
// ────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED";

export type ReturnReason =
  | "DAMAGED"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "OTHER";

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  primaryImageUrl: string | null;
};

export type OrderListResponse = {
  items: OrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type OrderAddressSnapshot = {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  stateCode: StateCode;
  pincode: string;
  country: string;
  label?: string | null;
};

export type OrderItemRow = {
  productName: string;
  variantSku?: string | null;
  variantAttributes?: Record<string, unknown> | null;
  hsnCode: string;
  qty: number;
  unitPrice: number;
  customerCouponName?: string | null;
  customerCouponValue?: number | null;
  retailCouponName?: string | null;
  retailCouponPercent?: number | null;
  customerDiscount: number;
  retailDiscount: number;
  lineSubtotal: number;
  gstRatePercent: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineGrandTotal: number;
};

export type OrderStatusHistoryEntry = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: string | null;
  note?: string | null;
  createdAt: string;
};

export type OrderInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  generatedAt: string | null;
  downloadUrl: string | null;
  downloadExpiresIn: number | null;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  shippingTotal: number;
  recipientName: string;
  recipientPhone: string;
  recipientStateCode: StateCode;
  addressSnapshot: OrderAddressSnapshot;
  addressId: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  returnRequestedAt?: string | null;
  returnedAt?: string | null;
  returnReason?: ReturnReason | null;
  returnReasonNote?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  items: OrderItemRow[];
  statusHistory: OrderStatusHistoryEntry[];
  invoice: OrderInvoiceSummary | null;
};

export type OrderCancelResponse = {
  id: string;
  orderNumber: string;
  status: "CANCELLED";
};

export type OrderReturnResponse = {
  id: string;
  orderNumber: string;
  status: "RETURN_REQUESTED";
};

export type InvoiceDownloadResponse = {
  url: string;
  expiresIn: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Checkout — Sprint 4 (api-integration.md §12)
// ────────────────────────────────────────────────────────────────────────────

export type CheckoutResponse = {
  orderId: string;
  orderNumber: string;
  status: "PENDING_PAYMENT";
  grandTotal: number;
};

// Shape of the `details` field on STOCK_INSUFFICIENT 409 responses.
export type StockShortage = {
  productId: string;
  variantId: string | null;
  requested: number;
  available: number;
};

// Admin order list / detail shapes (api-integration.md §14).
export type AdminOrderUserSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  createdAt: string;
  updatedAt: string;
  recipientName: string;
  recipientStateCode: StateCode;
  itemCount: number;
  user: AdminOrderUserSummary;
};

export type AdminOrderListResponse = {
  items: AdminOrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminOrderDetail = OrderDetail & {
  user: AdminOrderUserSummary;
  legalTransitions: OrderStatus[];
};

export type AdminOrderStatusPatchResponse = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
};

export type AdminRegenerateInvoiceResponse = {
  ok: true;
  jobId: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Admin operations — Sprint 5a (api-integration.md §16)
// ────────────────────────────────────────────────────────────────────────────

export type ActivityLogActor = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
} | null;

export type ActivityLogRow = {
  id: string;
  actorUserId: string | null;
  actorRole: Role | null;
  action: string;
  targetType: string;
  targetId: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: ActivityLogActor;
};

export type ActivityLogResponse = {
  rows: ActivityLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  companyName: string | null;
  gstNumber: string | null;
  kycStatus: KycStatus;
  kycRejectedReason: string | null;
  profilePicUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  _count: { orders: number };
};

export type AdminUsersListResponse = {
  rows: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
};

export type DashboardSummary = {
  todayOrders: { count: number; revenue: number };
  revenue: { today: number; last7Days: number; monthToDate: number };
  pendingPartners: number;
  topProducts: { productId: string; name: string; unitsSold: number }[];
  lowStockAlerts: {
    threshold: number;
    count: number;
    items: {
      kind: "product" | "variant";
      id: string;
      productId: string;
      label: string;
      stock: number;
    }[];
  };
};

export type ReportGroupBy = "day" | "week" | "month";

export type SalesReportBucket = {
  bucket: string;
  orderCount: number;
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  shippingTotal: number;
  grandTotal: number;
};

export type SalesReport = {
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  buckets: SalesReportBucket[];
};

export type PartnersReportRow = {
  partnerId: string;
  name: string;
  email: string | null;
  companyName: string | null;
  orderCount: number;
  gross: number;
  discountTotal: number;
  lastOrderAt: string | null;
};

export type PartnersReport = {
  from: string | null;
  to: string | null;
  partners: PartnersReportRow[];
};

export type ProductsReportSort = "top" | "slow";

export type ProductsReportRow = {
  productId: string;
  name: string;
  stock: number;
  unitsSold: number;
  gross: number;
};

export type ProductsReport = {
  from: string | null;
  to: string | null;
  sort: ProductsReportSort;
  products: ProductsReportRow[];
};

export type ReportExportType = "sales" | "partners" | "products";
export type ReportExportStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type ReportExportRow = {
  id: string;
  requestedByUserId: string;
  reportType: ReportExportType;
  params: Record<string, unknown>;
  status: ReportExportStatus;
  objectKey: string | null;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportExportDetail = ReportExportRow & {
  downloadUrl: string | null;
};

export type ReportExportListResponse = { rows: ReportExportRow[] };

// ────────────────────────────────────────────────────────────────────────────
// Support tickets — Sprint 5b (api-integration.md §17.4)
// ────────────────────────────────────────────────────────────────────────────

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type TicketAuthor = {
  id: string;
  name: string;
  role: Role;
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  authorUserId: string;
  author: TicketAuthor;
  body: string;
  attachments: string[];
  attachmentUrls?: string[];
  isInternalNote: boolean;
  createdAt: string;
};

export type Ticket = {
  id: string;
  userId: string;
  user?: TicketAuthor; // present on admin side
  assigneeId: string | null;
  assignee?: TicketAuthor | null;
  subject: string;
  body: string;
  attachments: string[];
  attachmentUrls?: string[];
  status: TicketStatus;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketDetail = Ticket & {
  messages: TicketMessage[];
};

export type TicketListResponse = {
  rows: Ticket[];
  total: number;
  limit: number;
  offset: number;
};

export type TicketAttachmentPresignResponse = {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Today Deals — admin-managed, time-windowed product pricing
// ────────────────────────────────────────────────────────────────────────────

export type DealProductSummary = {
  id: string;
  slug: string;
  name: string;
  primaryImageUrl: string | null;
  status: ProductStatus;
};

export type Deal = {
  id: string;
  productId: string;
  dealPrice: number;
  basePrice: number;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  product: DealProductSummary;
};

export type DealListResponse = {
  items: Deal[];
  total: number;
  limit: number;
  offset: number;
};

export type DealLifecycle = "live" | "upcoming" | "expired" | "all";

// ────────────────────────────────────────────────────────────────────────────
// Banners — Sprint 5b (api-integration.md §17.3)
// ────────────────────────────────────────────────────────────────────────────

export type Banner = {
  id: string;
  imageObjectKey: string;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
  activeFrom: string | null;
  activeTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BannerPresignResponse = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string | null;
  expiresIn: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Reviews — Sprint 6 (api-integration.md §18.1)
// ────────────────────────────────────────────────────────────────────────────

export type ReviewAuthor = { id: string; name: string };

export type Review = {
  id: string;
  userId: string;
  user: ReviewAuthor;
  productId: string;
  rating: number; // 1–5
  text: string | null;
  photos: string[]; // object keys
  photoUrls: string[]; // CDN URLs aligned by index with `photos`
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReviewAggregate = {
  count: number;
  average: number;
};

export type ReviewListResponse = {
  items: Review[];
  total: number;
  limit: number;
  offset: number;
  aggregate: ReviewAggregate;
};

export type ReviewDeleteResponse = { id: string };

export type AdminReviewProduct = { id: string; slug: string; name: string };

export type AdminReviewRow = Review & { product: AdminReviewProduct };

export type AdminReviewsListResponse = {
  items: AdminReviewRow[];
  total: number;
  limit: number;
  offset: number;
};

export type ReviewPhotoPresignResponse = {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Password reset — Sprint 6 (api-integration.md §18.2)
// ────────────────────────────────────────────────────────────────────────────

export type PasswordForgotResponse = { message: string };
export type PasswordResetResponse = { message: string };

// ────────────────────────────────────────────────────────────────────────────
// Partner dashboard — 2026-05-18 sweep (GET /me/partner/dashboard)
// ────────────────────────────────────────────────────────────────────────────

export type PartnerRecentOrder = {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  primaryImageUrl: string | null;
};

export type PartnerDashboardResponse = {
  orderCount: number;
  gross: number;
  discountClaimed: number;
  lastOrderAt: string | null;
  recentOrders: PartnerRecentOrder[];
};

// ────────────────────────────────────────────────────────────────────────────
// KYC doc download — 2026-05-18 sweep
// (GET /admin/partners/:userId/kyc-docs/:docId/download)
// ────────────────────────────────────────────────────────────────────────────

export type KycDocDownloadResponse = { url: string; expiresIn: number };

// ────────────────────────────────────────────────────────────────────────────
// Wishlist bulk clear — 2026-05-18 sweep (DELETE /wishlist)
// ────────────────────────────────────────────────────────────────────────────

export type WishlistClearResponse = { deletedCount: number };
