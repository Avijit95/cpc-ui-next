"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { heroSlides } from "@/data/products";

const sidebarCategories = [
  { icon: "📱", name: "Phone" },
  { icon: "📷", name: "Camera" },
  { icon: "🔊", name: "Speakers" },
  { icon: "📺", name: "TV" },
  { icon: "🔌", name: "Accessories" },
];

const rightBanners = [
  { id: 1, image: "/1.webp" },
  { id: 2, image: "/2.webp" },
];

export default function HeroBanner() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const slide = heroSlides[current];

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
        <div className="flex-1 overflow-hidden relative" style={{ minHeight: "320px" }}>
          <div
            className="h-full min-h-[320px] transition-all duration-700 bg-cover bg-center relative"
            style={{ backgroundImage: `url(${slide.image})` }}
          >
            <div className="relative z-10 flex flex-col justify-center h-full min-h-[320px] px-8 py-10 text-center md:text-left">
              <span className="inline-block bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded mb-3 uppercase tracking-wider w-fit mx-auto md:mx-0">
                {slide.badge}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
                {slide.title}
              </h2>
              <p className="text-gray-200 text-sm mb-1">{slide.subtitle}</p>
              <p className="text-yellow-300 font-bold text-base mb-5">{slide.discount}</p>
              <div>
                <Link
                  href="/products"
                  className="inline-block text-white font-semibold text-sm hover:underline transition-colors"
                >
                  ➤ SEE MORE
                </Link>
              </div>
            </div>

            {/* Dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {heroSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === current
                      ? "w-8 h-3 bg-white"
                      : "w-3 h-3 bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Banners */}
        <div className="hidden xl:flex flex-col w-48 flex-shrink-0 border-l border-gray-200">
          {rightBanners.map((banner) => (
            <a
              key={banner.id}
              href="#"
              className="flex-1 relative overflow-hidden border-b border-gray-200 block hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner.image}
                alt=""
                className="w-full h-full object-cover absolute inset-0"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
