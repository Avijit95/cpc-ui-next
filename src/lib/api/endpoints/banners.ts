import { request } from "../client";
import type { Banner } from "../types";

export const bannersApi = {
  // Public endpoint — schedule-window filtered, sorted by position then sortOrder.
  getActive() {
    return request<Banner[]>("/banners/active", { anonymous: true });
  },
};
