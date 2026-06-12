"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { ProductCardSkeleton } from "@/components/ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type {
  BrandFacet,
  CatalogSort,
  CategoryNode,
  ListCard,
  ProductListResponse,
} from "@/lib/api";
import { SlidersHorizontal, ChevronDown, Star } from "lucide-react";

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
  };

  useEffect(() => {
    const ac = new AbortController();
    const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;

    catalogApi
      .listProducts(
        {
          category: selectedCategory ?? undefined,
          brand: selectedBrand ?? undefined,
          priceMin: minPrice > PRICE_FLOOR ? minPrice : undefined,
          priceMax: maxPrice < PRICE_CEIL ? maxPrice : undefined,
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

  const items: ListCard[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const brandFacets: BrandFacet[] = data?.facets.brands ?? [];

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

      {/* Price Range */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Price Range
        </h3>

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
      </div>

      {/* Brands */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Brand
        </h3>
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
      </div>

      {/* Rating */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Rating
        </h3>
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
      </div>

      {/* Clear Filters */}
      {(selectedCategory !== null ||
        selectedBrand !== null ||
        minRating !== null ||
        minPrice !== PRICE_FLOOR ||
        maxPrice !== PRICE_CEIL) && (
        <button
          onClick={() => {
            selectCategory(null);
            setSelectedBrand(null);
            setMinRating(null);
            setMinPrice(PRICE_FLOOR);
            setMaxPrice(PRICE_CEIL);
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
              <div className="bg-white border border-gray-200 rounded-lg p-5 sticky top-24">
                {filterSidebar}
              </div>
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="lg:hidden fixed inset-0 z-[60] flex">
                <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
                <div className="relative bg-white w-72 h-full overflow-y-auto p-5 z-50">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-gray-800">Filters</h2>
                    <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-gray-800">✕</button>
                  </div>
                  {filterSidebar}
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
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} />
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
