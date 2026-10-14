import { request, s3Put } from "../client";
import type {
  OrderCancelResponse,
  OrderDetail,
  OrderListResponse,
  OrderStatus,
  ReturnActionResponse,
  ReturnReason,
} from "../types";

export type ListOrdersQuery = {
  status?: OrderStatus;
  q?: string; // orderNumber prefix — 2026-05-18 sweep
  limit?: number;
  offset?: number;
};

export type CancelOrderBody = {
  reason?: string;
};

export type ReturnOrderBody = {
  type?: "RETURN" | "REPLACE"; // refund (default) or the same item again
  items: { orderItemId: string; qty: number }[];
  reason: ReturnReason;
  note?: string;
  photoKeys?: string[]; // from uploadReturnPhoto (max 5)
};

export type ReturnPhotoContentType = "image/jpeg" | "image/png" | "image/webp";

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
  // Item-level return request for a delivered order.
  createReturn(orderId: string, body: ReturnOrderBody) {
    return request<ReturnActionResponse>(
      `/me/orders/${encodeURIComponent(orderId)}/returns`,
      { method: "POST", body },
    );
  },
  withdrawReturn(returnId: string) {
    return request<ReturnActionResponse>(
      `/me/returns/${encodeURIComponent(returnId)}/withdraw`,
      { method: "POST" },
    );
  },
  // Presign + S3 PUT for one return photo; returns the objectKey to submit.
  async uploadReturnPhoto(file: File): Promise<{ objectKey: string }> {
    const presigned = await request<{
      uploadUrl: string;
      objectKey: string;
      expiresIn: number;
    }>("/me/returns/photos/presign", {
      method: "POST",
      body: {
        contentType: file.type as ReturnPhotoContentType,
        contentLength: file.size,
      },
    });
    await s3Put(presigned.uploadUrl, file);
    return { objectKey: presigned.objectKey };
  },
};
