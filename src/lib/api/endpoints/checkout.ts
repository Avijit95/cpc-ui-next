import { request } from "../client";
import type { CheckoutResponse } from "../types";

export type CheckoutBody = {
  addressId: string;
  idempotencyKey?: string;
  // Buy Now: order only these cart lines (the rest of the cart stays). Omitted
  // → check out the whole cart.
  cartItemIds?: string[];
};

export const checkoutApi = {
  submit(body: CheckoutBody) {
    return request<CheckoutResponse>("/checkout", { method: "POST", body });
  },
};
