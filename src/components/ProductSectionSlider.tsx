"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import ProductCard, { detailCache } from "./ProductCard";
import { catalogApi } from "@/lib/api";
import type { ListCard, Variant } from "@/lib/api";
import { apiLimiter } from "@/lib/apiLimiter";

type SliderItem = { product: ListCard; variant?: Variant };

type Props = {
  title: string;
  items: ListCard[];
  viewAllHref: string;
};

export default function ProductSectionSlider({ title, items, viewAllHref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Expand products with variants into individual slider items.
  const [sliderItems, setSliderItems] = useState<SliderItem[]>(
    () => items.map((p) => ({ product: p }))
  );

  useEffect(() => {
    let active = true;
    Promise.all(
      items.map((p) => {
        const cached = detailCache.get(p.slug);
        if (cached) {
          return Promise.resolve(cached.variants);
        }
        return apiLimiter(() =>
          catalogApi
            .getProduct(p.slug)
            .then((d) => {
              detailCache.set(p.slug, { stock: d.stock ?? 0, variants: d.variants, specs: d.specs ?? {} });
              return d.variants;
            })
            .catch(() => [] as Variant[])
        );
      })
    ).then((allVariants) => {
      if (!active) return;
      const expanded: SliderItem[] = [];
      items.forEach((p, i) => {
        const variants = allVariants[i];
        if (variants.length === 0) {
          expanded.push({ product: p });
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
            expanded.push({ product: p, variant: best });
          }
        } else {
          variants.forEach((v) => expanded.push({ product: p, variant: v }));
        }
      });
      setSliderItems(expanded.slice(0, 8));
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slide = (dir: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    const item = el.querySelector(".slider-item") as HTMLElement | null;
    if (!item) return;
    const step = (item.offsetWidth + 16) * 2; // 2 cards + gap
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="py-8 px-4 bg-white/20 section-gradient-border">
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
          {sliderItems.map((item) => (
            <div
              key={item.variant ? item.variant.id : item.product.id}
              className="slider-item flex-shrink-0 w-[calc(25%-12px)] lg:w-[calc(20%-12.8px)] xl:w-[calc(16.667%-13.4px)]"
            >
              <ProductCard product={item.product} variantOverride={item.variant} />
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
          {sliderItems.slice(0, 6).map((item) => (
            <ProductCard
              key={item.variant ? item.variant.id : item.product.id}
              product={item.product}
              variantOverride={item.variant}
            />
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
