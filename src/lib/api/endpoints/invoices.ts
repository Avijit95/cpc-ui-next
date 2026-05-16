import { request } from "../client";
import type { InvoiceDownloadResponse } from "../types";

export const invoicesApi = {
  download(id: string) {
    return request<InvoiceDownloadResponse>(
      `/me/invoices/${encodeURIComponent(id)}/download`,
    );
  },
};
