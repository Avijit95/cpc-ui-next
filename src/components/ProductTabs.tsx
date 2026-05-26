"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard, { ProductCardSkeleton } from "./ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type { CatalogSort, ListCard } from "@/lib/api";

type Tab = { label: string; sort: CatalogSort };

const TABS: Tab[] = [
  { label: "BESTSELLING", sort: "popular" },
  { label: "NEW ARRIVALS", sort: "newest" },
];

const ITEM_LIMIT = 8;

type Props = {
  title: string;
  initialItems: ListCard[];
};

export default function ProductTabs({ title, initialItems }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [itemsByIndex, setItemsByIndex] = useState<Record<number, ListCard[]>>({
    0: initialItems,
  });
  const [error, setError] = useState<string | null>(null);

  const cached = itemsByIndex[activeIndex];
  const isLoading = cached === undefined && error === null;

  useEffect(() => {
    if (cached !== undefined) return;
    const ac = new AbortController();
    catalogApi
      .listProducts(
        { sort: TABS[activeIndex]!.sort, limit: ITEM_LIMIT },
        ac.signal,
      )
      .then((resp) => {
        if (ac.signal.aborted) return;
        setItemsByIndex((prev) => ({ ...prev, [activeIndex]: resp.items }));
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(
          isApiError(err) ? err.displayMessage : "Failed to load products",
        );
      });
    return () => ac.abort();
  }, [activeIndex, cached]);

  const items = cached ?? [];

  const handleTabClick = (i: number) => {
    setActiveIndex(i);
    setError(null);
  };

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-bold text-white bg-[#129cd3] px-4 py-2 uppercase tracking-wide">
            {title}
          </h2>
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => handleTabClick(i)}
                className={`text-xs font-medium px-3 py-1.5 border transition-colors whitespace-nowrap ${
                  activeIndex === i
                    ? "border-[#129cd3] text-[#129cd3] bg-[#e8f7fc]"
                    : "border-gray-200 text-gray-500 hover:border-[#8dd4ee] hover:text-[#129cd3]"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              aria-label="Previous products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors ml-2"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              aria-label="Next products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Grid */}
        {error ? (
          <div className="text-center py-10 text-sm text-gray-500">{error}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {isLoading
              ? [...Array(ITEM_LIMIT)].map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))
              : items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
          </div>
        )}
      </div>
    </section>
  );
}
