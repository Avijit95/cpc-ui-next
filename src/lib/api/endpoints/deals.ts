import { request } from "../client";
import type { Deal } from "../types";

export const dealsApi = {
  // Public — currently-live deals (isActive + within window + product ACTIVE).
  getToday() {
    return request<Deal[]>("/deals/today", { anonymous: true });
  },
};
