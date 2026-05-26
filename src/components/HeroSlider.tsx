"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Banner } from "@/lib/api";

type Props = {
  slides: Banner[];
};

const SLIDE_INTERVAL_MS = 4500;

export default function HeroSlider({ slides }: Props) {
  const [current, setCurrent] = useState(0);
  const slideCount = slides.length;

  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slideCount);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slideCount]);

  if (slideCount === 0) {
    return <div className="h-full min-h-[320px] bg-gray-100" />;
  }

  const clampedIndex = current % slideCount;

  return (
    <>
      {slides.map((slide, i) => {
        const isActive = i === clampedIndex;
        const inner = (
          <div
            className={`absolute inset-0 h-full min-h-[320px] ${
              isActive ? "block" : "hidden"
            }`}
          >
            <Image
              src={slide.imageUrl}
              alt=""
              fill
              priority={i === 0}
              sizes="(min-width: 1280px) 832px, (min-width: 1024px) 768px, 100vw"
              className="object-cover object-center"
            />
          </div>
        );
        if (slide.linkUrl) {
          return (
            <a
              key={slide.id}
              href={slide.linkUrl}
              aria-label={`Slide ${i + 1}`}
              className={isActive ? "block" : "hidden"}
            >
              {inner}
            </a>
          );
        }
        return <div key={slide.id}>{inner}</div>;
      })}

      {slideCount > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="p-1.5 flex items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  i === clampedIndex ? "w-8 h-3 bg-white" : "w-3 h-3 bg-white/40"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
