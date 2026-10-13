import { request } from "../client";
import type {
  PaymentInitiateResponse,
  PaymentStatusResponse,
} from "../types";

export const paymentsApi = {
  // Start (or retry) payment for an order → Cashfree payment session.
  initiate(orderId: string) {
    return request<PaymentInitiateResponse>("/payments/initiate", {
      method: "POST",
      body: { orderId },
    });
  },
  // Server-verified payment status, polled by the post-payment result page.
  status(orderId: string) {
    return request<PaymentStatusResponse>(
      `/payments/${encodeURIComponent(orderId)}/status`,
    );
  },
};
