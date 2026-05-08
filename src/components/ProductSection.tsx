"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard, { ProductCardSkeleton } from "./ProductCard";
import { catalogApi, isApiError } from "@/lib/api";
import type { CatalogSort, ListCard } from "@/lib/api";

type Tab = { label: string; sort: CatalogSort };

const tabs: Tab[] = [
  { label: "BESTSELLING", sort: "popular" },
  { label: "NEW ARRIVALS", sort: "newest" },
];

type SectionProps = {
  title: string;
  subtitle?: string;
  filter?: "new" | "bestseller" | "all";
  showTabs?: boolean;
};

const ITEM_LIMIT = 8;

function sortFromFilter(filter: SectionProps["filter"]): CatalogSort | undefined {
  if (filter === "new") return "newest";
  if (filter === "bestseller") return "popular";
  return undefined;
}

export default function ProductSection({
  title,
  filter = "all",
  showTabs = false,
}: SectionProps) {
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]!);
  const [items, setItems] = useState<ListCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sort = showTabs ? activeTab.sort : sortFromFilter(filter);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    catalogApi
      .listProducts({ sort, limit: ITEM_LIMIT }, ac.signal)
      .then((resp) => setItems(resp.items))
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
  }, [sort]);

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-bold text-white bg-[#129cd3] px-4 py-2 uppercase tracking-wide">
            {title}
          </h2>
          <div className="flex items-center gap-1 flex-wrap">
            {showTabs &&
              tabs.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-medium px-3 py-1.5 border transition-colors whitespace-nowrap ${
                    activeTab.label === tab.label
                      ? "border-[#129cd3] text-[#129cd3] bg-[#e8f7fc]"
                      : "border-gray-200 text-gray-500 hover:border-[#8dd4ee] hover:text-[#129cd3]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            <button className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors ml-2">
              <ChevronLeft size={12} />
            </button>
            <button className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Grid */}
        {error ? (
          <div className="text-center py-10 text-sm text-gray-500">{error}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {loading
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
