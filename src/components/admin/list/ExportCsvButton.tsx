"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  getApiBaseUrl,
  getCurrentAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";

type Props = {
  // API path like "/admin/products/export.csv".
  path: string;
  // Query params to append (filters + sort, but NOT pagination).
  query?: Record<string, string | number | boolean | undefined | null>;
  // Filename without extension; ".csv" + timestamp suffix added automatically.
  filename: string;
  onError?: (message: string) => void;
};

function buildExportUrl(path: string, query: Props["query"]): string {
  const base = getApiBaseUrl();
  const url = new URL(
    path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function downloadCsv(url: string, filename: string): Promise<void> {
  const doFetch = async (token: string | null) => {
    return fetch(url, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
  };

  let res = await doFetch(getCurrentAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error("Your session expired. Please sign in again.");
    res = await doFetch(refreshed.accessToken);
  }
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) msg = String(body.message);
    } catch {
      // CSV/HTML error response — keep default message.
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ExportCsvButton({
  path,
  query,
  filename,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadCsv(buildExportUrl(path, query), `${filename}-${stamp}.csv`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] text-gray-700 px-3 py-2 rounded-lg disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      Export CSV
    </button>
  );
}
