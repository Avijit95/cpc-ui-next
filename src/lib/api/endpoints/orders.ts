import { request } from "../client";
import type {
  OrderCancelResponse,
  OrderDetail,
  OrderListResponse,
  OrderReturnResponse,
  OrderStatus,
  ReturnReason,
} from "../types";

export type ListOrdersQuery = {
  status?: OrderStatus;
  limit?: number;
  offset?: number;
};

export type CancelOrderBody = {
  reason?: string;
};

export type ReturnOrderBody = {
  reason: ReturnReason;
  note?: string;
};

export const ordersApi = {
  list(query: ListOrdersQuery = {}) {
    return request<OrderListResponse>("/me/orders", { query });
  },
  get(id: string) {
    return request<OrderDetail>(`/me/orders/${encodeURIComponent(id)}`);
  },
  cancel(id: string, body: CancelOrderBody = {}) {
    return request<OrderCancelResponse>(
      `/me/orders/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body },
    );
  },
  returnRequest(id: string, body: ReturnOrderBody) {
    return request<OrderReturnResponse>(
      `/me/orders/${encodeURIComponent(id)}/return-request`,
      { method: "POST", body },
    );
  },
};
