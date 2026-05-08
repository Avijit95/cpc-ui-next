export { ApiError, isApiError } from "./errors";
export type { ApiErrorPayload } from "./errors";
export {
  configureApiClient,
  getApiBaseUrl,
  request,
  s3Put,
} from "./client";
export { authApi } from "./endpoints/auth";
export { meApi } from "./endpoints/me";
export { partnersApi } from "./endpoints/partners";
export { adminApi } from "./endpoints/admin";
export type {
  ListPartnersQuery,
  CreateCategoryBody,
  UpdateCategoryBody,
  CreateProductBody,
  UpdateProductBody,
  ListProductsAdminQuery,
  CreateVariantBody,
  UpdateVariantBody,
  ProductImageContentType,
  ProductImagePresignBody,
  ProductImagesConfirmBody,
} from "./endpoints/admin";
export { catalogApi } from "./endpoints/catalog";
export { healthApi } from "./endpoints/health";
export type * from "./types";
