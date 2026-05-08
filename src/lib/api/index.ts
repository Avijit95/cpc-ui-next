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
  ListCouponsQuery,
  CreateCouponBody,
  UpdateCouponBody,
  AttachProductCouponBody,
} from "./endpoints/admin";
export { catalogApi } from "./endpoints/catalog";
export { cartApi } from "./endpoints/cart";
export type { AddCartItemBody, UpdateCartItemBody } from "./endpoints/cart";
export { wishlistApi } from "./endpoints/wishlist";
export type {
  AddWishlistItemBody,
  MoveToCartBody,
} from "./endpoints/wishlist";
export { healthApi } from "./endpoints/health";
export type * from "./types";
