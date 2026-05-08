import { request } from "../client";
import type { CartView } from "../types";

export type AddCartItemBody = {
  productId: string;
  variantId?: string;
  qty: number;
};

export type UpdateCartItemBody = {
  qty?: number;
  customerCouponApplied?: boolean;
  retailCouponApplied?: boolean;
};

export const cartApi = {
  view() {
    return request<CartView>("/cart");
  },
  addItem(body: AddCartItemBody) {
    return request<CartView>("/cart/items", { method: "POST", body });
  },
  updateItem(itemId: string, body: UpdateCartItemBody) {
    return request<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body,
    });
  },
  removeItem(itemId: string) {
    return request<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
  },
};
