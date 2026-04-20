"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag, Star } from "lucide-react";
import { heroSlides } from "@/data/products";

export default function HeroBanner() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const prev = () => setCurrent((c) => (c - 1 + heroSlides.length) % heroSlides.length);
  const next = () => setCurrent((c) => (c + 1) % heroSlides.length);

  const slide = heroSlides[current];

  return (
    <section className="relative overflow-hidden">
      <div className={`bg-gradient-to-r ${slide.bgColor} transition-all duration-700`}>
        <div className="max-w-7xl mx-auto px-4 py-10 md:py-16 flex flex-col md:flex-row items-center gap-8">
          {/* Text */}
          <div className="flex-1 text-center md:text-left">
            <span className="inline-block bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">
              {slide.badge}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight mb-3">
              {slide.title}
            </h1>
            <p className="text-gray-300 text-base md:text-lg mb-2">{slide.subtitle}</p>
            <p className="text-yellow-300 font-semibold text-lg mb-6">{slide.discount}</p>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold px-6 py-3 rounded-full transition-all shadow-lg hover:shadow-blue-500/40"
              >
                <ShoppingBag size={18} />
                {slide.cta}
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 border border-white/40 text-white font-medium px-6 py-3 rounded-full hover:bg-white/10 transition-all"
              >
                View All
              </a>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex justify-center">
            <div className="relative">
              <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-3 -right-3 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-1">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-bold text-gray-800">4.8</span>
                <span className="text-xs text-gray-500">(2.3k)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Arrows */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
      >
        <ChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {heroSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === current ? "bg-white w-6" : "bg-white/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
