"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  Archive,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminCategoryListItem,
  AdminProductListItem,
  ProductStatus,
} from "@/lib/api";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: "" | ProductStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

function formatPrice(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

function statusBadgeClass(status: ProductStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-600 border-emerald-200";
    case "DRAFT":
      return "bg-amber-50 text-amber-600 border-amber-200";
    case "ARCHIVED":
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function archiveErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Couldn't archive the product. Try again.";
  return err.displayMessage || "Couldn't archive the product.";
}

export default function AdminProductsPage() {
  // Filters / pagination
  const [statusFilter, setStatusFilter] = useState<"" | ProductStatus>("");
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // categoryId
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [page, setPage] = useState(0); // zero-indexed

  // Data
  const [items, setItems] = useState<AdminProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminCategoryListItem[]>([]);

  const [archiveTarget, setArchiveTarget] =
    useState<AdminProductListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Debounce search input → applied search.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Categories for filter dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await adminApi.listCategories();
        if (!cancelled) setCategories(list);
      } catch {
        // Non-fatal: just leave the category filter empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listProducts({
        status: statusFilter || undefined,
        categoryId: categoryFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((resp) => {
        if (cancelled) return;
        setItems(resp.items);
        setTotal(resp.total);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            isApiError(err)
              ? err.displayMessage
              : "Couldn't load products. Try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, categoryFilter, search, page, reloadKey]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const onArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const updated = await adminApi.archiveProduct(archiveTarget.id);
      // Reflect the new ARCHIVED status in the current page.
      setItems((prev) =>
        prev.map((p) =>
          p.id === updated.id ? { ...p, status: updated.status } : p,
        ),
      );
      setArchiveTarget(null);
    } catch (err) {
      setArchiveError(archiveErrorMessage(err));
    } finally {
      setArchiving(false);
    }
  };

  // Summary tiles use the current page when total isn't enough info.
  const stats = useMemo(() => {
    const active = items.filter((p) => p.status === "ACTIVE").length;
    const draft = items.filter((p) => p.status === "DRAFT").length;
    const archived = items.filter((p) => p.status === "ARCHIVED").length;
    return { active, draft, archived };
  }, [items]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, page * PAGE_SIZE + items.length);

  return (
    <>
      <AdminHeader
        title="Products"
        subtitle="Add, edit or archive products in your catalog"
        actions={
          <Link
            href="/admin/products/add"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Add product
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Inventory summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              label: "Total Products",
              value: total,
              tint: "bg-[#e8f7fc] text-[#129cd3]",
            },
            {
              label: "Active (page)",
              value: stats.active,
              tint: "bg-emerald-50 text-emerald-600",
            },
            {
              label: "Draft (page)",
              value: stats.draft,
              tint: "bg-amber-50 text-amber-600",
            },
            {
              label: "Archived (page)",
              value: stats.archived,
              tint: "bg-gray-100 text-gray-500",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4"
            >
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.tint}`}
              >
                <Package size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products by name…"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | ProductStatus);
              setPage(0);
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(0);
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Top-level error */}
        {errorMsg && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={reload}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Product</th>
                  <th className="text-left font-semibold px-5 py-3">
                    Category
                  </th>
                  <th className="text-left font-semibold px-5 py-3">Brand</th>
                  <th className="text-left font-semibold px-5 py-3">Price</th>
                  <th className="text-left font-semibold px-5 py-3">Stock</th>
                  <th className="text-left font-semibold px-5 py-3">Variants</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <Loader2
                        className="animate-spin text-[#129cd3] inline-block"
                        size={22}
                      />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      {total === 0
                        ? "No products yet. Click \"Add product\" to create your first one."
                        : "No products match your filters."}
                    </td>
                  </tr>
                ) : (
                  items.map((p) => {
                    const categoryName =
                      categoryNameById.get(p.categoryId) ?? "—";
                    const variantCount = p._count?.variants ?? 0;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
                              <Package size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 line-clamp-1">
                                {p.name}
                              </p>
                              <code className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {p.slug}
                              </code>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {categoryName}
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {p.brand ?? (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-800">
                            {formatPrice(p.basePrice)}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{p.stock}</td>
                        <td className="px-5 py-3">
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                            {variantCount}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadgeClass(p.status)}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/admin/products/${p.id}/edit`}
                              className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </Link>
                            <button
                              onClick={() => {
                                setArchiveError(null);
                                setArchiveTarget(p);
                              }}
                              disabled={p.status === "ARCHIVED"}
                              className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                              aria-label="Archive"
                              title={
                                p.status === "ARCHIVED"
                                  ? "Already archived"
                                  : "Archive"
                              }
                            >
                              <Archive size={14} />
                            </button>
                            <button
                              className="p-1.5 rounded text-gray-400 hover:text-gray-700"
                              aria-label="More"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>
                {total === 0
                  ? "No products"
                  : `Showing ${showingFrom.toLocaleString("en-IN")}–${showingTo.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-inherit"
                >
                  ‹
                </button>
                <span className="px-2 text-gray-700 font-semibold">
                  {page + 1} / {lastPage + 1}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  disabled={page >= lastPage}
                  className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-inherit"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Archive confirmation */}
      {archiveTarget && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !archiving && setArchiveTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">
                  Archive product?
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Archived products disappear from the storefront but stay in the
                  database so existing orders + URLs keep working.
                </p>
              </div>
              <button
                onClick={() => !archiving && setArchiveTarget(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-700 mb-2">
              Archive{" "}
              <span className="font-semibold">{archiveTarget.name}</span>{" "}
              <code className="text-[12px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {archiveTarget.slug}
              </code>
              ?
            </p>

            {archiveError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
                {archiveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={archiving}
                className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3]"
              >
                Cancel
              </button>
              <button
                onClick={onArchive}
                disabled={archiving}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-red-200 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {archiving && <Loader2 size={14} className="animate-spin" />}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
