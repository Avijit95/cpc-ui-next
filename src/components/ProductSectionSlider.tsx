"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import ProductCard from "./ProductCard";
import type { ListCard } from "@/lib/api";

type Props = {
  title: string;
  items: ListCard[];
  viewAllHref: string;
};

export default function ProductSectionSlider({ title, items, viewAllHref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const slide = (dir: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    const item = el.querySelector(".slider-item") as HTMLElement | null;
    if (!item) return;
    const step = (item.offsetWidth + 16) * 2; // 2 cards + gap
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-bold text-white bg-[#129cd3] px-4 py-2 uppercase tracking-wide">
            {title}
          </h2>
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => slide("prev")}
              aria-label="Previous products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => slide("next")}
              aria-label="Next products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Desktop Slider (≥768px) */}
        <div
          ref={scrollRef}
          className="product-section-slider hidden md:flex gap-4 overflow-x-auto scroll-smooth"
        >
          {items.map((product) => (
            <div
              key={product.id}
              className="slider-item flex-shrink-0 w-[calc(25%-12px)] lg:w-[calc(20%-12.8px)] xl:w-[calc(16.667%-13.4px)]"
            >
              <ProductCard product={product} />
            </div>
          ))}

          {/* View All card */}
          <div className="slider-item flex-shrink-0 w-[calc(25%-12px)] lg:w-[calc(20%-12.8px)] xl:w-[calc(16.667%-13.4px)]">
            <Link
              href={viewAllHref}
              className="h-full min-h-[200px] flex flex-col items-center justify-center bg-[#e8f7fc] border border-[#8dd4ee] rounded-xl gap-3 hover:bg-[#d0edf8] transition-colors group"
            >
              <div className="w-12 h-12 bg-[#129cd3] rounded-full flex items-center justify-center group-hover:bg-[#0e87b5] transition-colors">
                <ArrowRight size={20} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-[#129cd3]">View All</span>
            </Link>
          </div>
        </div>

        {/* Mobile Grid (<768px): 2 cols below 500px, 3 cols from 500px, max 6 cards */}
        <div className="md:hidden grid grid-cols-2 xs:grid-cols-3 gap-4">
          {items.slice(0, 6).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* Explore More button — mobile only */}
        <div className="md:hidden flex justify-end mt-4">
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-[#106681] flex items-center gap-1 hover:underline transition-colors"
          >
            Explore More <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
