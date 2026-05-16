import { request } from "../client";
import type {
  Ticket,
  TicketAttachmentPresignResponse,
  TicketDetail,
  TicketListResponse,
  TicketMessage,
} from "../types";

export type ListMyTicketsQuery = {
  limit?: number;
  offset?: number;
};

export type CreateTicketBody = {
  subject: string;
  body: string;
  attachments?: string[];
};

export type CreateMessageBody = {
  body: string;
  attachments?: string[];
};

export type TicketAttachmentPresignBody = {
  contentType: string;
  contentLength: number;
};

export const ticketsApi = {
  // ── User side — @Controller('me/tickets') ─────────────────────────────
  list(query: ListMyTicketsQuery = {}) {
    return request<TicketListResponse>("/me/tickets", { query });
  },
  get(id: string) {
    return request<TicketDetail>(`/me/tickets/${encodeURIComponent(id)}`);
  },
  create(body: CreateTicketBody) {
    return request<Ticket>("/me/tickets", { method: "POST", body });
  },
  postMessage(id: string, body: CreateMessageBody) {
    return request<TicketMessage>(
      `/me/tickets/${encodeURIComponent(id)}/messages`,
      { method: "POST", body },
    );
  },
  presignAttachment(body: TicketAttachmentPresignBody) {
    return request<TicketAttachmentPresignResponse>(
      "/me/tickets/attachments/presign",
      { method: "POST", body },
    );
  },
};
