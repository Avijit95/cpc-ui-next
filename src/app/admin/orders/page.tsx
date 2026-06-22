"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import DateRangeFilter, {
  type DateRange,
} from "@/components/admin/list/DateRangeFilter";
import ExportCsvButton from "@/components/admin/list/ExportCsvButton";
import SortableHeader, {
  type SortState,
} from "@/components/admin/list/SortableHeader";
import SortByDropdown, {
  type SortOption,
} from "@/components/admin/list/SortByDropdown";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminOrderListItem,
  ListAdminOrdersQuery,
  OrderStatus,
} from "@/lib/api";
import {
  DateTimeCell,
  UpdatedDateTimeCell,
} from "@/components/admin/list/DateTimeCell";
import { useUrlState } from "@/lib/use-url-state";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
  { label: "Order ID (A → Z)", sortBy: "orderNumber", sortOrder: "asc" },
  { label: "Order ID (Z → A)", sortBy: "orderNumber", sortOrder: "desc" },
  { label: "Amount (High → Low)", sortBy: "grandTotal", sortOrder: "desc" },
  { label: "Amount (Low → High)", sortBy: "grandTotal", sortOrder: "asc" },
  { label: "Status", sortBy: "status", sortOrder: "asc" },
];
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

export default function AdminOrdersPage() {
  const [url, setUrl] = useUrlState({
    status: "ALL" as OrderStatus | "ALL",
    q: "",
    offset: 0,
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const statusFilter = url.status;
  const query = url.q;
  const offset = url.offset;
  const sort: SortState = useMemo(
    () => ({ field: url.sortBy, order: url.sortOrder }),
    [url.sortBy, url.sortOrder],
  );
  const dateRange: DateRange = useMemo(
    () => ({
      createdFrom: url.createdFrom || undefined,
      createdTo: url.createdTo || undefined,
      updatedFrom: url.updatedFrom || undefined,
      updatedTo: url.updatedTo || undefined,
    }),
    [url.createdFrom, url.createdTo, url.updatedFrom, url.updatedTo],
  );
  const setStatusFilter = useCallback(
    (next: OrderStatus | "ALL") => setUrl({ status: next, offset: 0 }),
    [setUrl],
  );
  const setQuery = useCallback(
    (v: string) => setUrl({ q: v, offset: 0 }),
    [setUrl],
  );
  const setOffset = useCallback((n: number) => setUrl({ offset: n }), [setUrl]);
  const setSort = useCallback(
    (s: SortState) =>
      setUrl({ sortBy: s.field, sortOrder: s.order, offset: 0 }),
    [setUrl],
  );
  const setDateRange = useCallback(
    (r: DateRange) =>
      setUrl({
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
        updatedFrom: r.updatedFrom ?? "",
        updatedTo: r.updatedTo ?? "",
        offset: 0,
      }),
    [setUrl],
  );

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
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    };
    if (statusFilter !== "ALL") q.status = statusFilter;
    if (query.trim()) q.q = query.trim();

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
  }, [statusFilter, query, dateRange, sort, offset]);

  const exportQuery = useMemo(
    () => ({
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      q: query.trim() || undefined,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    }),
    [statusFilter, query, sort, dateRange],
  );

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
    setLoading(true);
  };

  const onSearchChange = (v: string) => {
    setQuery(v);
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
        <div className="flex justify-end gap-2">
          <ExportCsvButton
            path="/admin/orders/export.csv"
            query={exportQuery}
            filename="orders"
          />
          <Link
            href="/admin/orders/new"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Manual order
          </Link>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
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
          <DateRangeFilter
            value={dateRange}
            onApply={(r) => {
              setDateRange(r);
              setLoading(true);
            }}
          />
          <SortByDropdown
            options={SORT_OPTIONS}
            currentSort={sort}
            onSort={(s) => {
              setSort(s);
              setLoading(true);
            }}
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
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
                    <SortableHeader
                      field="orderNumber"
                      currentSort={sort}
                      onSort={setSort}
                    >
                      Order
                    </SortableHeader>
                    <th className="text-left font-semibold px-3 py-3">Customer</th>
                    <th className="hidden lg:table-cell text-left font-semibold px-3 py-3">Items</th>
                    <SortableHeader
                      field="grandTotal"
                      currentSort={sort}
                      onSort={setSort}
                    >
                      Amount
                    </SortableHeader>
                    <th className="text-left font-semibold px-3 py-3">Status</th>
                    <SortableHeader
                      field="createdAt"
                      currentSort={sort}
                      onSort={setSort}
                      className="hidden xl:table-cell"
                    >
                      Added
                    </SortableHeader>
                    <SortableHeader
                      field="updatedAt"
                      currentSort={sort}
                      onSort={setSort}
                      className="hidden lg:table-cell"
                    >
                      Updated
                    </SortableHeader>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-mono text-xs text-[#129cd3] font-semibold whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.id)}`}
                          className="hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-gray-800 text-sm">{o.user.name}</p>
                        <p className="text-xs text-gray-500">
                          {o.user.email ?? o.user.phone ?? "—"}
                        </p>
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 text-gray-700 text-sm">{o.itemCount}</td>
                      <td className="px-3 py-3 font-semibold text-gray-800 text-sm whitespace-nowrap">
                        {formatPrice(o.grandTotal)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLE[o.status]}`}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="hidden xl:table-cell px-3 py-3 text-gray-600 text-xs">
                        <DateTimeCell iso={o.createdAt} />
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 text-gray-600 text-xs">
                        <UpdatedDateTimeCell createdAt={o.createdAt} updatedAt={o.updatedAt} />
                      </td>
                      <td className="px-3 py-3">
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
