"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { products } from "@/data/products";
import { dealsApi } from "@/lib/api";
import type { Deal } from "@/lib/api";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function Countdown({ endsAt }: { endsAt: string }) {
  const target = new Date(endsAt).getTime();
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, target - Date.now()),
  );
  useEffect(() => {
    const t = setInterval(() => {
      setRemainingMs(Math.max(0, target - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [target]);
  const time = {
    h: Math.floor(remainingMs / 3600000),
    m: Math.floor((remainingMs % 3600000) / 60000),
    s: Math.floor((remainingMs % 60000) / 1000),
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center gap-1">
      {[pad(time.h), pad(time.m), pad(time.s)].map((v, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span className="bg-[#129cd3] text-white text-xs font-bold w-8 h-8 rounded flex items-center justify-center tabular-nums">
            {v}
          </span>
          {i < 2 && <span className="text-[#129cd3] font-bold text-sm">:</span>}
        </span>
      ))}
    </div>
  );
}

const bestSellers = products.filter((p) => p.isBestSeller).slice(0, 4);

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          size={11}
          className={
            i < Math.floor(rating)
              ? "text-yellow-400 fill-yellow-400"
              : "text-gray-300 fill-gray-300"
          }
        />
      ))}
    </div>
  );
}

export default function DealsSection() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dealIdx, setDealIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    dealsApi
      .getToday()
      .then((r) => {
        if (!cancelled) setDeals(r);
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick once per second so the live list re-filters when a deal endsAt passes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const liveDeals = deals
    .filter((d) => new Date(d.endsAt).getTime() > now)
    .slice(0, 4);

  // Hide the entire section until the first fetch resolves AND deals exist.
  if (!loaded || liveDeals.length === 0) return null;

  const safeIdx = liveDeals.length > 0 ? dealIdx % liveDeals.length : 0;
  const deal = liveDeals[safeIdx];
  if (!deal) return null;

  return (
    <section className="py-8 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Today Deals */}
        <div className="md:col-span-2 border border-gray-200 p-4 bg-white shadow-sm">
          <div className="bg-white relative">
            {/* Ribbon Label */}
            <div className="absolute -top-1 left-0 z-10">
              <div
                className="bg-[#129cd3] text-white text-xs font-bold px-5 py-2.5 uppercase tracking-wide"
                style={{ clipPath: "polygon(0 0, 100% 0, 92% 50%, 100% 100%, 0 100%)" }}
              >
                TODAY DEALS
              </div>
              <div
                className="absolute top-full left-0 w-2 h-2 bg-[#0b6b93]"
                style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
            </div>

            {/* Countdown top-right */}
            <div className="absolute top-3 right-3 z-10">
              <Countdown endsAt={deal.endsAt} />
            </div>

            <div className="p-5 pt-14 flex items-center gap-3 relative">
              {/* Prev Arrow */}
              <button
                onClick={() =>
                  setDealIdx(
                    (i) => (i - 1 + liveDeals.length) % liveDeals.length,
                  )
                }
                className="flex-shrink-0 w-8 h-12 bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 flex items-center justify-center transition-colors"
                aria-label="Previous deal"
              >
                <ChevronLeft size={18} />
              </button>

              {/* Product Image */}
              <Link
                href={`/products/${deal.product.slug}`}
                className="relative flex-shrink-0"
              >
                {deal.product.primaryImageUrl ? (
                  <Image
                    src={deal.product.primaryImageUrl}
                    alt={deal.product.name}
                    width={160}
                    height={160}
                    className="w-40 h-40 object-contain"
                  />
                ) : (
                  <div className="w-40 h-40 bg-gray-100" />
                )}
                <span className="absolute top-1 right-1 bg-[#129cd3] text-white text-xs font-bold w-11 h-11 rounded-full flex items-center justify-center">
                  -{deal.percentOff}%
                </span>
              </Link>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/products/${deal.product.slug}`}
                  className="block"
                >
                  <h3 className="text-sm font-semibold text-gray-800 mb-1.5 line-clamp-1 hover:text-[#129cd3] transition-colors">
                    {deal.product.name}
                  </h3>
                </Link>
                <hr className="my-2.5 border-gray-100" />
                <p className="text-xs text-gray-500 mb-3 line-clamp-3">
                  Limited time offer — grab it before the deal ends.
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-[#129cd3]">
                    {formatPrice(deal.dealPrice)}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    {formatPrice(deal.basePrice)}
                  </span>
                </div>
              </div>

              {/* Next Arrow */}
              <button
                onClick={() => setDealIdx((i) => (i + 1) % liveDeals.length)}
                className="flex-shrink-0 w-8 h-12 bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 flex items-center justify-center transition-colors"
                aria-label="Next deal"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Thumbnail Strip */}
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {liveDeals.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setDealIdx(i)}
                className={`relative flex-shrink-0 w-28 bg-white p-2 transition-colors ${
                  i === safeIdx
                    ? "border-2 border-[#129cd3]"
                    : "border border-gray-200 hover:border-[#8dd4ee]"
                }`}
              >
                <div className="relative w-full h-16">
                  {d.product.primaryImageUrl ? (
                    <Image
                      src={d.product.primaryImageUrl}
                      alt={d.product.name}
                      fill
                      sizes="112px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                  <span className="absolute top-0 right-0 bg-[#129cd3] text-white text-[10px] font-bold w-7 h-7 rounded-full flex items-center justify-center">
                    -{d.percentOff}%
                  </span>
                </div>
                <p className="text-[11px] text-gray-700 truncate mt-1 text-center">
                  {d.product.name}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Best Sellers */}
        <div className="bg-white border border-gray-100 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-xs font-bold text-white bg-[#129cd3] px-3 py-1.5 uppercase tracking-wide">
              BEST SELLERS
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Previous best sellers"
                className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                aria-label="Next best sellers"
                className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {bestSellers.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[#e8f7fc] transition-colors cursor-pointer"
              >
                <Image
                  src={product.image}
                  alt={product.name}
                  width={64}
                  height={64}
                  className="w-16 h-16 object-cover rounded flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1 hover:text-[#129cd3] transition-colors">
                    {product.name}
                  </h3>
                  <StarRating rating={product.rating} />
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-sm font-bold text-[#129cd3]">{formatPrice(product.price)}</span>
                    {product.originalPrice && (
                      <span className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
