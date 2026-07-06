"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
import {
  Archive,
  Check,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminCategoryListItem,
  AdminProductListItem,
  AdminProductVariantOption,
  ProductStatus,
} from "@/lib/api";
import {
  DateTimeCell,
  UpdatedDateTimeCell,
} from "@/components/admin/list/DateTimeCell";
import { useUrlState } from "@/lib/use-url-state";
import { useStock } from "@/lib/stock/StockProvider";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
  { label: "Name (A → Z)", sortBy: "name", sortOrder: "asc" },
  { label: "Name (Z → A)", sortBy: "name", sortOrder: "desc" },
  { label: "Price (Low → High)", sortBy: "basePrice", sortOrder: "asc" },
  { label: "Price (High → Low)", sortBy: "basePrice", sortOrder: "desc" },
  { label: "Best Sellers first", sortBy: "isBestSeller", sortOrder: "desc" },
  { label: "Featured first", sortBy: "isFeatured", sortOrder: "desc" },
  { label: "Status (Active first)", sortBy: "status", sortOrder: "asc" },
  { label: "Stock (Low → High)", sortBy: "stock", sortOrder: "asc" },
];

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: "" | ProductStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

const BEST_SELLER_OPTIONS: { value: "" | "true" | "false"; label: string }[] = [
  { value: "", label: "All products" },
  { value: "true", label: "Best Sellers" },
  { value: "false", label: "Normal" },
];

const FEATURED_OPTIONS: { value: "" | "true" | "false"; label: string }[] = [
  { value: "", label: "All (Featured?)" },
  { value: "true", label: "Featured" },
  { value: "false", label: "Not Featured" },
];

type Toast = { id: number; message: string; kind: "success" | "error" };

