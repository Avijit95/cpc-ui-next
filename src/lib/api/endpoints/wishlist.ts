import { request } from "../client";
import type { WishlistMoveToCartResponse, WishlistView } from "../types";

export type AddWishlistItemBody = {
  productId: string;
  variantId?: string;
};

export type MoveToCartBody = {
  qty?: number;
};

export const wishlistApi = {
  view() {
    return request<WishlistView>("/wishlist");
  },
  addItem(body: AddWishlistItemBody) {
    return request<WishlistView>("/wishlist/items", { method: "POST", body });
  },
  removeItem(itemId: string) {
    return request<WishlistView>(
      `/wishlist/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  },
  moveToCart(itemId: string, body: MoveToCartBody = {}) {
    return request<WishlistMoveToCartResponse>(
      `/wishlist/items/${encodeURIComponent(itemId)}/move-to-cart`,
      { method: "POST", body },
    );
  },
};
