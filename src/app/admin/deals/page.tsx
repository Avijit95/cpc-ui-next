"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  X,
  Search,
  Zap,
} from "lucide-react";
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
import { adminApi, catalogApi, isApiError } from "@/lib/api";
import type {
  AdminProductVariantOption,
  CreateDealBody,
  Deal,
  DealLifecycle,
  ListCard,
} from "@/lib/api";
import { formatTimestamp, formatUpdated } from "@/lib/format-date";
import { useUrlState } from "@/lib/use-url-state";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Ends soonest", sortBy: "endsAt", sortOrder: "asc" },
  { label: "Ends latest", sortBy: "endsAt", sortOrder: "desc" },
  { label: "Starts soonest", sortBy: "startsAt", sortOrder: "asc" },
  { label: "Highest deal price", sortBy: "dealPrice", sortOrder: "desc" },
  { label: "Lowest deal price", sortBy: "dealPrice", sortOrder: "asc" },
  { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
];

// "whole" = one % discount off every variant; "perVariant" = a separate deal
// price per variant (the grid), created in one batch.
type DealScope = "whole" | "perVariant";

type FormState = {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  productBasePrice: number | null;
  productSellingPrice: number | null;
  variantId: string | null;
  scope: DealScope;
  discountPercent: string;
  dealPrice: string;
  variantPrices: Record<string, string>;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  productId: "",
  productName: "",
  productImageUrl: null,
  productBasePrice: null,
  productSellingPrice: null,
  variantId: null,
  scope: "whole",
  discountPercent: "",
  dealPrice: "",
  variantPrices: {},
  startsAt: "",
  endsAt: "",
  isActive: true,
};

// A variant's price tiers, mirroring the API's sellingOf():
//   selling = priceOverride ?? basePrice ?? product base
//   base    = basePrice ?? selling   (struck MRP)
function variantTiers(
  v: { basePrice: number | null; priceOverride: number | null },
  productBase: number,
): { base: number; selling: number } {
  const selling = v.priceOverride ?? v.basePrice ?? productBase;
  const base = v.basePrice ?? selling;
  return { base, selling };
}

// "8GB / 128GB / Black" from a variant's attributes, falling back to its SKU.
function variantLabel(v: {
  sku: string;
  attributes: Record<string, unknown>;
}): string {
  const parts = ["ram", "storage", "color"]
    .map((k) => v.attributes[k])
    .filter((x) => x != null && String(x).trim() !== "")
    .map(String);
  return parts.length > 0 ? parts.join(" / ") : v.sku;
}

const STATUS_TABS: { value: DealLifecycle; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "expired", label: "Expired" },
];

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function lifecycleOf(d: Deal, now: number): DealLifecycle {
  const starts = new Date(d.startsAt).getTime();
  const ends = new Date(d.endsAt).getTime();
  if (ends < now) return "expired";
  if (starts > now) return "upcoming";
  return d.isActive ? "live" : "expired";
}

