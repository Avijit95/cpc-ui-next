"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminOrderListItem,
  ListAdminOrdersQuery,
  OrderStatus,
} from "@/lib/api";
import {
  Search,
  Eye,
  Truck,
  Package2,
  CheckCircle2,
  RefreshCcw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

const STATUS_FILTERS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "RETURN_REQUESTED", label: "Return Requested" },
  { value: "RETURNED", label: "Returned" },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending Payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return Requested",
  RETURNED: "Returned",
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-gray-100 text-gray-600 border-gray-200",
  CONFIRMED: "bg-blue-50 text-blue-600 border-blue-200",
  PROCESSING: "bg-amber-50 text-amber-600 border-amber-200",
  SHIPPED: "bg-indigo-50 text-indigo-600 border-indigo-200",
  DELIVERED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 border-red-200",
  RETURN_REQUESTED: "bg-orange-50 text-orange-600 border-orange-200",
  RETURNED: "bg-gray-200 text-gray-700 border-gray-300",
};

const summaryCardsConfig: { key: OrderStatus | "ALL"; label: string; tint: string; icon: typeof Clock }[] = [
  { key: "PENDING_PAYMENT", label: "Pending", tint: "bg-gray-100 text-gray-600", icon: Clock },
  { key: "PROCESSING", label: "Processing", tint: "bg-amber-100 text-amber-600", icon: Package2 },
  { key: "SHIPPED", label: "Shipped", tint: "bg-blue-100 text-blue-600", icon: Truck },
  { key: "DELIVERED", label: "Delivered", tint: "bg-emerald-100 text-emerald-600", icon: CheckCircle2 },
  { key: "RETURN_REQUESTED", label: "Returns", tint: "bg-red-100 text-red-600", icon: RefreshCcw },
];

const PAGE_SIZE = 20;

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);

  const [items, setItems] = useState<AdminOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Counts for the summary strip — fetched once on mount.
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const q: ListAdminOrdersQuery = {
      limit: PAGE_SIZE,
      offset,
    };
    if (statusFilter !== "ALL") q.status = statusFilter;
    if (query.trim()) q.q = query.trim();
    if (fromDate) q.from = fromDate;
    if (toDate) q.to = toDate;

    adminApi
      .listOrders(q)
      .then((resp) => {
        if (!cancelled) {
          setItems(resp.items);
          setTotal(resp.total);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load orders",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, query, fromDate, toDate, offset]);

  // Lightweight per-status counts for the summary cards. One request per status —
  // small N (5), only fires on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      summaryCardsConfig.map((c) =>
        adminApi
          .listOrders({ status: c.key as OrderStatus, limit: 1, offset: 0 })
          .then((r) => [c.key, r.total] as const)
          .catch(() => [c.key, 0] as const),
      ),
    ).then((results) => {
      if (!cancelled) {
        const next: Record<string, number> = {};
        for (const [k, v] of results) next[k] = v;
        setCounts(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onFilterChange = (next: OrderStatus | "ALL") => {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setOffset(0);
    setLoading(true);
  };

  const onSearchChange = (v: string) => {
    setQuery(v);
    setOffset(0);
    setLoading(true);
  };

  const onDateChange = (which: "from" | "to", v: string) => {
    if (which === "from") setFromDate(v);
    else setToDate(v);
    setOffset(0);
    setLoading(true);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminHeader
        title="Orders"
        subtitle="Track lifecycle, drive state machine, regenerate invoices"
      />

      <div className="p-6 space-y-5">
        {/* Header actions */}
        <div className="flex justify-end">
          <Link
            href="/admin/orders/new"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Manual order
          </Link>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {summaryCardsConfig.map((c) => {
            const Icon = c.icon;
            const v = counts[c.key];
            return (
              <button
                key={c.label}
                onClick={() => onFilterChange(c.key as OrderStatus)}
                className={`bg-white border rounded-xl p-4 text-left transition-colors hover:border-[#129cd3] ${
                  statusFilter === c.key ? "border-[#129cd3]" : "border-gray-200"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.tint}`}>
                  <Icon size={16} />
                </div>
                <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                <p className="text-xl font-bold text-gray-800 mt-0.5">
                  {v === undefined ? "—" : v.toLocaleString()}
                </p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Order number prefix, e.g. CPC-ORD-26-27"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => onFilterChange(e.target.value as OrderStatus | "ALL")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => onDateChange("from", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => onDateChange("to", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white text-gray-600"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading ? "Loading…" : `${total} order${total === 1 ? "" : "s"}`}
            </p>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="m-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No orders match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Order</th>
                    <th className="text-left font-semibold px-5 py-3">Customer</th>
                    <th className="text-left font-semibold px-5 py-3">Date</th>
                    <th className="text-left font-semibold px-5 py-3">Items</th>
                    <th className="text-left font-semibold px-5 py-3">Amount</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono text-xs text-[#129cd3] font-semibold">
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.id)}`}
                          className="hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800">
                          {o.user.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.user.email ?? o.user.phone ?? "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(o.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{o.itemCount}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">
                        {formatPrice(o.grandTotal)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLE[o.status]}`}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.id)}`}
                          className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc] inline-flex"
                          aria-label="View"
                        >
                          <Eye size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
