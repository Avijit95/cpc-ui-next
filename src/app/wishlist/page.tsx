"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { catalogApi, wishlistApi } from "@/lib/api";
import type { ProductDetail, WishlistCardItem } from "@/lib/api";
import { useStock } from "@/lib/stock/StockProvider";
import { Heart, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import ProductCard, { ProductCardSkeleton } from "@/components/ProductCard";
import type { ListCard, Variant } from "@/lib/api";

export default function WishlistPage() {
  const router = useRouter();
  const { status } = useAuth();
  const { items, loading, error, setItems, refresh } = useWishlist();
  const { stocks, setStock } = useStock();

  const [productDetails, setProductDetails] = useState<Record<string, ProductDetail>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/wishlist");
    }
  }, [status, router]);

  // Seed global stock store and store product details for variant info.
  useEffect(() => {
    if (!items.length) return;
    const slugs = [...new Set(items.map((i) => i.slug))];
    Promise.all(slugs.map((slug) => catalogApi.getProduct(slug).catch(() => null))).then(
      (details) => {
        const newDetails: Record<string, ProductDetail> = {};
        details.forEach((detail, i) => {
          if (!detail) return;
          const slug = slugs[i];
          newDetails[slug] = detail;
          detail.variants.forEach((v) => {
            const cur = stocks[`v:${v.id}`];
            if (cur === undefined || v.stock < cur) setStock(`v:${v.id}`, v.stock);
          });
          // Always seed product-level stock — for non-variant products use detail.stock;
          // for variant products use max of variant stocks so the card reflects real availability.
          const effectiveStock = detail.variants.length > 0
            ? Math.max(detail.stock, ...detail.variants.map((v) => v.stock))
            : detail.stock;
          const curP = stocks[`p:${slug}`];
          if (curP === undefined || effectiveStock < curP) setStock(`p:${slug}`, effectiveStock);
        });
        setProductDetails((prev) => ({ ...prev, ...newDetails }));
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleClearAll = useCallback(async () => {
    setClearBusy(true);
    try {
      await wishlistApi.clear();
      await refresh();
    } finally {
      setClearBusy(false);
      setConfirmClear(false);
    }
  }, [refresh]);

  if (status === "loading" || status === "unauthenticated") {
    return <WishlistSkeleton />;
  }
  if (loading) return <WishlistSkeleton />;

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Wishlist</span>
          </div>
        </div>
        <div className="lg:hidden max-w-7xl mx-auto px-4 pt-4">
          <Link href="/account" className="inline-flex items-center gap-1 text-sm text-[#129cd3] font-medium hover:underline">
            <ChevronLeft size={16} /> Back to Account
          </Link>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Heart size={24} className="text-red-500 fill-red-500" />
              My Wishlist{" "}
              <span className="text-base font-normal text-gray-500">
                ({items.length} items)
              </span>
            </h1>
            {items.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={clearBusy}
                className="text-sm text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                Clear All
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <EmptyWishlist />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {items.map((item) => {
                const listCard = toListCard(item);
                const variantOverride: Variant | undefined = item.variantId
                  ? productDetails[item.slug]?.variants.find((v) => v.id === item.variantId)
                  : undefined;
                return (
                  <ProductCard
                    key={item.wishlistItemId}
                    product={listCard}
                    variantOverride={variantOverride}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* Clear-all confirm modal */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !clearBusy && setConfirmClear(false)}
          />
          <div className="relative bg-white rounded-xl border border-gray-200 max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Clear your wishlist?
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              This will remove all {items.length} items. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                disabled={clearBusy}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearBusy}
                className="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {clearBusy && <Loader2 size={14} className="animate-spin" />}
                {clearBusy ? "Clearing…" : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function toListCard(item: WishlistCardItem): ListCard {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    brand: item.brand,
    basePrice: item.basePrice,
    finalPrice: item.finalPrice,
    lowestVariantPrice: item.lowestVariantPrice,
    primaryImageUrl: item.primaryImageUrl,
    badges: item.badges,
    ratingAverage: null,
    reviewCount: 0,
    isBestSeller: false,
    isFeatured: false,
    deal: null,
    stock: null,
  };
}

function EmptyWishlist() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
      <Heart size={56} className="text-gray-200 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-gray-700 mb-2">
        Your wishlist is empty
      </h2>
      <p className="text-gray-500 mb-6">
        Save items you love to your wishlist and revisit them anytime.
      </p>
      <Link
        href="/products"
        className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
      >
        Browse Products
      </Link>
    </div>
  );
}

function WishlistSkeleton() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 h-6" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
