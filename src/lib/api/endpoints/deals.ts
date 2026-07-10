import { request } from "../client";
import type { Deal } from "../types";

export const dealsApi = {
  // Public — currently-live deals (isActive + within window + product ACTIVE).
  // Passes limit=50 so the backend returns all variant deals, not just 1 per product.
  getToday() {
    return request<Deal[]>("/deals/today", { anonymous: true, query: { limit: "50" } });
  },
};
