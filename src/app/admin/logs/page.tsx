"use client";

import { useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type { ActivityLogRow } from "@/lib/api";
import {
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 25;

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function methodBadgeStyle(action: string): string {
  const method = action.split(":")[0] ?? "";
  if (method === "POST") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (method === "PATCH") return "bg-amber-50 text-amber-700 border-amber-200";
  if (method === "PUT") return "bg-blue-50 text-blue-700 border-blue-200";
  if (method === "DELETE") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default function LogsPage() {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listActivityLogs({
        action: actionFilter.trim() || undefined,
        targetType: targetType.trim() || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then((resp) => {
        if (cancelled) return;
        setRows(resp.rows);
        setTotal(resp.total);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load activity logs",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actionFilter, targetType, from, to, offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminHeader
        title="Activity Logs"
        subtitle="Every admin mutation is auto-audited by the ActivityLog interceptor"
      />

      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-500 mb-1">
              Action (substring match)
            </label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setOffset(0);
                  setLoading(true);
                }}
                placeholder="PATCH:/admin/users"
                className="bg-transparent outline-none text-sm text-gray-700 flex-1"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target type</label>
            <input
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setOffset(0);
                setLoading(true);
              }}
              placeholder="users, orders, coupons…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
                setLoading(true);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
                setLoading(true);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
            />
          </div>
        </div>

        {/* List */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading
                ? "Loading…"
                : `${total} log${total === 1 ? "" : "s"}`}
            </p>
          </div>

          {loading ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="m-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <Activity size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                No activity matches these filters.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => {
                const isOpen = !!expanded[row.id];
                const methodPath = row.action.split(":");
                const method = methodPath[0] ?? row.action;
                const path = methodPath.slice(1).join(":") || row.action;
                return (
                  <li key={row.id} className="px-5 py-3">
                    <button
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [row.id]: !prev[row.id],
                        }))
                      }
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${methodBadgeStyle(row.action)} flex-shrink-0`}
                      >
                        {method}
                      </span>
                      <span className="font-mono text-xs text-gray-700 truncate flex-1 min-w-0">
                        {path}
                      </span>
                      <span className="text-xs text-gray-500 hidden sm:block whitespace-nowrap">
                        {row.actor?.name ?? "—"}{" "}
                        <span className="text-gray-400">
                          ({row.actor?.role ?? "?"})
                        </span>
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDateTime(row.createdAt)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mt-3 ml-12 space-y-1.5 text-xs">
                        <div className="grid grid-cols-2 gap-3 text-gray-600">
                          <div>
                            <span className="font-semibold text-gray-700">
                              Target:
                            </span>{" "}
                            {row.targetType}
                            {row.targetId ? ` · ${row.targetId}` : ""}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-700">IP:</span>{" "}
                            {row.ip ?? "—"}
                          </div>
                        </div>
                        {row.userAgent && (
                          <div className="text-gray-500">
                            <span className="font-semibold text-gray-700">UA:</span>{" "}
                            <span className="break-all">{row.userAgent}</span>
                          </div>
                        )}
                        {row.diff && Object.keys(row.diff).length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 mb-1">Diff</p>
                            <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-700 overflow-x-auto">
                              {JSON.stringify(row.diff, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && !error && total > PAGE_SIZE && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Page {page} of {pageCount} · {total} total
              </span>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => {
                    setOffset(Math.max(0, offset - PAGE_SIZE));
                    setLoading(true);
                  }}
                  className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} /> Previous
                </button>
                <button
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => {
                    setOffset(offset + PAGE_SIZE);
                    setLoading(true);
                  }}
                  className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
