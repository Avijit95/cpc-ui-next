import { request } from "../client";
import type { HealthResponse } from "../types";

export const healthApi = {
  get() {
    return request<HealthResponse>("/health", { anonymous: true });
  },
};
