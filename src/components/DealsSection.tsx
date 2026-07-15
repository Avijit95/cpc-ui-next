"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import ProductSectionSlider from "./ProductSectionSlider";
import { adminApi, catalogApi, dealsApi } from "@/lib/api";
import type { Deal, ListCard, ProductDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

const S3_BASE = "https://cpn-uploads.s3.ap-south-1.amazonaws.com";

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

function dealImageUrl(
  dealDetails: Record<string, import("@/lib/api").ProductDetail>,
  slug: string,
  variantId?: string | null,
  variantPrimaryUrl?: string | null,
): string | null {
  // 1. Use the variant's primaryImageUrl if the deal targets a specific variant
  if (variantPrimaryUrl) return variantPrimaryUrl;

  const detail = dealDetails[slug];
  if (!detail) return null;

  // 2. Find the specific variant's images in the fetched detail
  if (variantId) {
    const v = detail.variants.find((v) => v.id === variantId);
    if (v && v.images.length > 0) {
      const img = v.images[0];
      return img.url || `${S3_BASE}/${img.objectKey}`;
    }
  }

  // 3. Product-level image
  if (detail.images.length > 0) {
    const img = detail.images[0];
    return img.url || `${S3_BASE}/${img.objectKey}`;
  }
  // 4. Fall back to first variant image
  for (const v of detail.variants) {
    if (v.images.length > 0) {
      const img = v.images[0];
      return img.url || `${S3_BASE}/${img.objectKey}`;
    }
  }
  return null;
}

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

function BestSellerRow({ product, imageUrl }: { product: ListCard; imageUrl: string | null }) {
  const showOriginal = product.finalPrice !== product.basePrice;
  const src = imageUrl ?? product.primaryImageUrl;
  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[#e8f7fc] transition-colors"
    >
      {src ? (
        <Image
          src={src}
          alt={product.name}
          width={64}
          height={64}
          className="w-16 h-16 object-contain rounded flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1 hover:text-[#129cd3] transition-colors">
          {product.name}
        </h3>
        <StarRating rating={product.ratingAverage ?? 0} />
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-sm font-bold text-[#129cd3]">
            {formatPrice(product.finalPrice)}
          </span>
          {showOriginal && (
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(product.basePrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DealsSection() {
  const { status: authStatus } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [bestSellers, setBestSellers] = useState<ListCard[]>([]);
  const [dealDetails, setDealDetails] = useState<Record<string, ProductDetail>>({});
  const [loaded, setLoaded] = useState(false);
  const [dealIdx, setDealIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const THUMB_VISIBLE = 4;
  const SWIPE_THRESHOLD = 50;
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    // Wait for auth to resolve before deciding which API to use.
    if (authStatus === "loading") return;

    let cancelled = false;
    // Authenticated users (admins) use the admin API which returns ALL live deals
    // without deduplication by productId. Anonymous users fall back to the public
    // endpoint which only returns one deal per product.
    const fetchDeals: Promise<Deal[]> =
      authStatus === "authenticated"
        ? adminApi.listDeals({ status: "live", limit: 50 }).then((r) => r.items)
        : dealsApi.getToday();

    Promise.allSettled([
      fetchDeals,
      catalogApi.listProducts({ isBestSeller: true, limit: 8 }),
    ])
      .then(([dealsRes, bestRes]) => {
        if (cancelled) return;
        const livDeals = dealsRes.status === "fulfilled" ? dealsRes.value : [];
        setDeals(livDeals);
        setBestSellers(
          bestRes.status === "fulfilled" ? bestRes.value.items : [],
        );
        // Fetch product details for all deal + best-seller products (images, specs).
        const bestSlugs = bestRes.status === "fulfilled"
          ? bestRes.value.items.map((p) => p.slug)
          : [];
        const slugs = [...new Set([
          ...livDeals.map((d) => d.product.slug),
          ...bestSlugs,
        ])];
        Promise.allSettled(slugs.map((s) => catalogApi.getProduct(s))).then(
          (results) => {
            if (cancelled) return;
            const map: Record<string, ProductDetail> = {};
            results.forEach((r, i) => {
              if (r.status === "fulfilled") map[slugs[i]] = r.value;
            });
            setDealDetails(map);
          }
        );
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  // Tick once per second so the live list re-filters when a deal endsAt passes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const liveDeals = deals.filter((d) => new Date(d.endsAt).getTime() > now);
  const safeIdx = liveDeals.length > 0 ? dealIdx % liveDeals.length : 0;

  if (!loaded) return null;

  const hasDeals = liveDeals.length > 0;

  if (!hasDeals && bestSellers.length === 0) return null;

  if (!hasDeals) {
    return (
      <ProductSectionSlider
        title="Best Sellers"
        items={bestSellers}
        viewAllHref="/products?sort=popular"
      />
    );
  }

  const deal = liveDeals[safeIdx];
  if (!deal) return null;

  // Derive thumbStart so the selected deal is always centred in the strip.
  const thumbStart = Math.max(
    0,
    Math.min(Math.max(0, liveDeals.length - THUMB_VISIBLE), safeIdx - Math.floor(THUMB_VISIBLE / 2)),
  );

  const prevDeal = () => setDealIdx((i) => (i - 1 + liveDeals.length) % liveDeals.length);
  const nextDeal = () => setDealIdx((i) => (i + 1) % liveDeals.length);

  const onDragStart = (clientX: number) => {
    dragStartX.current = clientX;
    isDragging.current = false;
  };
  const onDragMove = (clientX: number) => {
    if (dragStartX.current !== null && Math.abs(clientX - dragStartX.current) > 5) {
      isDragging.current = true;
    }
  };
  const onDragEnd = (clientX: number) => {
    if (dragStartX.current === null) return;
    const delta = clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) {
      if (delta < 0) nextDeal(); else prevDeal();
    }
  };

  return (
    <section className="py-8 px-[10px] xs:px-4 bg-white/20">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3" style={{ gap: "clamp(7px, 1.1vw, 20px)" }}>
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

            <div
              className="pt-14 xs:p-5 xs:pt-14 flex flex-col min-[1100px]:flex-row min-[1100px]:items-center gap-3 relative select-none"
              onMouseDown={(e) => onDragStart(e.clientX)}
              onMouseMove={(e) => onDragMove(e.clientX)}
              onMouseUp={(e) => onDragEnd(e.clientX)}
              onMouseLeave={() => { dragStartX.current = null; }}
              onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
              onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
              onTouchEnd={(e) => onDragEnd(e.changedTouches[0].clientX)}
            >
              {/* Image row: arrows flank the image on all sizes */}
              <div className="flex items-center justify-center gap-[5px] xs:gap-3 min-[1100px]:contents">
                {/* Prev Arrow */}
                <button
                  onClick={prevDeal}
                  className="flex-shrink-0 w-8 h-12 bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 flex items-center justify-center transition-colors"
                  aria-label="Previous deal"
                >
                  <ChevronLeft size={18} />
                </button>

                {/* Product Image */}
                <Link
                  href={`/products/${deal.product.slug}`}
                  className="relative flex-shrink-0 w-[220px] h-[280px]"
                  onClick={(e) => { if (isDragging.current) e.preventDefault(); }}
                >
                  {dealImageUrl(dealDetails, deal.product.slug, deal.variantId, deal.variant?.primaryImageUrl) ? (
                    <Image
                      src={dealImageUrl(dealDetails, deal.product.slug, deal.variantId, deal.variant?.primaryImageUrl)!}
                      alt={deal.product.name}
                      fill
                      sizes="220px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                  <span className="absolute bg-[#129cd3] text-white text-xs font-bold w-11 h-11 rounded-full flex items-center justify-center" style={{ top: "20%", right: "-12%" }}>
                    -{deal.percentOff}%
                  </span>
                </Link>

                {/* Next Arrow */}
                <button
                  onClick={nextDeal}
                  className="flex-shrink-0 w-8 h-12 bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 flex items-center justify-center transition-colors"
                  aria-label="Next deal"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 flex flex-col gap-0">

                {/* Title block */}
                <Link href={`/products/${deal.product.slug}`} className="block group mb-3">
                  <h3
                    className="font-extrabold text-gray-900 group-hover:text-[#129cd3] transition-colors duration-200 tracking-tight line-clamp-2"
                    style={{ fontSize: "24px", lineHeight: "normal" }}
                  >
                    {deal.product.name}
                  </h3>
                </Link>

                {/* Highlights */}
                {(() => {
                  const detail = dealDetails[deal.product.slug];
                  if (detail?.specs && Object.keys(detail.specs).length > 0) {
                    const s = (key: string) => {
                      const v = detail.specs[key];
                      return v ? String(v).trim() : "";
                    };
                    const highlights: { label: string; text: string; color: string; dot: string }[] = [];
                    const colors = [
                      { color: "bg-blue-50 border-blue-100",   dot: "bg-blue-500" },
                      { color: "bg-purple-50 border-purple-100", dot: "bg-purple-500" },
                      { color: "bg-[#e8f7fc] border-[#b3e5f7]", dot: "bg-[#129cd3]" },
                      { color: "bg-green-50 border-green-100", dot: "bg-green-500" },
                      { color: "bg-orange-50 border-orange-100", dot: "bg-orange-400" },
                      { color: "bg-pink-50 border-pink-100",   dot: "bg-pink-500" },
                      { color: "bg-yellow-50 border-yellow-100", dot: "bg-yellow-500" },
                    ];
                    // Phone highlights
                    const ram = s("RAM"), rom = s("ROM");
                    if (ram || rom) highlights.push({ label: "Memory", text: [ram && `${ram} RAM`, rom && `${rom} ROM`].filter(Boolean).join(" · "), ...colors[0] });
                    const proc = s("Processor");
                    if (proc) highlights.push({ label: "Processor", text: proc, ...colors[1] });
                    const rear = s("Rear Camera");
                    if (rear) highlights.push({ label: "Camera", text: `${rear} Rear`, ...colors[2] });
                    const bat = s("Battery");
                    if (bat) highlights.push({ label: "Battery", text: bat, ...colors[3] });
                    // Only add Display for phones if other phone specs already matched
                    if (highlights.length > 0) {
                      const displayParts = [s("Display Size"), s("Screen Type")].filter(Boolean);
                      if (displayParts.length) highlights.push({ label: "Display", text: displayParts.join(" · "), ...colors[4] });
                    }
                    // Camera highlights — only trigger if a camera-unique key matches
                    if (highlights.length === 0) {
                      const lensMount = s("Lens Mount");
                      const memCard = s("Memory Card Type");
                      const shutterSpeed = s("Shutter Speed");
                      const isCameraProduct = !!(lensMount || memCard || shutterSpeed);
                      if (isCameraProduct) {
                        if (lensMount) highlights.push({ label: "Lens Mount", text: lensMount, ...colors[0] });
                        if (memCard) highlights.push({ label: "Memory Card", text: memCard, ...colors[1] });
                        if (shutterSpeed) highlights.push({ label: "Shutter Speed", text: shutterSpeed, ...colors[2] });
                        const aspectRatio = s("Aspect Ratio");
                        if (aspectRatio) highlights.push({ label: "Aspect Ratio", text: aspectRatio, ...colors[3] });
                        const connParts: string[] = [];
                        if (s("Wi-Fi") === "Yes") connParts.push("Wi-Fi");
                        if (s("Bluetooth") === "Yes") connParts.push("Bluetooth");
                        if (s("NFC") === "Yes") connParts.push("NFC");
                        const usbType = s("USB Type");
                        if (usbType) connParts.push(`USB ${usbType}`);
                        if (s("HDMI") === "Yes") connParts.push("HDMI");
                        if (connParts.length > 0) highlights.push({ label: "Connectivity", text: connParts.join(", "), ...colors[4] });
                        const display = s("Display");
                        if (display) highlights.push({ label: "Display", text: display, ...colors[5] });
                      }
                    }
                    // TV highlights
                    if (highlights.length === 0) {
                      const tvKeys: { label: string; key: string; color: typeof colors[0] }[] = [
                        { label: "Screen Size",        key: "Screen Size",         color: colors[0] },
                        { label: "Resolution",         key: "Resolution",          color: colors[1] },
                        { label: "Display Technology", key: "Display Technology",  color: colors[2] },
                        { label: "Refresh Rate",       key: "Refresh Rate",        color: colors[3] },
                        { label: "Operating System",   key: "Operating System",    color: colors[4] },
                        { label: "Special Feature",    key: "Special Feature",     color: colors[5] },
                      ];
                      for (const { label, key, color } of tvKeys) {
                        const val = s(key);
                        if (val) highlights.push({ label, text: val, ...color });
                      }
                    }
                    // Generic fallback — cap at 5
                    if (highlights.length === 0) {
                      Object.entries(detail.specs).slice(0, 5).forEach(([k, v], idx) => {
                        if (v && typeof v !== "object")
                          highlights.push({ label: k, text: String(v), ...colors[idx % colors.length] });
                      });
                    }
                    if (highlights.length > 0) {
                      return (
                        <ul className="mb-4 space-y-2">
                          {highlights.map((h, i) => (
                            <li
                              key={i}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${h.color}`}
                            >
                              <span className={`shrink-0 w-2 h-2 rounded-full ${h.dot}`} />
                              <span style={{ lineHeight: "normal" }}>
                                <span className="font-bold text-gray-800" style={{ fontSize: "15px" }}>
                                  {h.label}:
                                </span>{" "}
                                <span className="text-gray-600" style={{ fontSize: "14px" }}>
                                  {h.text}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      );
                    }
                  }
                  if (detail?.description) {
                    return (
                      <p className="text-sm text-gray-500 mb-4 leading-relaxed line-clamp-4">
                        {detail.description}
                      </p>
                    );
                  }
                  return (
                    <p className="text-sm text-gray-400 mb-4 italic">
                      Limited time offer — grab it before the deal ends.
                    </p>
                  );
                })()}

                {/* Price block */}
                <div className="mt-auto rounded-xl bg-gradient-to-r from-[#e8f7fc] to-white border border-[#b3e5f7] px-4 py-3 flex items-center gap-4">
                  <div>
                    <div className="text-[11px] font-semibold text-[#129cd3] uppercase tracking-widest mb-0.5">Deal Price</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-extrabold text-[#129cd3]" style={{ fontSize: "28px", lineHeight: "normal" }}>
                        {formatPrice(deal.dealPrice)}
                      </span>
                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(deal.basePrice)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-auto shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full bg-[#129cd3] shadow-md">
                    <span className="text-white font-extrabold" style={{ fontSize: "15px", lineHeight: 1 }}>
                      -{deal.percentOff}%
                    </span>
                    <span className="text-white/80 font-semibold" style={{ fontSize: "9px", lineHeight: 1.2 }}>
                      OFF
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Thumbnail Carousel */}
          {liveDeals.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              {/* Prev */}
              <button
                onClick={prevDeal}
                disabled={liveDeals.length <= 1}
                className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                aria-label="Previous deal"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Visible thumbnails */}
              <div className="flex gap-2 flex-1 overflow-hidden pt-1.5 pb-0.5 px-1.5">
                {liveDeals.slice(thumbStart, thumbStart + THUMB_VISIBLE).map((d, rel) => {
                  const i = thumbStart + rel;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setDealIdx(i)}
                      className={`relative flex-shrink-0 flex-1 bg-white p-2 rounded-lg transition-all duration-200 ${
                        i === safeIdx
                          ? "border-2 border-[#129cd3] shadow-md shadow-[#129cd3]/20"
                          : "border border-gray-200 hover:border-[#129cd3]/50 hover:shadow-sm"
                      }`}
                    >
                      <div className="relative w-full h-16">
                        {dealImageUrl(dealDetails, d.product.slug, d.variantId, d.variant?.primaryImageUrl) ? (
                          <Image
                            src={dealImageUrl(dealDetails, d.product.slug, d.variantId, d.variant?.primaryImageUrl)!}
                            alt={d.product.name}
                            fill
                            sizes="112px"
                            className="object-contain"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 rounded" />
                        )}
                        <span className="absolute -top-1 -right-1 bg-[#129cd3] text-white text-[9px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
                          -{d.percentOff}%
                        </span>
                      </div>
                      <p className={`text-[11px] line-clamp-2 mt-1.5 text-center font-medium leading-tight ${i === safeIdx ? "text-[#129cd3]" : "text-gray-600"}`}>
                        {d.product.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Next */}
              <button
                onClick={nextDeal}
                disabled={liveDeals.length <= 1}
                className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                aria-label="Next deal"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <div className="bg-white border border-gray-100 shadow-sm flex flex-col h-full">
            <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-xs font-bold text-white bg-[#129cd3] px-3 py-1.5 uppercase tracking-wide">
                BEST SELLERS
              </h2>
            </div>
            <div className="divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: "452px" }}>
              {bestSellers.slice(0, 8).map((product) => (
                <BestSellerRow key={product.id} product={product} imageUrl={dealImageUrl(dealDetails, product.slug)} />
              ))}
            </div>
            <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3">
              <Link
                href="/products?sort=popular"
                className="text-xs font-semibold text-[#129cd3] flex items-center justify-center gap-1 hover:underline"
              >
                View All <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
