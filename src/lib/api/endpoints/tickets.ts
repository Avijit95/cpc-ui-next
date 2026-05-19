import { request, s3Put } from "../client";
import type {
  Ticket,
  TicketAttachmentPresignResponse,
  TicketDetail,
  TicketListResponse,
  TicketMessage,
} from "../types";

export type TicketAttachmentContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

export const TICKET_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const TICKET_ATTACHMENT_TYPES: readonly TicketAttachmentContentType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const TICKET_ATTACHMENT_MAX_COUNT = 5;

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
  // Convenience: presign + S3 PUT, returns the objectKey to attach.
  // The admin-side reply box uses this same endpoint — keys are scoped to the
  // current user but the backend accepts any valid key on admin message posts.
  async uploadAttachment(file: File): Promise<{ objectKey: string }> {
    const presigned = await ticketsApi.presignAttachment({
      contentType: file.type as TicketAttachmentContentType,
      contentLength: file.size,
    });
    await s3Put(presigned.uploadUrl, file);
    return { objectKey: presigned.objectKey };
  },
};