export default function AdminDealsPage() {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useUrlState({
    status: "all" as DealLifecycle,
    sortBy: "endsAt",
    sortOrder: "asc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const statusFilter = url.status;
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
    (next: DealLifecycle) => setUrl({ status: next }),
    [setUrl],
  );
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

  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">(
    "closed",
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveBusy, setSaveBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Product picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerInput, setPickerInput] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<ListCard[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Variants of the selected product (for per-variant deal pricing).
  const [variants, setVariants] = useState<AdminProductVariantOption[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // `now` is used for the per-row lifecycle badge; ticking once per minute
  // keeps the "LIVE" → "EXPIRED" flip fresh without re-fetching the list.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadItems = useCallback(
    async (status: DealLifecycle, withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      setError(null);
      try {
        const resp = await adminApi.listDeals({
          status: status === "all" ? undefined : status,
          sortBy: sort.field,
          sortOrder: sort.order,
          createdFrom: dateRange.createdFrom,
          createdTo: dateRange.createdTo,
          updatedFrom: dateRange.updatedFrom,
          updatedTo: dateRange.updatedTo,
        });
        setItems(resp.items);
      } catch (e) {
        setError(isApiError(e) ? e.displayMessage : "Failed to load deals");
      } finally {
        setLoading(false);
      }
    },
    [sort, dateRange],
  );

  useEffect(() => {
    let cancelled = false;
    void adminApi
      .listDeals({
        status: statusFilter === "all" ? undefined : statusFilter,
        sortBy: sort.field,
        sortOrder: sort.order,
        createdFrom: dateRange.createdFrom,
        createdTo: dateRange.createdTo,
        updatedFrom: dateRange.updatedFrom,
        updatedTo: dateRange.updatedTo,
      })
      .then((resp) => {
        if (!cancelled) {
          setItems(resp.items);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(isApiError(e) ? e.displayMessage : "Failed to load deals");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, sort, dateRange]);

  const exportQuery = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    }),
    [statusFilter, sort, dateRange],
  );

  // Debounce product search.
  useEffect(() => {
    const trimmed = pickerInput.trim();
    if (!trimmed) {
      const t = window.setTimeout(() => {
        setPickerQuery("");
        setPickerResults([]);
        setPickerLoading(false);
      }, 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setPickerQuery(trimmed);
      setPickerLoading(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [pickerInput]);

  useEffect(() => {
    if (!pickerOpen || !pickerQuery) return;
    let cancelled = false;
    catalogApi
      .listProducts({ search: pickerQuery, limit: 8 })
      .then((resp) => {
        if (!cancelled) {
          setPickerResults(resp.items);
          setPickerLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPickerResults([]);
          setPickerLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pickerQuery, pickerOpen]);

  // Load a product's variants so the admin can scope the deal to one. Called
  // from the pick / edit handlers (an event), not an effect.
  const loadVariants = useCallback(async (productId: string) => {
    setVariantsLoading(true);
    try {
      setVariants(await adminApi.listVariants(productId));
    } catch {
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormError(null);
    setVariants([]);
    setModalMode("create");
  };

  const openEdit = (d: Deal) => {
    setForm({
      productId: d.productId,
      productName: d.product.name,
      productImageUrl: d.product.primaryImageUrl,
      productBasePrice: d.basePrice,
      productSellingPrice: null,
      variantId: d.variantId,
      scope: "whole",
      // Whole-product deals are entered as a % off the base price; reconstruct it.
      discountPercent:
        d.variantId == null && d.basePrice > 0
          ? String(Math.round(((d.basePrice - d.dealPrice) / d.basePrice) * 100))
          : "",
      dealPrice: String(d.dealPrice),
      variantPrices: {},
      startsAt: toDatetimeLocal(d.startsAt),
      endsAt: toDatetimeLocal(d.endsAt),
      isActive: d.isActive,
    });
    setEditId(d.id);
    setFormError(null);
    setVariants([]);
    setModalMode("edit");
    void loadVariants(d.productId);
  };

  const closeModal = () => {
    setModalMode("closed");
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPickerOpen(false);
    setVariants([]);
  };

  const pickProduct = (card: ListCard) => {
    setForm((prev) => ({
      ...prev,
      productId: card.id,
      productName: card.name,
      productImageUrl: card.primaryImageUrl,
      productBasePrice: card.basePrice,
      productSellingPrice: card.finalPrice,
      variantId: null,
      discountPercent: "",
      variantPrices: {},
    }));
    setPickerOpen(false);
    setPickerInput("");
    setPickerQuery("");
    setPickerResults([]);
    void loadVariants(card.id);
  };

  // Resolve the selected variant's price tiers (base/selling) for display and
  // validation; product-wide deals fall back to the product base price.
  const selectedVariant = form.variantId
    ? (variants.find((v) => v.id === form.variantId) ?? null)
    : null;
  const productBase = form.productBasePrice ?? 0;
  const sellingPrice = selectedVariant
    ? (selectedVariant.priceOverride ?? productBase)
    : (form.productSellingPrice ?? productBase);
  const baseDisplayPrice = selectedVariant
    ? (selectedVariant.basePrice ?? sellingPrice)
    : productBase;

  const perVariant = modalMode === "create" && form.scope === "perVariant";
  // A whole-product deal is entered as a % off the base price (create scope
  // "whole", or editing a deal that isn't variant-scoped). Variant-scoped deals
  // keep an absolute ₹ deal price.
  const wholeProductDeal =
    (modalMode === "create" && form.scope === "whole") ||
    (modalMode === "edit" && !form.variantId);

  const submit = async () => {
    setFormError(null);
    const startIso = fromDatetimeLocal(form.startsAt);
    const endIso = fromDatetimeLocal(form.endsAt);

    if (modalMode === "create" && !form.productId) {
      setFormError("Please pick a product.");
      return;
    }
    if (!startIso || !endIso) {
      setFormError("Start and end times are required.");
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setFormError("End time must be after start time.");
      return;
    }

    // Per-variant grid: build one deal per filled row.
    if (perVariant) {
      const items: CreateDealBody[] = [];
      for (const v of variants) {
        const raw = form.variantPrices[v.id];
        if (raw == null || raw.trim() === "") continue;
        const price = Number(raw);
        const { selling } = variantTiers(v, productBase);
        if (!Number.isFinite(price) || price <= 0) {
          setFormError(`Enter a valid deal price for ${variantLabel(v)}.`);
          return;
        }
        if (selling > 0 && price >= selling) {
          setFormError(
            `${variantLabel(v)}: deal price must be less than ₹${selling.toLocaleString(
              "en-IN",
            )}.`,
          );
          return;
        }
        items.push({
          productId: form.productId,
          variantId: v.id,
          dealPrice: price,
          startsAt: startIso,
          endsAt: endIso,
          isActive: form.isActive,
        });
      }
      if (items.length === 0) {
        setFormError("Enter a deal price for at least one variant.");
        return;
      }
      setSaveBusy(true);
      try {
        await adminApi.createDealsBulk(items);
        closeModal();
        await loadItems(statusFilter, false);
      } catch (e) {
        setFormError(isApiError(e) ? e.displayMessage : "Save failed");
      } finally {
        setSaveBusy(false);
      }
      return;
    }

    // Whole-product deal: entered as a % off the base price (MRP). Stored as the
    // equivalent base-config deal price; the API applies the same % to each
    // variant's own MRP.
    if (wholeProductDeal) {
      const pct = Number(form.discountPercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
        setFormError("Discount must be between 1 and 99%.");
        return;
      }
      if (productBase <= 0) {
        setFormError("This product has no base price to discount.");
        return;
      }
      const dealPrice = Math.round(productBase * (1 - pct / 100));
      setSaveBusy(true);
      try {
        if (modalMode === "create") {
          await adminApi.createDeal({
            productId: form.productId,
            variantId: undefined,
            dealPrice,
            startsAt: startIso,
            endsAt: endIso,
            isActive: form.isActive,
          });
        } else if (editId) {
          await adminApi.updateDeal(editId, {
            dealPrice,
            startsAt: startIso,
            endsAt: endIso,
            isActive: form.isActive,
          });
        }
        closeModal();
        await loadItems(statusFilter, false);
      } catch (e) {
        setFormError(isApiError(e) ? e.displayMessage : "Save failed");
      } finally {
        setSaveBusy(false);
      }
      return;
    }

    // Variant-scoped edit: an absolute ₹ deal price.
    const dealPriceNum = Number(form.dealPrice);
    if (!Number.isFinite(dealPriceNum) || dealPriceNum <= 0) {
      setFormError("Deal price must be a positive number.");
      return;
    }
    if (sellingPrice > 0 && dealPriceNum >= sellingPrice) {
      setFormError(
        `Deal price must be less than the selling price (₹${sellingPrice.toLocaleString(
          "en-IN",
        )}).`,
      );
      return;
    }

    setSaveBusy(true);
    try {
      if (editId) {
        await adminApi.updateDeal(editId, {
          dealPrice: dealPriceNum,
          startsAt: startIso,
          endsAt: endIso,
          isActive: form.isActive,
        });
      }
      closeModal();
      await loadItems(statusFilter, false);
    } catch (e) {
      setFormError(isApiError(e) ? e.displayMessage : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  };

  const toggle = async (d: Deal) => {
    try {
      await adminApi.toggleDeal(d.id);
      await loadItems(statusFilter, false);
    } catch (e) {
      setError(isApiError(e) ? e.displayMessage : "Toggle failed");
    }
  };

  const remove = async () => {
    if (!confirmDeleteId) return;
    setDeleteBusy(true);
    try {
      await adminApi.deleteDeal(confirmDeleteId);
      setConfirmDeleteId(null);
      await loadItems(statusFilter, false);
    } catch (e) {
      setError(isApiError(e) ? e.displayMessage : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Today Deals"
        actions={
          <ExportCsvButton
            path="/admin/deals/export.csv"
            query={exportQuery}
            filename="deals"
          />
        }
      />
      <main className="p-6 space-y-6">
        {/* Filter chips + create */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatusFilter(t.value)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  statusFilter === t.value
                    ? "bg-[#129cd3] text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:border-[#129cd3]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <SortByDropdown
              options={SORT_OPTIONS}
              currentSort={sort}
              onSort={setSort}
            />
            <DateRangeFilter value={dateRange} onApply={setDateRange} />
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-[#129cd3] text-white text-sm rounded-lg hover:bg-[#0e87b5] transition-colors"
            >
              <Plus size={16} />
              New Deal
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading deals…
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
            <Zap size={32} className="mx-auto mb-2 text-gray-300" />
            No deals in this view.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-bold text-gray-600 uppercase tracking-wide">
                  <th className="px-4 py-3">Product</th>
                  <SortableHeader
                    field="dealPrice"
                    currentSort={sort}
                    onSort={setSort}
                    className="!px-4"
                  >
                    Deal Price
                  </SortableHeader>
                  <th className="px-4 py-3">Base</th>
                  <th className="px-4 py-3">Off</th>
                  <SortableHeader
                    field="startsAt"
                    currentSort={sort}
                    onSort={setSort}
                    className="!px-4"
                  >
                    Starts
                  </SortableHeader>
                  <SortableHeader
                    field="endsAt"
                    currentSort={sort}
                    onSort={setSort}
                    className="!px-4"
                  >
                    Ends
                  </SortableHeader>
                  <SortableHeader
                    field="createdAt"
                    currentSort={sort}
                    onSort={setSort}
                    className="!px-4"
                  >
                    Added
                  </SortableHeader>
                  <SortableHeader
                    field="updatedAt"
                    currentSort={sort}
                    onSort={setSort}
                    className="!px-4"
                  >
                    Updated
                  </SortableHeader>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((d) => {
                  const phase = lifecycleOf(d, now);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {d.product.primaryImageUrl ? (
                            <Image
                              src={d.product.primaryImageUrl}
                              alt={d.product.name}
                              width={40}
                              height={40}
                              className="w-10 h-10 object-contain rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 rounded" />
                          )}
                          <div className="min-w-0">
                            <span className="text-gray-800 block truncate">
                              {d.product.name}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {d.variant
                                ? variantLabel(d.variant)
                                : "Whole product"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#129cd3]">
                        {formatPrice(d.dealPrice)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 line-through">
                        {formatPrice(d.basePrice)}
                      </td>
                      <td className="px-4 py-3 text-green-600 font-medium">
                        -{d.percentOff}%
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {formatTimestamp(d.startsAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {formatTimestamp(d.endsAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {formatTimestamp(d.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {formatUpdated(d.createdAt, d.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-[11px] font-medium rounded ${
                            phase === "live"
                              ? "bg-green-100 text-green-800"
                              : phase === "upcoming"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {phase.toUpperCase()}
                          {!d.isActive && phase !== "expired" && " (off)"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggle(d)}
                            title={d.isActive ? "Pause deal" : "Activate deal"}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                            aria-label={d.isActive ? "Pause deal" : "Activate deal"}
                          >
                            {d.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                          <button
                            onClick={() => openEdit(d)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                            aria-label="Edit deal"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(d.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600"
                            aria-label="Delete deal"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalMode !== "closed" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="font-bold text-gray-800">
                {modalMode === "create" ? "New Deal" : "Edit Deal"}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Product picker (create only) */}
              {modalMode === "create" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Product
                  </label>
                  {form.productId ? (
                    <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                      {form.productImageUrl ? (
                        <Image
                          src={form.productImageUrl}
                          alt={form.productName}
                          width={48}
                          height={48}
                          className="w-12 h-12 object-contain rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          {form.productName}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            productId: "",
                            productName: "",
                            productImageUrl: null,
                            productBasePrice: null,
                            variantId: null,
                            scope: "whole",
                            discountPercent: "",
                            variantPrices: {},
                          }));
                          setVariants([]);
                          setPickerOpen(true);
                        }}
                        className="text-xs text-[#129cd3] hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-[#129cd3] hover:text-[#129cd3]"
                    >
                      <Search size={14} className="inline mr-1" />
                      Pick an active product…
                    </button>
                  )}
                </div>
              )}

              {modalMode === "edit" && (
                <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                  {form.productImageUrl ? (
                    <Image
                      src={form.productImageUrl}
                      alt={form.productName}
                      width={48}
                      height={48}
                      className="w-12 h-12 object-contain rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">
                      {form.productName}
                    </p>
                  </div>
                </div>
              )}

              {/* Picker dropdown */}
              {pickerOpen && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      autoFocus
                      type="text"
                      value={pickerInput}
                      onChange={(e) => setPickerInput(e.target.value)}
                      placeholder="Search products by name"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                    />
                  </div>
                  {pickerLoading && (
                    <p className="text-xs text-gray-500">Searching…</p>
                  )}
                  {!pickerLoading &&
                    pickerQuery &&
                    pickerResults.length === 0 && (
                      <p className="text-xs text-gray-500">No matches.</p>
                    )}
                  <ul className="space-y-1 max-h-60 overflow-y-auto">
                    {pickerResults.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => pickProduct(p)}
                          className="w-full flex items-center gap-3 p-2 rounded hover:bg-gray-50 text-left"
                        >
                          {p.primaryImageUrl ? (
                            <Image
                              src={p.primaryImageUrl}
                              alt={p.name}
                              width={32}
                              height={32}
                              className="w-8 h-8 object-contain rounded"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gray-100 rounded" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatPrice(p.basePrice)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Variant scope + price tiers */}
              {form.productId && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Variant
                    </label>
                    {modalMode === "create" ? (
                      variantsLoading ? (
                        <p className="text-xs text-gray-500">
                          Loading variants…
                        </p>
                      ) : variants.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No variants — this deal applies to the whole product.
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          {(
                            [
                              ["whole", "Whole product"],
                              ["perVariant", "Per variant"],
                            ] as const
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  scope: value,
                                  variantId: null,
                                }))
                              }
                              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                form.scope === value
                                  ? "bg-[#129cd3] text-white"
                                  : "bg-white border border-gray-200 text-gray-700 hover:border-[#129cd3]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      <p className="text-sm text-gray-700">
                        {selectedVariant
                          ? variantLabel(selectedVariant)
                          : form.variantId
                            ? variantsLoading
                              ? "Loading variant…"
                              : "Variant"
                            : "Whole product (all variants)"}
                      </p>
                    )}
                  </div>

                  {perVariant ? (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {variants.map((v) => {
                        const { base, selling } = variantTiers(v, productBase);
                        return (
                          <div
                            key={v.id}
                            className="flex items-center gap-3 p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 truncate">
                                {variantLabel(v)}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {formatPrice(selling)}
                                {base !== selling && (
                                  <span className="line-through ml-1">
                                    {formatPrice(base)}
                                  </span>
                                )}
                              </p>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.variantPrices[v.id] ?? ""}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  variantPrices: {
                                    ...p.variantPrices,
                                    [v.id]: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Deal ₹"
                              className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Base Price
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {formatPrice(baseDisplayPrice)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Selling Price
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {formatPrice(sellingPrice)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {perVariant ? null : wholeProductDeal ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="99"
                    value={form.discountPercent}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, discountPercent: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                    placeholder="e.g., 8"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Applied as % off each variant&apos;s base price (MRP).
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Deal Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.dealPrice}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, dealPrice: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                    placeholder="e.g., 750"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Starts At
                  </label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startsAt: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Ends At
                  </label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endsAt: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#129cd3]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, isActive: e.target.checked }))
                  }
                />
                Active (visible to customers within the window)
              </label>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded">
                  {formError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saveBusy}
                className="px-4 py-2 text-sm rounded-lg bg-[#129cd3] text-white hover:bg-[#0e87b5] disabled:opacity-50 flex items-center gap-1.5"
              >
                {saveBusy && <Loader2 size={14} className="animate-spin" />}
                {modalMode === "create" ? "Create Deal" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h3 className="font-bold text-gray-800 mb-2">Delete deal?</h3>
            <p className="text-sm text-gray-600 mb-4">
              The product will immediately return to its normal price. This
              cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleteBusy}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={remove}
                disabled={deleteBusy}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleteBusy && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
