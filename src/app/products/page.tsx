"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { ProductCardExpander, ProductCardSkeleton, detailCache } from "@/components/ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type {
  BrandFacet,
  CatalogSort,
  CategoryNode,
  ListCard,
  ProductListResponse,
  Variant,
} from "@/lib/api";
import { SlidersHorizontal, ChevronDown, ChevronUp, Star, ArrowLeft } from "lucide-react";
import { reorderCategories } from "@/lib/nav/categoryUtils";

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
  { label: "Below ₹10K", min: 0, max: 10000 },
  { label: "₹11K – ₹24.9K", min: 11000, max: 24900 },
  { label: "₹25K – ₹49.9K", min: 25000, max: 49900 },
  { label: "₹50K – ₹79.9K", min: 50000, max: 79900 },
  { label: "₹80K – ₹1.349L", min: 80000, max: 134900 },
  { label: "₹1.35L – ₹2L", min: 135000, max: 200000 },
  { label: "Above ₹2L", min: 200000, max: 200000 },
];

// ── Phone-specific filter groups ──────────────────────────────────────────────
type PhoneFilterGroup = { key: string; label: string; options: string[] };

const PHONE_FILTER_GROUPS: PhoneFilterGroup[] = [
  {
    key: "ram",
    label: "RAM",
    options: ["4 GB and Below", "6 GB", "8 GB and Above"],
  },
  {
    key: "storage",
    label: "Internal Storage",
    options: [
      "64 GB and Below",
      "64 GB - 127.9 GB",
      "128 GB - 255.9 GB",
      "256 GB and Above",
    ],
  },
  {
    key: "battery",
    label: "Battery Capacity",
    options: [
      "Less than 4000 mAh",
      "4000 - 6000 mAh",
      "Above 6000 mAh",
    ],
  },
  {
    key: "screenSize",
    label: "Screen Size",
    options: [
      "Below 4.4 inch",
      "4.5 - 5.6 inch",
      "5.7 - 6.4 inch",
      "Above 6.4 inch",
    ],
  },
  {
    key: "primaryCamera",
    label: "Rear Camera",
    options: [
      "Below 20.9 MP",
      "21 - 47.9 MP",
      "48 - 63.9 MP",
      "Above 64 MP",
    ],
  },
  {
    key: "secondaryCamera",
    label: "Front Camera",
    options: [
      "Below 12 MP",
      "12 - 15.9 MP",
      "16 - 20.9 MP",
      "21 MP and Above",
    ],
  },
];

// ── TV-specific filter groups ─────────────────────────────────────────────────
type TvFilterGroup = { key: string; label: string; options: string[] };

const TV_FILTER_GROUPS: TvFilterGroup[] = [
  {
    key: "screenSize",
    label: "Screen Size",
    options: [
      "Up to 25.9 in",
      "26.0 – 34.9 in",
      "35.0 – 43.9 in",
      "44.0 – 52.9 in",
      "53.0 – 61.9 in",
      "62.0 – 70.9 in",
      "71.0 in & above",
    ],
  },
  {
    key: "resolution",
    label: "Display Resolution",
    options: ["8K", "4K", "1080p", "720p"],
  },
  {
    key: "connectivity",
    label: "Connectivity",
    options: ["HDMI", "Wi-Fi", "USB", "AV", "Bluetooth", "Ethernet", "RF"],
  },
];