function ProductToggle({
  on,
  busy,
  onLabel,
  offLabel,
  onClick,
}: {
  on: boolean;
  busy: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      title={on ? onLabel : offLabel}
      className="inline-flex items-center gap-2 group disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
          on ? "bg-[#129cd3]" : "bg-gray-300"
        } group-hover:brightness-110`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span
        className={`hidden xl:inline text-[11px] font-semibold ${
          on ? "text-[#129cd3]" : "text-gray-400"
        }`}
      >
        {on ? onLabel : offLabel}
      </span>
      {busy && <Loader2 size={10} className="animate-spin text-gray-400" />}
    </button>
  );
}

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
  // Filters / sort / pagination — URL-synced.
  const [url, setUrl] = useUrlState({
    status: "" as "" | ProductStatus,
    categoryId: "",
    bestSeller: "" as "" | "true" | "false",
    isFeatured: "" as "" | "true" | "false",
    search: "",
    page: 0,
    sortBy: "updatedAt",
    sortOrder: "desc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const statusFilter = url.status;
  const categoryFilter = url.categoryId;
  const bestSellerFilter = url.bestSeller;
  const isFeaturedFilter = url.isFeatured;
  const page = url.page;
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
  const [searchInput, setSearchInput] = useState(url.search);
  const search = url.search;

  // Data
  const [items, setItems] = useState<AdminProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminCategoryListItem[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const [archiveTarget, setArchiveTarget] =
    useState<AdminProductListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Inline toggle state (status + best seller). Track which row is busy on which
  // field so we can disable just that toggle while its PATCH is in flight.
  const [busyToggles, setBusyToggles] = useState<
    Record<string, "status" | "bestSeller" | "featured" | undefined>
  >({});

  // productId → resolved S3 image URL (fetched lazily for variant products)
  const [variantImages, setVariantImages] = useState<Record<string, string>>({});
  const fetchedImgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Only fetch for products that have no product-level image but have variants
    const toFetch = items
      .filter((p) => !p.images[0] && (p._count?.variants ?? 0) > 0 && !fetchedImgIdsRef.current.has(p.id))
      .map((p) => p.id);
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedImgIdsRef.current.add(id));
    void Promise.allSettled(toFetch.map((id) => adminApi.getProduct(id))).then(
      (results) => {
        const map: Record<string, string> = {};
        results.forEach((r, i) => {
          if (r.status !== "fulfilled") return;
          const key = r.value.variants.flatMap((v) => v.imagesObjectKeys)[0];
          if (key) map[toFetch[i]] = `https://cpn-uploads.s3.ap-south-1.amazonaws.com/${key}`;
        });
        if (Object.keys(map).length > 0)
          setVariantImages((prev) => ({ ...prev, ...map }));
      },
    );
  }, [items]);

  // Variant expand panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [variantsCache, setVariantsCache] = useState<Record<string, AdminProductVariantOption[]>>({});
  const [variantsLoading, setVariantsLoading] = useState<Record<string, boolean>>({});
  const { stocks, setStock } = useStock();

  const toggleVariants = async (productId: string, count: number) => {
    if (count === 0) return;
    if (expandedId === productId) { setExpandedId(null); return; }
    setExpandedId(productId);
    // Always re-fetch on expand to get fresh stock data
    setVariantsLoading((p) => ({ ...p, [productId]: true }));
    try {
      const list = await adminApi.listVariants(productId);
      setVariantsCache((p) => ({ ...p, [productId]: list }));
      // Seed the stock store so purchase records are applied to displayed stock
      list.forEach((v) => setStock(`v:${v.id}`, v.stock));
    } catch { /* non-fatal */ } finally {
      setVariantsLoading((p) => ({ ...p, [productId]: false }));
    }
  };

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((message: string, kind: Toast["kind"]) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Debounce search input → URL.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const t = setTimeout(() => {
      setUrl({ search: trimmed, page: 0 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setUrl]);

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


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    if (addMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

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
        isBestSeller:
          bestSellerFilter === ""
            ? undefined
            : bestSellerFilter === "true",
        isFeatured:
          isFeaturedFilter === ""
            ? undefined
            : isFeaturedFilter === "true",
        sortBy: sort.field,
        sortOrder: sort.order,
        createdFrom: dateRange.createdFrom,
        createdTo: dateRange.createdTo,
        updatedFrom: dateRange.updatedFrom,
        updatedTo: dateRange.updatedTo,
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
  }, [
    statusFilter,
    categoryFilter,
    bestSellerFilter,
    isFeaturedFilter,
    search,
    sort,
    dateRange,
    page,
    reloadKey,
  ]);

  const exportQuery = useMemo(
    () => ({
      status: statusFilter || undefined,
      categoryId: categoryFilter || undefined,
      search: search || undefined,
      isBestSeller:
        bestSellerFilter === "" ? undefined : bestSellerFilter,
      isFeatured:
        isFeaturedFilter === "" ? undefined : isFeaturedFilter,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    }),
    [
      statusFilter,
      categoryFilter,
      bestSellerFilter,
      isFeaturedFilter,
      search,
      sort,
      dateRange,
    ],
  );

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const categorySlugById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.slug);
    return m;
  }, [categories]);

  const onToggleStatus = useCallback(
    async (p: AdminProductListItem) => {
      if (p.status === "ARCHIVED") return; // archived must un-archive via edit
      const nextStatus: ProductStatus = p.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
      setBusyToggles((b) => ({ ...b, [p.id]: "status" }));
      setItems((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, status: nextStatus } : row,
        ),
      );
      try {
        await adminApi.updateProduct(p.id, { status: nextStatus });
        pushToast(
          nextStatus === "ACTIVE"
            ? `${p.name} is now Active`
            : `${p.name} set to Inactive`,
          "success",
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === p.id ? { ...row, status: p.status } : row,
          ),
        );
        pushToast(
          isApiError(err) ? err.displayMessage : "Couldn't update status",
          "error",
        );
      } finally {
        setBusyToggles((b) => {
          const { [p.id]: _omit, ...rest } = b;
          void _omit;
          return rest;
        });
      }
    },
    [pushToast],
  );

  const onToggleBestSeller = useCallback(
    async (p: AdminProductListItem) => {
      const next = !p.isBestSeller;
      setBusyToggles((b) => ({ ...b, [p.id]: "bestSeller" }));
      setItems((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, isBestSeller: next } : row,
        ),
      );
      try {
        await adminApi.updateProduct(p.id, { isBestSeller: next });
        pushToast(
          next
            ? `${p.name} marked as Best Seller`
            : `${p.name} removed from Best Sellers`,
          "success",
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === p.id ? { ...row, isBestSeller: p.isBestSeller } : row,
          ),
        );
        pushToast(
          isApiError(err) ? err.displayMessage : "Couldn't update Best Seller",
          "error",
        );
      } finally {
        setBusyToggles((b) => {
          const { [p.id]: _omit, ...rest } = b;
          void _omit;
          return rest;
        });
      }
    },
    [pushToast],
  );

  const onToggleFeatured = useCallback(
    async (p: AdminProductListItem) => {
      const next = !p.isFeatured;
      setBusyToggles((b) => ({ ...b, [p.id]: "featured" }));
      setItems((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, isFeatured: next } : row,
        ),
      );
      try {
        await adminApi.updateProduct(p.id, { isFeatured: next });
        pushToast(
          next
            ? `${p.name} marked as Featured`
            : `${p.name} removed from Featured`,
          "success",
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === p.id ? { ...row, isFeatured: p.isFeatured } : row,
          ),
        );
        pushToast(
          isApiError(err) ? err.displayMessage : "Couldn't update Featured",
          "error",
        );
      } finally {
        setBusyToggles((b) => {
          const { [p.id]: _omit, ...rest } = b;
          void _omit;
          return rest;
        });
      }
    },
    [pushToast],
  );

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
        searchValue={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search products by name…"
        actions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              path="/admin/products/export.csv"
              query={exportQuery}
              filename="products"
              onError={(msg) => pushToast(msg, "error")}
            />
            <div ref={addMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={14} /> Add product <ChevronDown size={13} className={`transition-transform ${addMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                  {categories.length === 0 ? (
                    <span className="block px-4 py-2 text-xs text-gray-400">Loading…</span>
                  ) : (
                    categories.map((cat) => (
                      <Link
                        key={cat.id}
                        href={`/admin/products/add?categoryId=${cat.id}`}
                        onClick={() => setAddMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#e8f7fc] hover:text-[#129cd3] transition-colors"
                      >
                        {cat.name}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Inventory summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
              label: "Inactive (page)",
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
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-full min-[500px]:flex-1 min-[500px]:min-w-[240px]">
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
              setUrl({
                status: e.target.value as "" | ProductStatus,
                page: 0,
              });
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white w-full min-[500px]:w-auto"
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
              setUrl({ categoryId: e.target.value, page: 0 });
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white w-full min-[500px]:w-auto"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={bestSellerFilter}
            onChange={(e) => {
              setUrl({
                bestSeller: e.target.value as "" | "true" | "false",
                page: 0,
              });
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white w-full min-[500px]:w-auto"
          >
            {BEST_SELLER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={isFeaturedFilter}
            onChange={(e) => {
              setUrl({
                isFeatured: e.target.value as "" | "true" | "false",
                page: 0,
              });
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white w-full min-[500px]:w-auto"
          >
            {FEATURED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-3 w-full min-[500px]:w-auto">
            <DateRangeFilter
              className="w-full min-[400px]:w-auto"
              value={dateRange}
              onApply={(r) => {
                setUrl({
                  createdFrom: r.createdFrom ?? "",
                  createdTo: r.createdTo ?? "",
                  updatedFrom: r.updatedFrom ?? "",
                  updatedTo: r.updatedTo ?? "",
                  page: 0,
                });
              }}
            />
            <SortByDropdown
              className="w-full min-[400px]:w-auto"
              options={SORT_OPTIONS}
              currentSort={sort}
              onSort={(s) =>
                setUrl({ sortBy: s.field, sortOrder: s.order, page: 0 })
              }
            />
          </div>
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
                  <SortableHeader
                    field="name"
                    currentSort={sort}
                    onSort={(s) => setUrl({ sortBy: s.field, sortOrder: s.order, page: 0 })}
                  >
                    Product
                  </SortableHeader>
                  <th className="hidden lg:table-cell text-left font-semibold px-3 py-3">
                    Category
                  </th>
                  <th className="hidden xl:table-cell text-left font-semibold px-3 py-3">Brand</th>
                  <SortableHeader
                    field="basePrice"
                    currentSort={sort}
                    onSort={(s) => setUrl({ sortBy: s.field, sortOrder: s.order, page: 0 })}
                  >
                    Price
                  </SortableHeader>
                  <SortableHeader
                    field="stock"
                    currentSort={sort}
                    onSort={(s) => setUrl({ sortBy: s.field, sortOrder: s.order, page: 0 })}
                  >
                    Stock
                  </SortableHeader>
                  <th className="hidden xl:table-cell text-left font-semibold px-3 py-3">Variants</th>
                  <th className="text-left font-semibold px-3 py-3">Status</th>
                  <th className="hidden lg:table-cell text-left font-semibold px-3 py-3">
                    Best&nbsp;Seller
                  </th>
                  <th className="hidden lg:table-cell text-left font-semibold px-3 py-3">
                    Featured
                  </th>
                  <th className="hidden xl:table-cell text-left font-semibold px-3 py-3">Added</th>
                  <SortableHeader
                    field="updatedAt"
                    currentSort={sort}
                    onSort={(s) => setUrl({ sortBy: s.field, sortOrder: s.order, page: 0 })}
                    className="hidden lg:table-cell"
                  >
                    Updated
                  </SortableHeader>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-5 py-12 text-center">
                      <Loader2
                        className="animate-spin text-[#129cd3] inline-block"
                        size={22}
                      />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
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
                      <Fragment key={p.id}>
                      <tr className={`${p.status === "ARCHIVED" ? "bg-red-100 hover:bg-red-200 opacity-50 hover:opacity-70" : p.status === "ACTIVE" ? "bg-green-100 hover:bg-green-200 font-semibold text-gray-900" : "hover:bg-gray-50"}`}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-[#e8f7fc] flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {(p.images[0] ? `https://cpn-uploads.s3.ap-south-1.amazonaws.com/${p.images[0]}` : variantImages[p.id]) ? (
                                <Image
                                  src={p.images[0] ? `https://cpn-uploads.s3.ap-south-1.amazonaws.com/${p.images[0]}` : variantImages[p.id]!}
                                  alt={p.name}
                                  width={36}
                                  height={36}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <Package size={16} className="text-[#129cd3]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 line-clamp-1 text-sm">
                                {p.name}
                              </p>
                              <code className="hidden sm:inline text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {p.slug}
                              </code>
                            </div>
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3 text-gray-700 text-sm">
                          {categoryName}
                        </td>
                        <td className="hidden xl:table-cell px-3 py-3 text-gray-700 text-sm">
                          {p.brand ?? <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {variantCount > 0 ? (
                            <button
                              onClick={() => toggleVariants(p.id, variantCount)}
                              className="text-xs font-medium text-[#129cd3] bg-[#e8f7fc] px-2 py-1 rounded whitespace-nowrap hover:bg-[#d0eef8] transition-colors"
                            >
                              See variants
                            </button>
                          ) : (
                            <p className="font-semibold text-gray-800 text-sm whitespace-nowrap">
                              {formatPrice(p.basePrice)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-sm">
                          {variantCount > 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            p.stock
                          )}
                        </td>
                        <td className="hidden xl:table-cell px-3 py-3">
                          {variantCount > 0 ? (
                            <button
                              onClick={() => toggleVariants(p.id, variantCount)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-gray-50 text-[#129cd3] border-[#129cd3]/40 hover:bg-[#e8f7fc] transition-colors"
                            >
                              {variantCount}
                              <ChevronDown size={11} className={`transition-transform ${expandedId === p.id ? "rotate-180" : ""}`} />
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-gray-50 text-gray-400 border-gray-200">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {p.status === "ARCHIVED" ? (
                            <span
                              className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusBadgeClass(p.status)}`}
                            >
                              ARCHIVED
                            </span>
                          ) : (
                            <ProductToggle
                              on={p.status === "ACTIVE"}
                              busy={busyToggles[p.id] === "status"}
                              onLabel="Active"
                              offLabel="Inactive"
                              onClick={() => onToggleStatus(p)}
                            />
                          )}
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3">
                          <ProductToggle
                            on={p.isBestSeller}
                            busy={busyToggles[p.id] === "bestSeller"}
                            onLabel="On"
                            offLabel="Off"
                            onClick={() => onToggleBestSeller(p)}
                          />
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3">
                          <ProductToggle
                            on={p.isFeatured}
                            busy={busyToggles[p.id] === "featured"}
                            onLabel="On"
                            offLabel="Off"
                            onClick={() => onToggleFeatured(p)}
                          />
                        </td>
                        <td className="hidden xl:table-cell px-3 py-3 text-gray-600 text-xs">
                          <DateTimeCell iso={p.createdAt} />
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3 text-gray-600 text-xs">
                          <UpdatedDateTimeCell createdAt={p.createdAt} updatedAt={p.updatedAt} />
                        </td>
                        <td className="px-3 py-3">
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
                              title={p.status === "ARCHIVED" ? "Already archived" : "Archive"}
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
                      {expandedId === p.id && (
                        <tr key={`${p.id}-variants`} className={`${p.status === "ARCHIVED" ? "bg-red-100 opacity-50 hover:opacity-70" : "bg-[#f8fbfd]"}`}>
                          <td colSpan={12} className="px-4 pb-3 pt-0">
                            {variantsLoading[p.id] ? (
                              <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                                <Loader2 size={14} className="animate-spin" /> Loading variants…
                              </div>
                            ) : (() => {
                              const vlist = variantsCache[p.id] ?? [];
                              if (vlist.length === 0) return <p className="py-2 text-xs text-gray-400">No variant data.</p>;
                              // Group by color
                              const byColor: Record<string, AdminProductVariantOption[]> = {};
                              for (const v of vlist) {
                                const color = v.attributes.color != null ? String(v.attributes.color) : "—";
                                (byColor[color] ??= []).push(v);
                              }
                              return (
                                <div className="space-y-2 pt-2">
                                  {Object.entries(byColor).map(([color, variants]) => (
                                    <div key={color}>
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Color:</span>
                                        <span className="text-xs font-semibold text-white bg-gray-600 px-2 py-0.5 rounded-full">{color}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {variants.map((v) => {
                                          const catSlug = categorySlugById.get(p.categoryId) ?? "";
                                          const isLensCat = catSlug.toLowerCase().includes("lens");
                                          const ram = v.attributes.ram != null ? String(v.attributes.ram) : null;
                                          const rom = v.attributes.storage != null ? String(v.attributes.storage) : null;
                                          const size = v.attributes.size != null ? String(v.attributes.size) : null;
                                          const model = v.attributes.model != null ? String(v.attributes.model) : null;
                                          const lens = v.attributes.lens != null ? String(v.attributes.lens) : null;
                                          const ramLabel = isLensCat ? "Model No." : "RAM";
                                          const label = [ram && `${ramLabel}: ${ram}`, rom && `ROM: ${rom}`, size && `Size: ${size}`, model && `Model: ${model}`, lens && `Lens: ${lens}`].filter(Boolean).join(" / ") || v.sku;
                                          const price = v.priceOverride ?? v.basePrice;
                                          return (
                                            <div key={v.id} className="flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs min-w-[130px]">
                                              <span className="font-semibold text-gray-700">{label}</span>
                                              <div className="flex items-center justify-between gap-3 mt-1">
                                                {(() => {
                                                  const effectiveStock = stocks[`v:${v.id}`] ?? v.stock;
                                                  const color = effectiveStock === 0 ? "text-red-500" : effectiveStock < 5 ? "text-orange-500" : "text-gray-800";
                                                  return (
                                                    <span className="text-gray-500">
                                                      Stock: <span className={`font-semibold ${color}`}>{effectiveStock}</span>
                                                      {effectiveStock < v.stock && (
                                                        <span className="ml-1 text-gray-400 text-[10px]">(API: {v.stock})</span>
                                                      )}
                                                    </span>
                                                  );
                                                })()}
                                                <span className="text-[#129cd3] font-semibold">{price != null ? `₹${Number(price).toLocaleString("en-IN")}` : "—"}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
                  onClick={() => setUrl({ page: Math.max(0, page - 1) })}
                  disabled={page === 0}
                  className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-inherit"
                >
                  ‹
                </button>
                <span className="px-2 text-gray-700 font-semibold">
                  {page + 1} / {lastPage + 1}
                </span>
                <button
                  onClick={() => setUrl({ page: Math.min(lastPage, page + 1) })}
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

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-white text-sm font-medium pointer-events-auto ${
                t.kind === "success" ? "bg-emerald-600" : "bg-red-500"
              }`}
            >
              {t.kind === "success" ? (
                <Check size={16} />
              ) : (
                <TriangleAlert size={16} />
              )}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
