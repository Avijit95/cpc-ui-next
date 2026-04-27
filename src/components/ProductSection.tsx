"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { products } from "@/data/products";

const tabs = ["BESTSELLING", "FEATURED", "NEW ARRIVALS", "TOP BRANDS"] as const;

type SectionProps = {
  title: string;
  subtitle?: string;
  filter?: "new" | "bestseller" | "all";
  showTabs?: boolean;
};

export default function ProductSection({ title, filter = "all", showTabs = false }: SectionProps) {
  const [activeTab, setActiveTab] = useState<string>("BESTSELLING");

  const filtered = products.filter((p) => {
    const typeMatch =
      filter === "new" ? p.isNew :
      filter === "bestseller" ? p.isBestSeller :
      true;
    return typeMatch;
  });

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
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-medium px-3 py-1.5 border transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? "border-[#129cd3] text-[#129cd3] bg-[#e8f7fc]"
                      : "border-gray-200 text-gray-500 hover:border-[#8dd4ee] hover:text-[#129cd3]"
                  }`}
                >
                  {tab}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
          {filtered.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
