"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
};

export default function CategorySlider({ items }: { items: Category[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const slide = (dir: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "next" ? el.offsetWidth : -el.offsetWidth, behavior: "smooth" });
  };

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-l-4 border-[#129cd3] pl-3">
            FEATURED CATEGORIES
          </h2>
          <div className="flex gap-1.5">
            <button
              onClick={() => slide("prev")}
              aria-label="Previous categories"
              className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => slide("next")}
              aria-label="Next categories"
              className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="category-slider flex gap-4 overflow-x-auto scroll-smooth"
        >
          {items.map((cat) => (
            <Link
              key={cat.id}
              href={`/products?category=${encodeURIComponent(cat.slug.toLowerCase())}`}
              className="group flex-shrink-0 w-[calc(50%-8px)] sm:w-[calc(33.333%-11px)] lg:w-[calc(20%-13px)] flex flex-col items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <div className="relative w-full aspect-square overflow-hidden border border-gray-100 group-hover:border-[#8dd4ee] transition-colors rounded max-[1023px]:max-h-[260px] max-[639px]:max-h-[230px]">
                <Image
                  src={cat.imageUrl}
                  alt={cat.name}
                  fill
                  sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <p className="text-xs font-semibold text-gray-700 group-hover:text-[#129cd3] transition-colors text-center">
                {cat.name}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
