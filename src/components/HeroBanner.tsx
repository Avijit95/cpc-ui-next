"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { heroSlides } from "@/data/products";
import { bannersApi } from "@/lib/api";
import type { Banner } from "@/lib/api";

const sidebarCategories = [
  { icon: "📱", name: "Phone" },
  { icon: "📷", name: "Camera" },
  { icon: "🔊", name: "Speakers" },
  { icon: "📺", name: "TV" },
  { icon: "🔌", name: "Accessories" },
];

const fallbackRightBanners = [
  { id: "fallback-1", imageUrl: "/1.webp", linkUrl: null as string | null },
  { id: "fallback-2", imageUrl: "/2.webp", linkUrl: null as string | null },
];

const HOME_HERO_SLOT = "home_hero";
const HOME_SIDE_SLOT = "home_side";

export default function HeroBanner() {
  const [apiBanners, setApiBanners] = useState<Banner[] | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    bannersApi
      .getActive()
      .then((items) => {
        if (!cancelled) setApiBanners(items);
      })
      .catch(() => {
        if (!cancelled) setApiBanners([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const apiHero = useMemo(
    () =>
      (apiBanners ?? [])
        .filter((b) => b.position === HOME_HERO_SLOT)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [apiBanners],
  );

  const apiSide = useMemo(
    () =>
      (apiBanners ?? [])
        .filter((b) => b.position === HOME_SIDE_SLOT)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [apiBanners],
  );

  const useApiHero = apiHero.length > 0;
  const slideCount = useApiHero ? apiHero.length : heroSlides.length;

  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slideCount);
    }, 4500);
    return () => clearInterval(timer);
  }, [slideCount]);

  // Clamp the index inline so it survives a slide-count change without
  // a synchronous setState-in-effect (React 19's lint rule).
  const clampedIndex = slideCount > 0 ? current % slideCount : 0;
  const staticSlide = heroSlides[clampedIndex % heroSlides.length];
  const apiSlide = useApiHero ? apiHero[clampedIndex % apiHero.length] : null;

  // The side panel uses API banners when present, otherwise the static fallback.
  const sideBanners = apiSide.length > 0 ? apiSide : fallbackRightBanners;

  return (
    <section className="bg-gray-100">
      <div className="max-w-7xl mx-auto flex">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-52 flex-shrink-0 bg-white shadow-sm">
          <div className="bg-[#129cd3] text-white px-4 py-3 flex items-center gap-2 font-semibold text-sm cursor-pointer">
            <span className="text-lg leading-none">☰</span> ALL CATEGORIES
          </div>
          <ul>
            {sidebarCategories.map((cat, i) => (
              <li key={i}>
                <a
                  href={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:text-[#129cd3] hover:bg-[#e8f7fc] border-b border-gray-100 transition-colors"
                >
                  <span className="text-base w-5 text-center">{cat.icon}</span>
                  {cat.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Center Slider */}
        <div
          className="flex-1 overflow-hidden relative"
          style={{ minHeight: "320px" }}
        >
          {apiSlide ? (
            // ── API-driven slide: image + optional click target, no text overlay ──
            <ApiSlide banner={apiSlide} />
          ) : (
            // ── Static fallback when no API banners are configured ──
            <div
              className="h-full min-h-[320px] transition-all duration-700 bg-cover bg-center relative"
              style={{ backgroundImage: `url(${staticSlide.image})` }}
            >
              <div className="relative z-10 flex flex-col justify-center h-full min-h-[320px] px-8 py-10 text-center md:text-left">
                <span className="inline-block bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded mb-3 uppercase tracking-wider w-fit mx-auto md:mx-0">
                  {staticSlide.badge}
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
                  {staticSlide.title}
                </h2>
                <p className="text-gray-200 text-sm mb-1">{staticSlide.subtitle}</p>
                <p className="text-yellow-300 font-bold text-base mb-5">
                  {staticSlide.discount}
                </p>
                <div>
                  <Link
                    href="/products"
                    className="inline-block text-white font-semibold text-sm hover:underline transition-colors"
                  >
                    ➤ SEE MORE
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Dots */}
          {slideCount > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
              {Array.from({ length: slideCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === clampedIndex ? "w-8 h-3 bg-white" : "w-3 h-3 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Banners */}
        <div className="hidden xl:flex flex-col w-48 flex-shrink-0 border-l border-gray-200">
          {sideBanners.map((banner) => {
            const href = banner.linkUrl ?? "#";
            return (
              <a
                key={banner.id}
                href={href}
                className="flex-1 relative overflow-hidden border-b border-gray-200 block hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl}
                  alt=""
                  className="w-full h-full object-cover absolute inset-0"
                />
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ApiSlide({ banner }: { banner: Banner }) {
  const inner = (
    <div
      className="h-full min-h-[320px] bg-cover bg-center"
      style={{ backgroundImage: `url(${banner.imageUrl})` }}
    />
  );
  if (banner.linkUrl) {
    return (
      <a href={banner.linkUrl} className="block h-full min-h-[320px]">
        {inner}
      </a>
    );
  }
  return inner;
}