// Parse a "12GB" or "12 GB" attribute string into a number.
function parseGb(val: unknown): number | null {
  if (!val) return null;
  const m = String(val).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchRamGb(gb: number, option: string): boolean {
  if (option === "4 GB and Below") return gb <= 4;
  if (option === "6 GB") return gb === 6;
  if (option === "8 GB and Above") return gb >= 8;
  return false;
}
function matchStorageGb(gb: number, option: string): boolean {
  if (option === "64 GB and Below") return gb <= 64;
  if (option === "64 GB - 127.9 GB") return gb > 64 && gb < 128;
  if (option === "128 GB - 255.9 GB") return gb >= 128 && gb < 256;
  if (option === "256 GB and Above") return gb >= 256;
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
  if (option === "Less than 4000 mAh") return mah < 4000;
  if (option === "4000 - 6000 mAh") return mah >= 4000 && mah <= 6000;
  if (option === "Above 6000 mAh") return mah > 6000;
  return false;
}

function matchScreenSize(inch: number, option: string): boolean {
  if (option === "Below 4.4 inch") return inch < 4.4;
  if (option === "4.5 - 5.6 inch") return inch >= 4.5 && inch <= 5.6;
  if (option === "5.7 - 6.4 inch") return inch >= 5.7 && inch <= 6.4;
  if (option === "Above 6.4 inch") return inch > 6.4;
  return false;
}

function matchCamera(mp: number, option: string): boolean {
  // Rear camera
  if (option === "Below 20.9 MP") return mp < 21;
  if (option === "21 - 47.9 MP") return mp >= 21 && mp < 48;
  if (option === "48 - 63.9 MP") return mp >= 48 && mp < 64;
  if (option === "Above 64 MP") return mp >= 64;
  // Front camera
  if (option === "Below 12 MP") return mp < 12;
  if (option === "12 - 15.9 MP") return mp >= 12 && mp < 16;
  if (option === "16 - 20.9 MP") return mp >= 16 && mp < 21;
  if (option === "21 MP and Above") return mp >= 21;
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
      const mah =
        parseSpec(cached?.specs["Battery"]) ??
        parseSpec(cached?.specs["Battery Capacity"]) ??
        parseSpec(cached?.specs["battery"]);
      if (mah === null) return false;
      if (!batOpts.some((opt) => matchBattery(mah, opt))) return false;
    }

    // ── Screen Size ───────────────────────────────────────────────────────────
    if (screenOpts.length > 0) {
      const raw = cached?.specs["Display Size"];
      // Extract inch value: prefer explicit "X.X inch" pattern, else fall back to first number
      let inch: number | null = null;
      if (raw) {
        const inchMatch = String(raw).match(/(\d+(?:\.\d+)?)\s*inch/i);
        if (inchMatch) {
          inch = Number(inchMatch[1]);
        } else {
          // Value stored in cm — convert (e.g. "16.03 cm" → 6.31 inch)
          const cmMatch = String(raw).match(/(\d+(?:\.\d+)?)\s*cm/i);
          if (cmMatch) inch = Number(cmMatch[1]) / 2.54;
          else inch = parseSpec(raw);
        }
      }
      if (inch === null) return false;
      if (!screenOpts.some((opt) => matchScreenSize(inch!, opt))) return false;
    }

    // ── Rear Camera ───────────────────────────────────────────────────────────
    if (rearOpts.length > 0) {
      const mp =
        parseSpec(cached?.specs["Rear Camera"]) ??
        parseSpec(cached?.specs["Primary Camera"]) ??
        parseSpec(cached?.specs["Main Camera"]);
      if (mp === null) return false;
      if (!rearOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    // ── Front Camera ──────────────────────────────────────────────────────────
    if (frontOpts.length > 0) {
      const mp =
        parseSpec(cached?.specs["Front Camera"]) ??
        parseSpec(cached?.specs["Selfie Camera"]) ??
        parseSpec(cached?.specs["Secondary Camera"]);
      if (mp === null) return false;
      if (!frontOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    return true;
  });
}

function matchTvScreenSize(inch: number, option: string): boolean {
  if (option === "Up to 25.9 in") return inch <= 25.9;
  if (option === "26.0 – 34.9 in") return inch >= 26.0 && inch <= 34.9;
  if (option === "35.0 – 43.9 in") return inch >= 35.0 && inch <= 43.9;
  if (option === "44.0 – 52.9 in") return inch >= 44.0 && inch <= 52.9;
  if (option === "53.0 – 61.9 in") return inch >= 53.0 && inch <= 61.9;
  if (option === "62.0 – 70.9 in") return inch >= 62.0 && inch <= 70.9;
  if (option === "71.0 in & above") return inch >= 71.0;
  return false;
}

function matchTvResolution(val: string, option: string): boolean {
  const v = val.toLowerCase();
  if (option === "8K") return v.includes("8k") || v.includes("7680") || v.includes("8000");
  if (option === "4K") return v.includes("4k") || v.includes("uhd") || v.includes("3840") || v.includes("2160");
  if (option === "1080p") return v.includes("1080") || v.includes("full hd") || v.includes("fhd");
  if (option === "720p") return v.includes("720") || v.includes("hd ready");
  return false;
}

function matchTvConnectivity(val: string, option: string): boolean {
  const v = val.toLowerCase();
  if (option === "HDMI") return v.includes("hdmi");
  if (option === "Wi-Fi") return v.includes("wi-fi") || v.includes("wifi") || v.includes("wireless");
  if (option === "USB") return v.includes("usb");
  if (option === "AV") return v.includes(" av") || v.startsWith("av") || v.includes("composite");
  if (option === "Bluetooth") return v.includes("bluetooth");
  if (option === "Ethernet") return v.includes("ethernet") || v.includes("lan");
  if (option === "RF") return v.includes(" rf") || v.startsWith("rf") || v.includes("coaxial") || v.includes("antenna");
  return false;
}

function extractTvInches(cached: ReturnType<typeof detailCache.get>, productName?: string): number | null {
  // Helper: try to parse inches out of a raw string value
  const parseInchStr = (s: string): number | null => {
    const inchMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|"|″|′)/i);
    if (inchMatch) return Number(inchMatch[1]);
    const cmMatch = s.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return Math.round(Number(cmMatch[1]) / 2.54);
    return null;
  };

  // 1. Check well-known spec keys first
  const knownKeys = [
    "Screen Size", "screen size", "Display Size", "display size",
    "Screen size", "Diagonal Screen Size", "screenSize", "TV Size",
    "Screen", "display", "Display",
  ];
  for (const key of knownKeys) {
    const raw = cached?.specs[key];
    if (!raw) continue;
    const s = String(raw);
    const result = parseInchStr(s);
    if (result !== null) return result;
    // Last try: leading number (common when value is just "43")
    const leading = parseSpec(raw);
    if (leading !== null && leading >= 20 && leading <= 120) return leading;
  }

  // 2. Scan ALL spec values for anything that looks like an inch/cm TV size
  if (cached?.specs) {
    for (const val of Object.values(cached.specs)) {
      if (!val) continue;
      const result = parseInchStr(String(val));
      if (result !== null && result >= 20 && result <= 120) return result;
    }
  }

  // 3. Variant attributes — check size-related keys, then scan all attributes
  if (cached?.variants?.length) {
    for (const v of cached.variants) {
      const sizeKeys = ["size", "screen_size", "screenSize", "Screen Size", "display_size"];
      for (const key of sizeKeys) {
        const sv = v.attributes[key];
        if (!sv) continue;
        const s = String(sv);
        const result = parseInchStr(s);
        if (result !== null) return result;
        const m = s.match(/^(\d+(?:\.\d+)?)/);
        if (m && Number(m[1]) >= 20 && Number(m[1]) <= 120) return Number(m[1]);
      }
      // Scan all variant attributes
      for (const val of Object.values(v.attributes)) {
        if (!val) continue;
        const result = parseInchStr(String(val));
        if (result !== null && result >= 20 && result <= 120) return result;
      }
    }
  }

  // 4. Product name fallback — e.g. "Samsung 43 Inch TV", 'TCL 55" TV'
  if (productName) {
    const result = parseInchStr(productName);
    if (result !== null) return result;
    const cmMatch = productName.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return Math.round(Number(cmMatch[1]) / 2.54);
  }

  return null;
}

function applyTvFilters(items: ListCard[], tvFilters: Record<string, string[]>): ListCard[] {
  const sizeOpts = tvFilters["screenSize"]   ?? [];
  const resOpts  = tvFilters["resolution"]   ?? [];
  const connOpts = tvFilters["connectivity"] ?? [];

  const hasAny = [sizeOpts, resOpts, connOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);

    // ── Screen Size ───────────────────────────────────────────────────────────
    if (sizeOpts.length > 0) {
      const variants = cached?.variants ?? [];
      if (variants.length > 0) {
        // Product has size variants — include if ANY variant size matches a selected option
        const hasMatch = variants.some((v) => {
          const sv = v.attributes["size"];
          if (!sv) return false;
          const m = String(sv).match(/^(\d+(?:\.\d+)?)/);
          if (!m) return false;
          const vInch = Number(m[1]);
          return vInch >= 20 && vInch <= 120 && sizeOpts.some((opt) => matchTvScreenSize(vInch, opt));
        });
        if (!hasMatch) return false;
      } else {
        // No variants — fall back to spec / name
        const inch = extractTvInches(cached, item.name);
        if (inch === null) return false;
        if (!sizeOpts.some((opt) => matchTvScreenSize(inch, opt))) return false;
      }
    }

    // ── Resolution ────────────────────────────────────────────────────────────
    if (resOpts.length > 0) {
      const raw =
        cached?.specs["Resolution"] ??
        cached?.specs["Display Resolution"] ??
        cached?.specs["resolution"];
      if (!raw) return false;
      if (!resOpts.some((opt) => matchTvResolution(String(raw), opt))) return false;
    }

    // ── Connectivity ─────────────────────────────────────────────────────────
    if (connOpts.length > 0) {
      const raw =
        cached?.specs["Connectivity Technology"] ??
        cached?.specs["Connectivity"] ??
        cached?.specs["connectivity"];
      if (!raw) return false;
      if (!connOpts.some((opt) => matchTvConnectivity(String(raw), opt))) return false;
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

/**
 * Fetches variant details for all products, builds a globally flat list of
 * {product, variant} pairs, sorts them by finalPrice, then renders individual
 * ProductCards. Used when price sort is active so the order is truly global.
 */
function PriceSortedGrid({ products, dir }: { products: ListCard[]; dir: "asc" | "desc" }) {
  type FlatItem = { product: ListCard; variant: Variant | null };
  const [flat, setFlat] = useState<FlatItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      products.map(async (p) => {
        const cached = detailCache.get(p.slug);
        if (cached) return { product: p, variants: cached.variants };
        try {
          const d = await catalogApi.getProduct(p.slug);
          detailCache.set(p.slug, { stock: d.stock, variants: d.variants, specs: d.specs ?? {} });
          return { product: p, variants: d.variants };
        } catch {
          return { product: p, variants: [] };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const items: FlatItem[] = [];
      for (const { product, variants } of results) {
        if (variants.length === 0) {
          items.push({ product, variant: null });
        } else if (variants.some((v) => "lensIncluded" in v.attributes)) {
          // Camera: one card per lens type, best representative per group
          const groups = new Map<string, typeof variants>();
          for (const v of variants) {
            const color = String(v.attributes.color ?? "").toLowerCase().trim();
            const key = String(v.attributes.lensIncluded) === "Yes"
              ? `lens:${String(v.attributes.lens ?? "")}`.toLowerCase()
              : color ? `body-only:${color}` : "body-only";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(v);
          }
          for (const group of groups.values()) {
            const best =
              group.find((v) => v.stock > 0 && v.images.length > 0) ??
              group.find((v) => v.stock > 0) ??
              group.find((v) => v.images.length > 0) ??
              group[0];
            items.push({ product, variant: best });
          }
        } else {
          for (const v of variants) items.push({ product, variant: v });
        }
      }
      items.sort((a, b) => {
        const pa = a.variant ? a.variant.pricing.finalPrice : (a.product.lowestVariantPrice ?? a.product.finalPrice);
        const pb = b.variant ? b.variant.pricing.finalPrice : (b.product.lowestVariantPrice ?? b.product.finalPrice);
        return dir === "asc" ? pa - pb : pb - pa;
      });
      setFlat(items);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, dir]);

  // While fetching, fall back to product-level sorted cards
  if (flat.length === 0) {
    return (
      <>
        {products.map((p) => (
          <ProductCardExpander key={p.id} product={p} priceSortDir={dir} />
        ))}
      </>
    );
  }

  return (
    <>
      {flat.map(({ product, variant }, i) =>
        variant ? (
          <ProductCard key={`${product.id}-${variant.id}`} product={product} variantOverride={variant} />
        ) : (
          <ProductCard key={`${product.id}-${i}`} product={product} />
        )
      )}
    </>
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
  // TV-specific filters (shown only when TV category is selected)
  const [tvFilters, setTvFilters] = useState<Record<string, string[]>>({});
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
          reorderCategories(all.slice().sort((a, b) => a.sortOrder - b.sortOrder))
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
    // Reset category-specific filters when changing category
    setPhoneFilters({});
    setTvFilters({});
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

  // Client-side price filter applied at the product level.
  // For variant products we only check the max bound here (using lowestVariantPrice) so
  // that a product with variants spanning multiple price tiers isn't wrongly excluded when
  // only its cheapest variant is below minPrice. ProductCardExpander handles per-variant
  // min/max filtering and hides individual out-of-range variant cards.
  const priceFilteredItems = rawItems.filter((p) => {
    const isPriceActive = minPrice > PRICE_FLOOR || maxPrice < PRICE_CEIL;
    if (!isPriceActive) return true;

    if (p.lowestVariantPrice !== null) {
      // Variant product: include as long as the cheapest variant doesn't exceed maxPrice.
      // ProductCardExpander will filter individual variants against minPrice/maxPrice.
      if (maxPrice < PRICE_CEIL && p.lowestVariantPrice > maxPrice) return false;
      return true;
    }

    // Single-price product: apply both bounds.
    const price = p.finalPrice > 0 ? p.finalPrice : null;
    if (!price) return true; // unknown price — include
    if (minPrice > PRICE_FLOOR && price < minPrice) return false;
    if (maxPrice < PRICE_CEIL && price > maxPrice) return false;
    return true;
  });

  const isPhoneCategory = selectedCategory?.toLowerCase() === "phone";
  const hasPhoneFilters = Object.values(phoneFilters).some((v) => v.length > 0);
  const isTvCategory =
    selectedCategory?.toLowerCase().includes("tv") ||
    selectedCategory?.toLowerCase().includes("television") ||
    false;
  const hasTvFilters = Object.values(tvFilters).some((v) => v.length > 0);
  // Pre-fetch detail for phones only when a spec filter is active (large catalogue).
  // Pre-fetch detail for TVs as soon as the category is selected (small catalogue, needed for size/res/conn filters).
  const needsDetailFetch = (isPhoneCategory && hasPhoneFilters) || isTvCategory;

  // When spec filters are active, pre-fetch detail for items not yet cached.
  useEffect(() => {
    if (!needsDetailFetch || priceFilteredItems.length === 0) return;
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
  }, [needsDetailFetch, priceFilteredItems]);

  // cacheTick read to make React re-render after pre-fetch.
  void cacheTick;
  const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;
  const specFiltered: ListCard[] = isPhoneCategory
    ? applyPhoneFilters(priceFilteredItems, phoneFilters)
    : isTvCategory
    ? applyTvFilters(priceFilteredItems, tvFilters)
    : priceFilteredItems;
  // Re-sort client-side by effective price (lowestVariantPrice ?? finalPrice) so products
  // with basePrice=0 (variant-only pricing) appear in the correct position.
  const items: ListCard[] =
    sortValue === "price-asc" || sortValue === "price-desc"
      ? [...specFiltered].sort((a, b) => {
          const pa = a.lowestVariantPrice ?? a.finalPrice;
          const pb = b.lowestVariantPrice ?? b.finalPrice;
          return sortValue === "price-asc" ? pa - pb : pb - pa;
        })
      : specFiltered;
  const total = data?.total ?? 0;
  const brandFacets: BrandFacet[] = data?.facets.brands ?? [];

  // Build a per-variant filter for TV size so ProductCardExpander shows only matching sizes
  const tvSizeOpts = tvFilters["screenSize"] ?? [];
  const tvVariantFilter = isTvCategory && tvSizeOpts.length > 0
    ? (v: import("@/lib/api").Variant) => {
        const sv = v.attributes["size"];
        if (!sv) return true; // no size attribute — show the card
        const m = String(sv).match(/^(\d+(?:\.\d+)?)/);
        if (!m) return true;
        const inch = Number(m[1]);
        return tvSizeOpts.some((opt) => matchTvScreenSize(inch, opt));
      }
    : undefined;

  const setPhoneFilter = (key: string, values: string[]) => {
    setPhoneFilters((prev) => ({ ...prev, [key]: values }));
  };
  const setTvFilter = (key: string, values: string[]) => {
    setTvFilters((prev) => ({ ...prev, [key]: values }));
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

      {/* TV-specific filters — shown only for TV category */}
      {isTvCategory && TV_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={tvFilters[group.key] ?? []}
          onChange={(vals) => setTvFilter(group.key, vals)}
        />
      ))}

      {/* Rating — always last */}
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

      {/* Clear Filters */}
      {(selectedCategory !== null ||
        selectedBrand !== null ||
        minRating !== null ||
        minPrice !== PRICE_FLOOR ||
        maxPrice !== PRICE_CEIL ||
        hasPhoneFilters ||
        hasTvFilters) && (
        <button
          onClick={() => {
            selectCategory(null);
            setSelectedBrand(null);
            setMinRating(null);
            setMinPrice(PRICE_FLOOR);
            setMaxPrice(PRICE_CEIL);
            setPhoneFilters({});
            setTvFilters({});
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
                  {sortValue === "price-asc" || sortValue === "price-desc" ? (
                    <PriceSortedGrid products={items} dir={sortValue === "price-asc" ? "asc" : "desc"} />
                  ) : (
                    items.map((product) => (
                      <ProductCardExpander
                        key={product.id}
                        product={product}
                        priceMin={minPrice > PRICE_FLOOR ? minPrice : undefined}
                        priceMax={maxPrice < PRICE_CEIL ? maxPrice : undefined}
                        variantFilter={tvVariantFilter}
                      />
                    ))
                  )}
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
