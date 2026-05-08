"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { ProductCardSkeleton } from "@/components/ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type {
  BrandFacet,
  CatalogSort,
  ListCard,
  ProductListResponse,
} from "@/lib/api";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

const categoryOptions = [
  "Smartphones",
  "Cameras",
  "Speakers",
  "Smartwatches",
  "Earphones",
  "Accessories",
];

type SortOption = {
  label: string;
  value: CatalogSort | undefined;
};

const sortOptions: SortOption[] = [
  { label: "Featured", value: undefined },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Newest", value: "newest" },
];

const PAGE_LIMIT = 24;

export default function ProductsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState(200000);
  const [sortLabel, setSortLabel] = useState<string>("Featured");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;

    setLoading(true);
    setError(null);

    catalogApi
      .listProducts(
        {
          category: selectedCategory ?? undefined,
          brand: selectedBrand ?? undefined,
          priceMax: priceRange < 200000 ? priceRange : undefined,
          sort: sortValue,
          limit: PAGE_LIMIT,
        },
        ac.signal,
      )
      .then((resp) => setData(resp))
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
  }, [selectedCategory, selectedBrand, priceRange, sortLabel]);

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
          {categoryOptions.map((cat) => (
            <label key={cat} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name="category"
                checked={selectedCategory === cat}
                onChange={() =>
                  setSelectedCategory(selectedCategory === cat ? null : cat)
                }
                className="w-4 h-4 accent-[#129cd3] cursor-pointer"
              />
              <span className="text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                {cat}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Price Range
        </h3>
        <input
          type="range"
          min={5000}
          max={200000}
          step={1000}
          value={priceRange}
          onChange={(e) => setPriceRange(Number(e.target.value))}
          className="w-full accent-[#129cd3]"
        />
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
          <span>₹5,000</span>
          <span className="font-semibold text-[#129cd3]">
            Up to ₹{priceRange.toLocaleString("en-IN")}
          </span>
          <span>₹2,00,000</span>
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

      {/* Clear Filters */}
      {(selectedCategory !== null || selectedBrand !== null) && (
        <button
          onClick={() => {
            setSelectedCategory(null);
            setSelectedBrand(null);
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
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden flex items-center gap-2 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded hover:border-[#129cd3] hover:text-[#129cd3] transition-colors"
              >
                <SlidersHorizontal size={15} /> Filters
              </button>
              <p className="text-sm text-gray-600">
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
            <div className="flex items-center gap-2">
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
              <div className="lg:hidden fixed inset-0 z-40 flex">
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
