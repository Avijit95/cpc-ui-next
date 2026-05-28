// Browser-only fetch wrapper for the Cell Phone Crowd API.
// - Reads access token from a getter installed by AuthProvider (kept in memory).
// - On 401 it tries POST /auth/refresh, stores the new token, and replays.
//   The refresh is single-flighted across tabs via singleFlightRefresh
//   (Web Locks + BroadcastChannel) so N tabs share 1 network call.
// - Always sends credentials so the httpOnly `rt` cookie reaches /auth/*.

import { singleFlightRefresh } from "@/lib/auth/cross-tab-refresh";
import { ApiError, type ApiErrorPayload } from "./errors";
import type { RefreshResponse } from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;

let getAccessToken: TokenGetter = () => null;
let setAccessToken: TokenSetter = () => {};
let onUnauthorized: () => void = () => {};

export function configureApiClient(opts: {
  getAccessToken: TokenGetter;
  setAccessToken: TokenSetter;
  onUnauthorized?: () => void;
}) {
  getAccessToken = opts.getAccessToken;
  setAccessToken = opts.setAccessToken;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

export function getApiBaseUrl() {
  return BASE_URL;
}

/**
 * Read the current in-memory access token. Used by direct-fetch callers
 * (e.g. CSV downloads) that bypass the typed `request<T>` JSON pipeline.
 */
export function getCurrentAccessToken(): string | null {
  return getAccessToken();
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  // Skip the 401-refresh-replay loop (used by /auth/refresh itself).
  skipAuthRefresh?: boolean;
  // Skip attaching Authorization (public endpoints).
  anonymous?: boolean;
  signal?: AbortSignal;
};

// Single-flight refresh, shared across tabs (see cross-tab-refresh.ts).
// On success, writes the token through setAccessToken so the same call site
// works for both the bootstrap path (AuthProvider) and the 401-replay below.
export async function refreshAccessToken(): Promise<RefreshResponse | null> {
  const result = await singleFlightRefresh(async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      return (await res.json()) as RefreshResponse;
    } catch {
      return null;
    }
  });
  if (result) setAccessToken(result.accessToken);
  return result;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(
    path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  let payload: ApiErrorPayload;
  try {
    payload = (await res.json()) as ApiErrorPayload;
  } catch {
    payload = {
      statusCode: res.status,
      error: res.statusText || "ERROR",
      message: `Request failed with status ${res.status}`,
    };
  }
  return new ApiError(payload);
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {};
  const isFormData =
    typeof FormData !== "undefined" && opts.body instanceof FormData;
  // Don't set Content-Type for FormData — the browser supplies the multipart boundary.
  if (opts.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (!opts.anonymous) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    signal: opts.signal,
  };
  if (opts.body !== undefined) {
    if (isFormData || typeof opts.body === "string") {
      init.body = opts.body as BodyInit;
    } else {
      init.body = JSON.stringify(opts.body);
    }
  }

  let res = await fetch(url, init);

  if (res.status === 401 && !opts.skipAuthRefresh && !opts.anonymous) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${refreshed.accessToken}`;
      res = await fetch(url, { ...init, headers });
    } else {
      // Refresh failed — caller's auth state is gone.
      onUnauthorized();
      throw await parseError(res);
    }
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    throw await parseError(res);
  }

  // Some endpoints (PUT to S3) won't be hit through here, but if they are, they return text.
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// Direct PUT to S3 (presigned URL). Bypasses our backend entirely.
export async function s3Put(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) {
    throw new ApiError({
      statusCode: res.status,
      error: "S3_UPLOAD_FAILED",
      message: `S3 upload failed (${res.status})`,
    });
  }
}
