"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ProductCardExpander, ProductCardSkeleton, detailCache } from "@/components/ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type {
  BrandFacet,
  CatalogSort,
  CategoryNode,
  ListCard,
  ProductListResponse,
} from "@/lib/api";
import { SlidersHorizontal, ChevronDown, ChevronUp, Star, ArrowLeft } from "lucide-react";

type CategoryOption = { slug: string; name: string };

type SortOption = {
  label: string;
  value: CatalogSort | undefined;
};

const sortOptions: SortOption[] = [
  { label: "Featured", value: undefined },
  { label: "Top Rated", value: "top-rated" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Newest", value: "newest" },
];

const ratingOptions = [4, 3, 2, 1] as const;

const PAGE_LIMIT = 24;

const PRICE_FLOOR = 0;
const PRICE_CEIL = 200000; // top of the slider; treated as open-ended (200000+)
const PRICE_STEP = 1000;

// Quick-pick ranges; the last bucket reaches PRICE_CEIL and so is open-ended.
const priceBuckets: { label: string; min: number; max: number }[] = [
  { label: "₹0 – ₹1K", min: 0, max: 1000 },
  { label: "₹1K – ₹5K", min: 1000, max: 5000 },
  { label: "₹5K – ₹10K", min: 5000, max: 10000 },
  { label: "₹10K – ₹20K", min: 10000, max: 20000 },
  { label: "₹20K – ₹50K", min: 20000, max: 50000 },
  { label: "₹50K – ₹1L", min: 50000, max: 100000 },
  { label: "₹1L – ₹2L", min: 100000, max: 200000 },
  { label: "₹2L+", min: 200000, max: 200000 },
];

// ── Phone-specific filter groups ──────────────────────────────────────────────
type PhoneFilterGroup = { key: string; label: string; options: string[] };

const PHONE_FILTER_GROUPS: PhoneFilterGroup[] = [
  {
    key: "ram",
    label: "RAM",
    options: ["1 GB and Below", "2 GB", "3 GB", "4 GB", "6 GB", "8 GB and Above"],
  },
  {
    key: "storage",
    label: "Internal Storage",
    options: [
      "256 GB & Above",
      "128 - 255.9 GB",
      "64 - 127.9 GB",
      "32 - 63.9 GB",
      "16 - 31.9 GB",
      "8 - 15.9 GB",
      "4 - 7.9 GB",
      "2 GB - 3.9 GB",
      "1 GB - 1.9 GB",
      "Less than 1 GB",
    ],
  },
  {
    key: "battery",
    label: "Battery Capacity",
    options: [
      "Less than 1000 mAh",
      "1000 - 1999 mAh",
      "2000 - 2999 mAh",
      "3000 - 3999 mAh",
      "4000 - 4999 mAh",
      "5000 - 5999 mAh",
      "6000 mAh & Above",
    ],
  },
  {
    key: "screenSize",
    label: "Screen Size",
    options: [
      "Less than 3 inch",
      "3 - 3.4 inch",
      "3.5 - 3.9 inch",
      "4 - 4.4 inch",
      "4.5 - 4.9 inch",
      "5 - 5.1 inch",
      "5.2 - 5.4 inch",
      "5.5 - 5.6 inch",
      "5.7 - 5.9 inch",
      "6 - 6.3 inch",
      "6.4 inch & Above",
    ],
  },
  {
    key: "primaryCamera",
    label: "Rear Camera",
    options: [
      "Below 5 MP",
      "5 - 7.9 MP",
      "8 - 11.9 MP",
      "12 - 15.9 MP",
      "16 - 20.9 MP",
      "21 - 31.9 MP",
      "32 - 47.9 MP",
      "48 - 63.9 MP",
      "64 MP & Above",
    ],
  },
  {
    key: "secondaryCamera",
    label: "Front Camera",
    options: [
      "Below 5 MP",
      "5 - 7.9 MP",
      "8 - 11.9 MP",
      "12 - 15.9 MP",
      "16 - 20.9 MP",
      "21 MP & Above",
    ],
  },
];

// Parse a "12GB" or "12 GB" attribute string into a number.
function parseGb(val: unknown): number | null {
  if (!val) return null;
  const m = String(val).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchRamGb(gb: number, option: string): boolean {
  if (option === "1 GB and Below") return gb <= 1;
  if (option === "2 GB") return gb === 2;
  if (option === "3 GB") return gb === 3;
  if (option === "4 GB") return gb === 4;
  if (option === "6 GB") return gb === 6;
  if (option === "8 GB and Above") return gb >= 8;
  return false;
}
function matchStorageGb(gb: number, option: string): boolean {
  if (option === "256 GB & Above") return gb >= 256;
  if (option === "128 - 255.9 GB") return gb >= 128 && gb < 256;
  if (option === "64 - 127.9 GB") return gb >= 64 && gb < 128;
  if (option === "32 - 63.9 GB") return gb >= 32 && gb < 64;
  if (option === "16 - 31.9 GB") return gb >= 16 && gb < 32;
  if (option === "8 - 15.9 GB") return gb >= 8 && gb < 16;
  if (option === "4 - 7.9 GB") return gb >= 4 && gb < 8;
  if (option === "2 GB - 3.9 GB") return gb >= 2 && gb < 4;
  if (option === "1 GB - 1.9 GB") return gb >= 1 && gb < 2;
  if (option === "Less than 1 GB") return gb < 1;
  return false;
}

// Collect all unique RAM and storage values across a product's cached variants.
function variantValues(slug: string): { rams: number[]; storages: number[] } {
  const cached = detailCache.get(slug);
  if (!cached || cached.variants.length === 0) return { rams: [], storages: [] };
  const rams: number[] = [];
  const storages: number[] = [];
  for (const v of cached.variants) {
    const r = parseGb(v.attributes["ram"]);
    if (r !== null && !rams.includes(r)) rams.push(r);
    const s = parseGb(v.attributes["storage"]);
    if (s !== null && !storages.includes(s)) storages.push(s);
  }
  return { rams, storages };
}

// Fallback: extract GB values from product name string.
function nameRamGb(name: string): number | null {
  const m = name.match(/\((\d+)\s*GB\s*\+/i) ?? name.match(/(\d+)\s*GB\s*RAM/i);
  return m ? Number(m[1]) : null;
}
function nameStorageGb(name: string): number | null {
  const m = name.match(/\+\s*(\d+)\s*GB\s*\)/i) ?? name.match(/(\d+)\s*GB\s*(?:ROM|Storage|Internal)/i);
  return m ? Number(m[1]) : null;
}

// Parse leading numeric value from a spec string, e.g. "5000 mAh" → 5000, "6.7 inch" → 6.7, "200 MP" → 200
function parseSpec(val: unknown): number | null {
  if (!val) return null;
  const m = String(val).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchBattery(mah: number, option: string): boolean {
  if (option === "Less than 1000 mAh") return mah < 1000;
  if (option === "1000 - 1999 mAh") return mah >= 1000 && mah < 2000;
  if (option === "2000 - 2999 mAh") return mah >= 2000 && mah < 3000;
  if (option === "3000 - 3999 mAh") return mah >= 3000 && mah < 4000;
  if (option === "4000 - 4999 mAh") return mah >= 4000 && mah < 5000;
  if (option === "5000 - 5999 mAh") return mah >= 5000 && mah < 6000;
  if (option === "6000 mAh & Above") return mah >= 6000;
  return false;
}

function matchScreenSize(inch: number, option: string): boolean {
  if (option === "Less than 3 inch") return inch < 3;
  if (option === "3 - 3.4 inch") return inch >= 3 && inch <= 3.4;
  if (option === "3.5 - 3.9 inch") return inch >= 3.5 && inch <= 3.9;
  if (option === "4 - 4.4 inch") return inch >= 4 && inch <= 4.4;
  if (option === "4.5 - 4.9 inch") return inch >= 4.5 && inch <= 4.9;
  if (option === "5 - 5.1 inch") return inch >= 5 && inch <= 5.1;
  if (option === "5.2 - 5.4 inch") return inch >= 5.2 && inch <= 5.4;
  if (option === "5.5 - 5.6 inch") return inch >= 5.5 && inch <= 5.6;
  if (option === "5.7 - 5.9 inch") return inch >= 5.7 && inch <= 5.9;
  if (option === "6 - 6.3 inch") return inch >= 6 && inch <= 6.3;
  if (option === "6.4 inch & Above") return inch >= 6.4;
  return false;
}

function matchCamera(mp: number, option: string): boolean {
  if (option === "Below 5 MP") return mp < 5;
  if (option === "5 - 7.9 MP") return mp >= 5 && mp < 8;
  if (option === "8 - 11.9 MP") return mp >= 8 && mp < 12;
  if (option === "12 - 15.9 MP") return mp >= 12 && mp < 16;
  if (option === "16 - 20.9 MP") return mp >= 16 && mp < 21;
  if (option === "21 - 31.9 MP") return mp >= 21 && mp < 32;
  if (option === "32 - 47.9 MP") return mp >= 32 && mp < 48;
  if (option === "48 - 63.9 MP") return mp >= 48 && mp < 64;
  if (option === "64 MP & Above") return mp >= 64;
  if (option === "21 MP & Above") return mp >= 21; // front camera bucket
  return false;
}

function applyPhoneFilters(items: ListCard[], phoneFilters: Record<string, string[]>): ListCard[] {
  const ramOpts     = phoneFilters["ram"]           ?? [];
  const storOpts    = phoneFilters["storage"]       ?? [];
  const batOpts     = phoneFilters["battery"]       ?? [];
  const screenOpts  = phoneFilters["screenSize"]    ?? [];
  const rearOpts    = phoneFilters["primaryCamera"] ?? [];
  const frontOpts   = phoneFilters["secondaryCamera"] ?? [];

  const hasAny = [ramOpts, storOpts, batOpts, screenOpts, rearOpts, frontOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);

    // ── RAM ──────────────────────────────────────────────────────────────────
    if (ramOpts.length > 0) {
      const { rams } = variantValues(item.slug);
      if (rams.length > 0) {
        if (!ramOpts.some((opt) => rams.some((gb) => matchRamGb(gb, opt)))) return false;
      } else {
        const gb = nameRamGb(item.name);
        if (gb === null) return false;
        if (!ramOpts.some((opt) => matchRamGb(gb, opt))) return false;
      }
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    if (storOpts.length > 0) {
      const { storages } = variantValues(item.slug);
      if (storages.length > 0) {
        if (!storOpts.some((opt) => storages.some((gb) => matchStorageGb(gb, opt)))) return false;
      } else {
        const gb = nameStorageGb(item.name);
        if (gb === null) return false;
        if (!storOpts.some((opt) => matchStorageGb(gb, opt))) return false;
      }
    }

    // ── Battery ───────────────────────────────────────────────────────────────
    if (batOpts.length > 0) {
      const mah = parseSpec(cached?.specs["Battery"]);
      if (mah === null) return false;
      if (!batOpts.some((opt) => matchBattery(mah, opt))) return false;
    }

    // ── Screen Size ───────────────────────────────────────────────────────────
    if (screenOpts.length > 0) {
      const inch = parseSpec(cached?.specs["Display Size"]);
      if (inch === null) return false;
      if (!screenOpts.some((opt) => matchScreenSize(inch, opt))) return false;
    }

    // ── Rear Camera ───────────────────────────────────────────────────────────
    if (rearOpts.length > 0) {
      const mp = parseSpec(cached?.specs["Rear Camera"]);
      if (mp === null) return false;
      if (!rearOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    // ── Front Camera ──────────────────────────────────────────────────────────
    if (frontOpts.length > 0) {
      const mp = parseSpec(cached?.specs["Front Camera"]);
      if (mp === null) return false;
      if (!frontOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    return true;
  });
}

// Generic collapsible wrapper used by Price Range, Brand, Rating
function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2"
      >
        {label}
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && children}
    </div>
  );
}

// Collapsible checkbox filter section for phone-specific filters
function FilterSection({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
  };
  return (
    <CollapsibleSection label={label}>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="w-3.5 h-3.5 accent-[#129cd3] cursor-pointer rounded"
            />
            <span className="text-xs text-gray-600 group-hover:text-[#129cd3] transition-colors leading-snug">
              {opt}
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsPageFallback />}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageFallback() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen" />
      <Footer />
    </>
  );
}

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("category");

  const selectedCategory = urlCategory;
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState(PRICE_FLOOR);
  const [maxPrice, setMaxPrice] = useState(PRICE_CEIL);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [sortLabel, setSortLabel] = useState<string>("Featured");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Phone-specific filters (shown only when phone category is selected)
  const [phoneFilters, setPhoneFilters] = useState<Record<string, string[]>>({});
const [headerHeight, setHeaderHeight] = useState(0);

useEffect(() => {
  const header = document.querySelector("header");
  if (!header) return;

  const observer = new ResizeObserver(([entry]) => {
    setHeaderHeight(entry.contentRect.height);
  });

  observer.observe(header);
  return () => observer.disconnect();
}, []);

  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    catalogApi
      .getCategories(ac.signal)
      .then((all: CategoryNode[]) => {
        if (ac.signal.aborted) return;
        setCategoryOptions(
          all
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => ({ slug: c.slug.toLowerCase(), name: c.name })),
        );
      })
      .catch(() => {
        /* sidebar shows empty state */
      })
      .finally(() => {
        if (!ac.signal.aborted) setCategoriesLoading(false);
      });
    return () => ac.abort();
  }, []);

  const selectCategory = (slug: string | null) => {
    const normalized = slug ? slug.toLowerCase() : null;
    const params = new URLSearchParams(searchParams.toString());
    if (normalized) params.set("category", normalized);
    else params.delete("category");
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products");
    // Reset phone-specific filters when changing category
    setPhoneFilters({});
  };

  useEffect(() => {
    const ac = new AbortController();
    const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;

    catalogApi
      .listProducts(
        {
          category: selectedCategory ?? undefined,
          brand: selectedBrand ?? undefined,
          // NOTE: priceMin/priceMax intentionally omitted — backend filters by variant MRP
          // (basePrice) instead of selling price (finalPrice), causing incorrect results for
          // discounted products. We apply both price bounds client-side below.
          minRating: minRating ?? undefined,
          sort: sortValue,
          limit: PAGE_LIMIT,
        },
        ac.signal,
      )
      .then((resp) => {
        if (ac.signal.aborted) return;
        setData(resp);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(
          isApiError(err) ? err.displayMessage : "Failed to load products",
        );
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [selectedCategory, selectedBrand, minPrice, maxPrice, minRating, sortLabel]);

  // cacheTick increments after detail pre-fetch completes so applyPhoneFilters re-runs.
  const [cacheTick, setCacheTick] = useState(0);

  const rawItems: ListCard[] = data?.items ?? [];

  // Client-side price filter: backend filters by variant MRP (basePrice) not selling price
  // (finalPrice), so products with MRP outside range but selling price inside range are
  // incorrectly included/excluded. We filter here using lowestVariantPrice ?? finalPrice.
  const priceFilteredItems = rawItems.filter((p) => {
    const price = p.lowestVariantPrice ?? p.finalPrice;
    if (minPrice > PRICE_FLOOR && price < minPrice) return false;
    if (maxPrice < PRICE_CEIL && price > maxPrice) return false;
    return true;
  });

  const isPhoneCategory = selectedCategory?.toLowerCase() === "phone";
  const hasPhoneFilters = Object.values(phoneFilters).some((v) => v.length > 0);

  // When phone filters are active, pre-fetch detail for items not yet cached so
  // applyPhoneFilters can use real variant attributes instead of name parsing.
  useEffect(() => {
    if (!isPhoneCategory || !hasPhoneFilters || priceFilteredItems.length === 0) return;
    const uncached = priceFilteredItems.filter((item) => !detailCache.has(item.slug));
    if (uncached.length === 0) return;
    let cancelled = false;
    Promise.all(
      uncached.map((item) =>
        catalogApi.getProduct(item.slug).then((d) => {
          detailCache.set(item.slug, { stock: d.stock, variants: d.variants, specs: d.specs ?? {} });
        }).catch(() => {})
      )
    ).then(() => {
      if (!cancelled) setCacheTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [isPhoneCategory, hasPhoneFilters, priceFilteredItems]);

  // cacheTick read to make React re-render after pre-fetch.
  void cacheTick;
  const items: ListCard[] = isPhoneCategory ? applyPhoneFilters(priceFilteredItems, phoneFilters) : priceFilteredItems;
  const total = data?.total ?? 0;
  const brandFacets: BrandFacet[] = data?.facets.brands ?? [];

  const setPhoneFilter = (key: string, values: string[]) => {
    setPhoneFilters((prev) => ({ ...prev, [key]: values }));
  };

  const filterSidebar = (
    <aside className="w-full space-y-6">
      {/* Categories */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Category
        </h3>
        <div className="space-y-2">
          {categoriesLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : categoryOptions.length === 0 ? (
            <p className="text-xs text-gray-400">No categories available.</p>
          ) : (
            categoryOptions.map((cat) => (
              <label key={cat.slug} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory === cat.slug}
                  onChange={() =>
                    selectCategory(selectedCategory === cat.slug ? null : cat.slug)
                  }
                  className="w-4 h-4 accent-[#129cd3] cursor-pointer"
                />
                <span className="text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                  {cat.name}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Price Range — collapsible */}
      <CollapsibleSection label="Price Range">
        {/* Predefined quick-pick ranges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {priceBuckets.map((b) => {
            const active = minPrice === b.min && maxPrice === b.max;
            return (
              <button
                key={b.label}
                onClick={() => {
                  setMinPrice(b.min);
                  setMaxPrice(b.max);
                }}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  active
                    ? "border-[#129cd3] bg-[#e8f7fc] text-[#129cd3] font-medium"
                    : "border-gray-200 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Dual-handle slider */}
        <div className="relative h-5">
          <div className="absolute top-1/2 -translate-y-1/2 h-1 w-full rounded bg-gray-200" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-[#129cd3]"
            style={{
              left: `${(minPrice / PRICE_CEIL) * 100}%`,
              right: `${100 - (maxPrice / PRICE_CEIL) * 100}%`,
            }}
          />
          <input
            type="range"
            min={PRICE_FLOOR}
            max={PRICE_CEIL}
            step={PRICE_STEP}
            value={minPrice}
            onChange={(e) =>
              setMinPrice(Math.min(Number(e.target.value), maxPrice))
            }
            className="price-range absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{ zIndex: minPrice >= maxPrice ? 4 : 3 }}
            aria-label="Minimum price"
          />
          <input
            type="range"
            min={PRICE_FLOOR}
            max={PRICE_CEIL}
            step={PRICE_STEP}
            value={maxPrice}
            onChange={(e) =>
              setMaxPrice(Math.max(Number(e.target.value), minPrice))
            }
            className="price-range absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{ zIndex: 3 }}
            aria-label="Maximum price"
          />
        </div>

        <div className="flex items-center justify-between text-xs mt-2">
          <span className="font-semibold text-[#129cd3]">
            ₹{minPrice.toLocaleString("en-IN")}
          </span>
          <span className="font-semibold text-[#129cd3]">
            {maxPrice >= PRICE_CEIL
              ? "₹2,00,000+"
              : `₹${maxPrice.toLocaleString("en-IN")}`}
          </span>
        </div>
      </CollapsibleSection>

      {/* Brands — collapsible */}
      <CollapsibleSection label="Brand">
        <div className="space-y-2">
          {brandFacets.length === 0 ? (
            <p className="text-xs text-gray-400">No brands available.</p>
          ) : (
            brandFacets.map((b) => (
              <label key={b.name} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="brand"
                  checked={selectedBrand === b.name}
                  onChange={() =>
                    setSelectedBrand(selectedBrand === b.name ? null : b.name)
                  }
                  className="w-4 h-4 accent-[#129cd3] cursor-pointer"
                />
                <span className="text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                  {b.name}{" "}
                  <span className="text-xs text-gray-400">({b.count})</span>
                </span>
              </label>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Rating — collapsible */}
      <CollapsibleSection label="Rating">
        <div className="space-y-2">
          {ratingOptions.map((r) => (
            <label
              key={r}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="radio"
                name="rating"
                checked={minRating === r}
                onChange={() => setMinRating(minRating === r ? null : r)}
                className="w-4 h-4 accent-[#129cd3] cursor-pointer"
              />
              <span className="flex items-center gap-1 text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={
                      i < r
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200 fill-gray-200"
                    }
                  />
                ))}
                <span className="ml-1 text-xs text-gray-500">&amp; up</span>
              </span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Phone-specific filters — shown only for phone category */}
      {isPhoneCategory && PHONE_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={phoneFilters[group.key] ?? []}
          onChange={(vals) => setPhoneFilter(group.key, vals)}
        />
      ))}

      {/* Clear Filters */}
      {(selectedCategory !== null ||
        selectedBrand !== null ||
        minRating !== null ||
        minPrice !== PRICE_FLOOR ||
        maxPrice !== PRICE_CEIL ||
        hasPhoneFilters) && (
        <button
          onClick={() => {
            selectCategory(null);
            setSelectedBrand(null);
            setMinRating(null);
            setMinPrice(PRICE_FLOOR);
            setMaxPrice(PRICE_CEIL);
            setPhoneFilters({});
          }}
          className="w-full py-2 border border-[#129cd3] text-[#129cd3] text-sm rounded hover:bg-[#e8f7fc] transition-colors"
        >
          Clear All Filters
        </button>
      )}
    </aside>
  );

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <span>/</span>
            <span className="text-gray-800 font-medium">All Products</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3] transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden flex items-center gap-2 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded hover:border-[#129cd3] hover:text-[#129cd3] transition-colors"
              >
                <SlidersHorizontal size={15} /> Filters
              </button>
              <p className="text-sm text-gray-600 whitespace-nowrap">
                {loading ? (
                  <span className="text-gray-400">Loading…</span>
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-semibold text-gray-800">{items.length}</span>
                    {total > items.length && (
                      <> of <span className="font-semibold text-gray-800">{total}</span></>
                    )}{" "}
                    results
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-600 hidden sm:block">Sort by:</span>
              <div className="relative">
                <select
                  value={sortLabel}
                  onChange={(e) => setSortLabel(e.target.value)}
                  className="appearance-none border border-gray-300 text-sm px-3 py-2 pr-8 rounded outline-none hover:border-[#129cd3] focus:border-[#129cd3] bg-white text-gray-700 cursor-pointer"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            {/* Sidebar — desktop */}
            <div className="hidden lg:block w-56 flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg p-5 sticky top-24 z-[999] max-h-[calc(100vh-7rem)] overflow-y-auto">
                {filterSidebar}
              </div>
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="lg:hidden">
                <div
                  className="fixed inset-0 z-[9998] bg-black/40"
                  style={{ top: headerHeight }}
                  onClick={() => setSidebarOpen(false)}
                />
                <div
                  className="fixed left-0 bottom-0 z-[9998] bg-white w-72 overflow-y-auto shadow-xl"
                  style={{ top: headerHeight }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <h2 className="font-bold text-gray-800">Filters</h2>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close filters"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-5">
                    {filterSidebar}
                  </div>
                </div>
              </div>
            )}

            {/* Product Grid */}
            <div className="flex-1">
              {error ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <p className="text-lg font-medium text-red-500 mb-1">Could not load products</p>
                  <p className="text-sm text-gray-400">{error}</p>
                </div>
              ) : loading ? (
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" style={{ gap: "clamp(7px, 1vw, 16px)" }}>
                  {[...Array(8)].map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <SlidersHorizontal size={48} className="mb-4 opacity-30" />
                  <p className="text-lg font-medium">No products found</p>
                  <p className="text-sm mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" style={{ gap: "clamp(7px, 1vw, 16px)" }}>
                  {items.map((product) => (
                    <ProductCardExpander key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
