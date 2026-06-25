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
import type { AdminReviewRow } from "@/lib/api";
import { formatTimestamp, formatUpdated } from "@/lib/format-date";
import { useUrlState } from "@/lib/use-url-state";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
  { label: "Rating (High → Low)", sortBy: "rating", sortOrder: "desc" },
  { label: "Rating (Low → High)", sortBy: "rating", sortOrder: "asc" },
];
import {
  Star,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";

const PAGE_SIZE = 25;

type StatusFilter = "ALL" | "VISIBLE" | "HIDDEN";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "VISIBLE", label: "Visible" },
  { value: "HIDDEN", label: "Hidden" },
];

function truncate(s: string | null, n: number) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function AdminReviewsPage() {
  const [url, setUrl] = useUrlState({
    status: "ALL" as StatusFilter,
    offset: 0,
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const statusFilter = url.status;
  const offset = url.offset;
  const [searchInput, setSearchInput] = useState("");
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
    (next: StatusFilter) => setUrl({ status: next, offset: 0 }),
    [setUrl],
  );
  const setOffset = useCallback((n: number) => setUrl({ offset: n }), [setUrl]);
  const setSort = useCallback(
    (s: SortState) => setUrl({ sortBy: s.field, sortOrder: s.order }),
    [setUrl],
  );
  const setDateRange = useCallback(
    (r: DateRange) =>
      setUrl({
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
        updatedFrom: r.updatedFrom ?? "",
        updatedTo: r.updatedTo ?? "",
      }),
    [setUrl],
  );
  const [rows, setRows] = useState<AdminReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReviewRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listReviews({
        isApproved:
          statusFilter === "VISIBLE"
            ? true
            : statusFilter === "HIDDEN"
            ? false
            : undefined,
        sortBy: sort.field,
        sortOrder: sort.order,
        createdFrom: dateRange.createdFrom,
        createdTo: dateRange.createdTo,
        updatedFrom: dateRange.updatedFrom,
        updatedTo: dateRange.updatedTo,
        limit: PAGE_SIZE,
        offset,
      })
      .then((resp) => {
        if (!cancelled) {
          setRows(resp.items);
          setTotal(resp.total);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load reviews",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, offset, sort, dateRange]);

  const exportQuery = useMemo(
    () => ({
      isApproved:
        statusFilter === "VISIBLE"
          ? true
          : statusFilter === "HIDDEN"
          ? false
          : undefined,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    }),
    [statusFilter, sort, dateRange],
  );

  const handleToggle = useCallback(
    async (row: AdminReviewRow) => {
      setBusyId(row.id);
      const next = !row.isApproved;
      // Optimistic flip on list + open detail modal if open.
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isApproved: next } : r)),
      );
      setDetail((prev) =>
        prev && prev.id === row.id ? { ...prev, isApproved: next } : prev,
      );
      try {
        const updated = await adminApi.patchReview(row.id, {
          isApproved: next,
        });
        // Reconcile with server (preserves any future fields we might add).
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)),
        );
        setDetail((prev) =>
          prev && prev.id === row.id ? { ...prev, ...updated } : prev,
        );
      } catch (err) {
        // Rollback.
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, isApproved: !next } : r,
          ),
        );
        setDetail((prev) =>
          prev && prev.id === row.id
            ? { ...prev, isApproved: !next }
            : prev,
        );
        setError(
          isApiError(err) ? err.displayMessage : "Could not update review",
        );
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const onFilterChange = (next: StatusFilter) => {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setLoading(true);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminHeader
        title="Reviews"
        subtitle="Moderate customer reviews — hide or unhide from PDP"
        searchValue={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search by product or reviewer…"
        actions={
          <ExportCsvButton
            path="/admin/reviews/export.csv"
            query={exportQuery}
            filename="reviews"
          />
        }
      />

      <div className="p-6 space-y-5">
        {/* Filter chips + date range */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const active = f.value === statusFilter;
              return (
                <button
                  key={f.value}
                  onClick={() => onFilterChange(f.value)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    active
                      ? "bg-[#129cd3] border-[#129cd3] text-white"
                      : "border-gray-200 text-gray-600 hover:border-[#129cd3]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter value={dateRange} onApply={setDateRange} />
            <SortByDropdown
              options={SORT_OPTIONS}
              currentSort={sort}
              onSort={setSort}
            />
          </div>
        </div>

        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading
                ? "Loading…"
                : `${total} review${total === 1 ? "" : "s"}`}
            </p>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No reviews match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Review</th>
                    <SortableHeader
                      field="rating"
                      currentSort={sort}
                      onSort={setSort}
                    >
                      Rating
                    </SortableHeader>
                    <th className="text-left font-semibold px-5 py-3">Product</th>
                    <th className="text-left font-semibold px-5 py-3">Author</th>
                    <SortableHeader
                      field="createdAt"
                      currentSort={sort}
                      onSort={setSort}
                    >
                      Added
                    </SortableHeader>
                    <SortableHeader
                      field="updatedAt"
                      currentSort={sort}
                      onSort={setSort}
                    >
                      Updated
                    </SortableHeader>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.filter((r) => {
                    if (!searchInput.trim()) return true;
                    const q = searchInput.trim().toLowerCase();
                    return (
                      r.product.name.toLowerCase().includes(q) ||
                      r.user.name.toLowerCase().includes(q) ||
                      (r.text ?? "").toLowerCase().includes(q)
                    );
                  }).map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3 text-gray-700 max-w-md">
                        {r.text ? (
                          <span className="line-clamp-2">{truncate(r.text, 100)}</span>
                        ) : (
                          <span className="italic text-gray-400">
                            (no comment)
                          </span>
                        )}
                        {r.photos.length > 0 && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            · {r.photos.length} photo
                            {r.photos.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={12}
                              className={
                                i < r.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "fill-gray-200 text-gray-200"
                              }
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        <Link
                          href={`/products/${encodeURIComponent(r.product.slug)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#129cd3] hover:underline inline-flex items-center gap-1"
                        >
                          {truncate(r.product.name, 32)}
                          <ExternalLink size={11} />
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{r.user.name}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {formatTimestamp(r.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {formatUpdated(r.createdAt, r.updatedAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                            r.isApproved
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {r.isApproved ? "Visible" : "Hidden"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(r);
                          }}
                          disabled={busyId === r.id}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            r.isApproved
                              ? "border-amber-300 text-amber-600 hover:bg-amber-50"
                              : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          {busyId === r.id ? (
                            <Loader2 size={11} className="animate-spin inline" />
                          ) : r.isApproved ? (
                            <>
                              <EyeOff size={11} className="inline mr-1" /> Hide
                            </>
                          ) : (
                            <>
                              <Eye size={11} className="inline mr-1" /> Unhide
                            </>
                          )}
                        </button>
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

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetail(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-800">
                  Review by {detail.user.name}
                </h2>
                <p className="text-xs text-gray-500">
                  <Link
                    href={`/products/${encodeURIComponent(detail.product.slug)}`}
                    className="text-[#129cd3] hover:underline"
                  >
                    {detail.product.name}
                  </Link>{" "}
                  · {formatTimestamp(detail.createdAt)}
                  {detail.updatedAt !== detail.createdAt ? " (edited)" : ""}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex mb-3">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={16}
                  className={
                    i < detail.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-gray-200 text-gray-200"
                  }
                />
              ))}
            </div>

            {detail.text ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
                {detail.text}
              </p>
            ) : (
              <p className="text-sm italic text-gray-400 mb-3">(no comment)</p>
            )}

            {detail.photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {detail.photoUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-20 h-20 object-cover rounded border border-gray-200"
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                  detail.isApproved
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {detail.isApproved ? "Visible on PDP" : "Hidden"}
              </span>
              <button
                onClick={() => handleToggle(detail)}
                disabled={busyId === detail.id}
                className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  detail.isApproved
                    ? "border-amber-300 text-amber-600 hover:bg-amber-50"
                    : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {busyId === detail.id ? (
                  <Loader2 size={14} className="animate-spin inline" />
                ) : detail.isApproved ? (
                  <>
                    <EyeOff size={14} className="inline mr-1" /> Hide review
                  </>
                ) : (
                  <>
                    <Eye size={14} className="inline mr-1" /> Unhide review
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
