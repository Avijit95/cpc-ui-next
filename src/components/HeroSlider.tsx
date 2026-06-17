"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Banner } from "@/lib/api";

type Props = {
  slides: Banner[];
};

const SLIDE_INTERVAL_MS = 4500;
const SWIPE_THRESHOLD_PX = 50; // min horizontal drag to switch slide
const DRAG_CLICK_PX = 8; // movement beyond this counts as a drag (suppress link click)

export default function HeroSlider({ slides }: Props) {
  const [current, setCurrent] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [noAnim, setNoAnim] = useState(false); // skip the transition on autoplay wrap
  const slideCount = slides.length;

  const startXRef = useRef(0);
  const dragPxRef = useRef(0);
  const draggedRef = useRef(false);
  const currentRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Autoplay — paused while the user is dragging.
  useEffect(() => {
    if (slideCount <= 1 || dragging) return;
    const timer = setInterval(() => {
      if (currentRef.current + 1 >= slideCount) {
        setNoAnim(true); // wrap last -> first without a long backward sweep
        setCurrent(0);
      } else {
        setCurrent(currentRef.current + 1);
      }
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slideCount, dragging]);

  // Re-enable the transition right after a no-anim wrap reset.
  useEffect(() => {
    if (!noAnim) return;
    const id = requestAnimationFrame(() => setNoAnim(false));
    return () => cancelAnimationFrame(id);
  }, [noAnim]);

  if (slideCount === 0) {
    return <div className="h-full lg:min-h-[370px] xl:min-h-[320px] bg-gray-100" />;
  }

  const startDrag = (e: React.PointerEvent) => {
    if (slideCount <= 1) return;
    startXRef.current = e.clientX;
    dragPxRef.current = 0;
    draggedRef.current = false;
    setDragging(true);
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    dragPxRef.current = dx;
    // Capture only once horizontal intent is clear, so vertical page scroll
    // (touch-action: pan-y) still works for small/vertical movements.
    if (!draggedRef.current && Math.abs(dx) > DRAG_CLICK_PX) {
      draggedRef.current = true;
      trackRef.current?.setPointerCapture(e.pointerId);
    }
    setDragPx(dx);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const dx = dragPxRef.current;
    setDragPx(0);
    dragPxRef.current = 0;
    if (dx <= -SWIPE_THRESHOLD_PX && current < slideCount - 1) {
      setCurrent(current + 1);
    } else if (dx >= SWIPE_THRESHOLD_PX && current > 0) {
      setCurrent(current - 1);
    }
  };

  // Visual offset with a little resistance past the first/last edges.
  let offset = dragPx;
  if (current === 0 && offset > 0) offset *= 0.3;
  if (current === slideCount - 1 && offset < 0) offset *= 0.3;

  return (
    <>
      <div
        ref={trackRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`flex h-full select-none touch-pan-y ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        } ${
          dragging || noAnim
            ? "transition-none"
            : "transition-transform duration-300 ease-out"
        }`}
        style={{ transform: `translateX(calc(${-current * 100}% + ${offset}px))` }}
      >
        {slides.map((slide, i) => {
          const img = (
            <Image
              src={slide.imageUrl}
              alt=""
              fill
              preload={i === 0}
              fetchPriority={i === 0 ? "high" : "auto"}
              sizes="(min-width: 1280px) 832px, (min-width: 1024px) 768px, 100vw"
              draggable={false}
              className="object-contain object-top lg:object-center xl:object-cover pointer-events-none"
            />
          );
          const cellClass =
            "relative w-full flex-shrink-0 h-full lg:min-h-[370px] xl:min-h-[320px] bg-black";
          return slide.linkUrl ? (
            <a
              key={slide.id}
              href={slide.linkUrl}
              aria-label={`Slide ${i + 1}`}
              draggable={false}
              onClick={(e) => {
                if (draggedRef.current) e.preventDefault();
              }}
              className={cellClass}
            >
              {img}
            </a>
          ) : (
            <div key={slide.id} className={cellClass}>
              {img}
            </div>
          );
        })}
      </div>

      {slideCount > 1 && (
        <div className="absolute bottom-[5px] lg:bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-full px-2 py-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="p-1 flex items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  i === current ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
