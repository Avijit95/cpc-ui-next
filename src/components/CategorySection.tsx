"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { catalogApi } from "@/lib/api";
import type { CategoryNode } from "@/lib/api";

const ITEM_LIMIT = 5;

export default function CategorySection() {
  const [items, setItems] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    catalogApi
      .getCategories(ac.signal)
      .then((all) => {
        if (ac.signal.aborted) return;
        const featured = all
          .filter((c) => c.imageUrl)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .slice(0, ITEM_LIMIT);
        setItems(featured);
        setError(false);
      })
      .catch(() => {
        if (!ac.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, []);

  if (!loading && (error || items.length === 0)) return null;

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-l-4 border-[#129cd3] pl-3">
            FEATURED CATEGORIES
          </h2>
          <div className="flex gap-1.5">
            <button className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors">
              <ChevronLeft size={13} />
            </button>
            <button className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {loading
            ? Array.from({ length: ITEM_LIMIT }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-full aspect-square bg-gray-100 border border-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                </div>
              ))
            : items.map((cat) => (
                <a
                  key={cat.id}
                  href={`/products?category=${encodeURIComponent(cat.slug.toLowerCase())}`}
                  className="group flex flex-col items-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <div className="w-full aspect-square overflow-hidden border border-gray-100 group-hover:border-[#8dd4ee] transition-colors rounded">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cat.imageUrl ?? ""}
                      alt={cat.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <p className="text-xs font-semibold text-gray-700 group-hover:text-[#129cd3] transition-colors text-center">
                    {cat.name}
                  </p>
                </a>
              ))}
        </div>
      </div>
    </section>
  );
}
