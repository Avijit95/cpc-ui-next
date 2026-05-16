import { request } from "../client";
import type { CheckoutResponse } from "../types";

export type CheckoutBody = {
  addressId: string;
  idempotencyKey?: string;
};

export const checkoutApi = {
  submit(body: CheckoutBody) {
    return request<CheckoutResponse>("/checkout", { method: "POST", body });
  },
};
