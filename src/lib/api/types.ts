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
export type CatalogSort = "price-asc" | "price-desc" | "newest" | "popular";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  children: CategoryNode[];
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

export type AdminProductDetail = AdminProduct & {
  variants: AdminVariant[];
  category: AdminCategory & { breadcrumb?: Crumb[] };
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
