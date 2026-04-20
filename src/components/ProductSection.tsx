"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { products } from "@/data/products";

const tabs = ["All", "Smartphones", "Cameras", "Speakers", "Earphones"] as const;

type SectionProps = {
  title: string;
  subtitle?: string;
  filter?: "new" | "bestseller" | "all";
  showTabs?: boolean;
};

export default function ProductSection({ title, subtitle, filter = "all", showTabs = false }: SectionProps) {
  const [activeTab, setActiveTab] = useState<string>("All");

  const filtered = products.filter((p) => {
    const tabMatch = activeTab === "All" || p.category === activeTab;
    const typeMatch =
      filter === "new" ? p.isNew :
      filter === "bestseller" ? p.isBestSeller :
      true;
    return tabMatch && typeMatch;
  });

  return (
    <section className="py-10 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
          </div>
          {showTabs && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                    activeTab === tab
                      ? "bg-white text-blue-600 shadow"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
          <a href="#" className="hidden sm:flex items-center gap-1 text-blue-600 text-sm font-medium hover:gap-2 transition-all whitespace-nowrap">
            View All <ArrowRight size={16} />
          </a>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filtered.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-6 text-center sm:hidden">
          <a href="#" className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium">
            View All <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
