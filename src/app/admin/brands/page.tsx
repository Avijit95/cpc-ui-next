"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { AdminBrandRow } from "@/lib/api";
import {
  DateTimeCell,
  UpdatedDateTimeCell,
} from "@/components/admin/list/DateTimeCell";
import { useUrlState } from "@/lib/use-url-state";
import { Loader2, Package, Search, Tag } from "lucide-react";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Name (A → Z)", sortBy: "name", sortOrder: "asc" },
  { label: "Name (Z → A)", sortBy: "name", sortOrder: "desc" },
  { label: "Most products", sortBy: "productCount", sortOrder: "desc" },
  { label: "Fewest products", sortBy: "productCount", sortOrder: "asc" },
  { label: "Newest brand", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
];

export default function AdminBrandsPage() {
  const [url, setUrl] = useUrlState({
    q: "",
    sortBy: "name",
    sortOrder: "asc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
  });
  const search = url.q;
  const sort: SortState = useMemo(
    () => ({ field: url.sortBy, order: url.sortOrder }),
    [url.sortBy, url.sortOrder],
  );
  const dateRange: DateRange = useMemo(
    () => ({
      createdFrom: url.createdFrom || undefined,
      createdTo: url.createdTo || undefined,
    }),
    [url.createdFrom, url.createdTo],
  );

  const [items, setItems] = useState<AdminBrandRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listBrands({
        search: search || undefined,
        sortBy: sort.field as
          | "name"
          | "productCount"
          | "createdAt"
          | "updatedAt",
        sortOrder: sort.order,
        createdFrom: dateRange.createdFrom,
        createdTo: dateRange.createdTo,
      })
      .then((resp) => {
        if (cancelled) return;
        setItems(resp.items);
        setTotal(resp.total);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Couldn't load brands",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, sort, dateRange]);

  const exportQuery = useMemo(
    () => ({
      search: search || undefined,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
    }),
    [search, sort, dateRange],
  );

  const setSort = useCallback(
    (s: SortState) => {
      setLoading(true);
      setUrl({ sortBy: s.field, sortOrder: s.order });
    },
    [setUrl],
  );
  const setDateRange = useCallback(
    (r: DateRange) => {
      setLoading(true);
      setUrl({
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
      });
    },
    [setUrl],
  );

  return (
    <>
      <AdminHeader
        title="Brands"
        subtitle="Distinct brand names derived from your product catalog"
        searchValue={search}
        onSearch={(v) => setUrl({ q: v })}
        searchPlaceholder="Search brands by name…"
        actions={
          <ExportCsvButton
            path="/admin/brands/export.csv"
            query={exportQuery}
            filename="brands"
          />
        }
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <Tag size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Total Brands</p>
              <p className="text-xl font-bold text-gray-800">{total}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Package size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Products tagged</p>
              <p className="text-xl font-bold text-gray-800">
                {items.reduce((sum, b) => sum + b.productCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setUrl({ q: e.target.value })}
              placeholder="Search brands by name…"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
          <DateRangeFilter
            value={dateRange}
            hideUpdated
            onApply={setDateRange}
          />
          <SortByDropdown
            options={SORT_OPTIONS}
            currentSort={sort}
            onSort={setSort}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <SortableHeader
                    field="name"
                    currentSort={sort}
                    onSort={setSort}
                  >
                    Brand
                  </SortableHeader>
                  <SortableHeader
                    field="productCount"
                    currentSort={sort}
                    onSort={setSort}
                  >
                    Products
                  </SortableHeader>
                  <SortableHeader
                    field="createdAt"
                    currentSort={sort}
                    onSort={setSort}
                  >
                    First seen
                  </SortableHeader>
                  <SortableHeader
                    field="updatedAt"
                    currentSort={sort}
                    onSort={setSort}
                  >
                    Last touched
                  </SortableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center">
                      <Loader2
                        className="animate-spin text-[#129cd3] inline-block"
                        size={22}
                      />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-12 text-center text-sm text-red-600"
                    >
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      No brands match your filters.
                    </td>
                  </tr>
                ) : (
                  items.map((b) => (
                    <tr key={b.name} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
                            <Tag size={14} />
                          </div>
                          <p className="font-semibold text-gray-800">{b.name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {b.productCount}{" "}
                        {b.productCount === 1 ? "product" : "products"}
                      </td>
                      <td className="px-5 py-3 text-gray-600 text-xs">
                        <DateTimeCell iso={b.createdAt} />
                      </td>
                      <td className="px-5 py-3 text-gray-600 text-xs">
                        <UpdatedDateTimeCell createdAt={b.createdAt} updatedAt={b.updatedAt} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
