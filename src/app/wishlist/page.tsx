"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { isApiError, wishlistApi } from "@/lib/api";
import type { WishlistCardItem } from "@/lib/api";
import { X, ShoppingCart, Heart, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

type MoveState = "idle" | "busy" | "moved" | "error";

export default function WishlistPage() {
  const router = useRouter();
  const { status } = useAuth();
  const { items, loading, error, setItems, refresh } = useWishlist();
  const { setCart: syncHeaderCart } = useCart();

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [moveState, setMoveState] = useState<Record<string, MoveState>>({});
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/wishlist");
    }
  }, [status, router]);

  // Initial fetch is handled by WishlistProvider on auth flip.

  const setMove = (id: string, s: MoveState) =>
    setMoveState((prev) => ({ ...prev, [id]: s }));
  const setRm = (id: string, busy: boolean) =>
    setRemoveBusy((prev) => {
      const next = { ...prev };
      if (busy) next[id] = true;
      else delete next[id];
      return next;
    });
  const setLineErr = (id: string, msg: string | null) =>
    setLineErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const handleRemove = useCallback(
    async (item: WishlistCardItem) => {
      const id = item.wishlistItemId;
      setRm(id, true);
      setLineErr(id, null);
      try {
        const resp = await wishlistApi.removeItem(id);
        setItems(resp.items);
      } catch (err) {
        setLineErr(
          id,
          isApiError(err) ? err.displayMessage : "Could not remove item",
        );
      } finally {
        setRm(id, false);
      }
    },
    [setItems],
  );

  const handleMove = useCallback(
    async (item: WishlistCardItem) => {
      const id = item.wishlistItemId;
      setMove(id, "busy");
      setLineErr(id, null);
      try {
        const resp = await wishlistApi.moveToCart(id, { qty: 1 });
        // The API returns the updated wishlist + cart; sync both providers so
        // other surfaces (incl. the header badges) stay accurate.
        setItems(resp.wishlist.items);
        syncHeaderCart(resp.cart);
        setMove(id, "moved");
        // Item leaves the grid on next render anyway (provider state changed).
      } catch (err) {
        setMove(id, "error");
        setLineErr(
          id,
          isApiError(err) ? err.displayMessage : "Could not move to cart",
        );
        window.setTimeout(() => setMove(id, "idle"), 2000);
      }
    },
    [setItems, syncHeaderCart],
  );

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
            <div className="wishlist-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
              {items.map((item) => {
                const id = item.wishlistItemId;
                const move = moveState[id] ?? "idle";
                const removing = !!removeBusy[id];
                const lineErr = lineErrors[id];
                const hasDiscount = item.basePrice > item.finalPrice;
                const discount = hasDiscount
                  ? Math.round(
                      ((item.basePrice - item.finalPrice) / item.basePrice) *
                        100,
                    )
                  : 0;
                const badge = item.badges[0];

                return (
                  <div
                    key={id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden group relative hover:shadow-md transition-shadow flex flex-col wishlist-card"
                  >
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(item)}
                      disabled={removing}
                      className="absolute top-2 right-2 z-10 w-7 h-7 bg-white shadow rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {removing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>

                    {/* Badge */}
                    {badge && (
                      <div className="absolute top-2 left-2 z-10">
                        <span
                          className={`text-white text-[10px] font-bold px-2 py-0.5 rounded ${
                            badge === "NEW"
                              ? "bg-green-500"
                              : badge === "HOT"
                              ? "bg-red-500"
                              : "bg-[#129cd3]"
                          }`}
                        >
                          {badge}
                        </span>
                      </div>
                    )}

                    {/* Image */}
                    <Link
                      href={`/products/${item.slug}`}
                      className="flex-1 min-h-0 sm:flex-none block bg-gray-50 overflow-hidden"
                    >
                      {item.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.primaryImageUrl}
                          alt={item.name}
                          className="w-full h-full sm:h-48 object-contain p-[10px] group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full sm:h-48 bg-gray-100" />
                      )}
                    </Link>

                    {/* Info */}
                    <div className="p-4 max-[1023px]:p-[10px] flex flex-col shrink-0 sm:flex-1 max-[1023px]:justify-end">
                      {item.brand && (
                        <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">
                          {item.brand}
                        </p>
                      )}
                      <Link href={`/products/${item.slug}`}>
                        <h3 className="text-sm max-[639px]:text-[13px] max-[639px]:leading-normal font-semibold text-gray-800 mb-3 max-[639px]:mb-[5px] line-clamp-2 leading-snug hover:text-[#129cd3] transition-colors">
                          {item.name}
                        </h3>
                      </Link>

                      <div className="flex items-baseline gap-2 mb-4 max-[639px]:mb-[5px] mt-auto max-[1023px]:mt-0">
                        <span className="text-base max-[639px]:text-[14px] max-[639px]:leading-normal font-bold text-[#129cd3]">
                          {formatPrice(item.finalPrice)}
                        </span>
                        {hasDiscount && (
                          <>
                            <span className="text-xs text-gray-400 line-through">
                              {formatPrice(item.basePrice)}
                            </span>
                            <span className="text-[10px] text-green-600 font-semibold">
                              {discount}% off
                            </span>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => handleMove(item)}
                        disabled={move === "busy"}
                        className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-lg transition-colors ${
                          move === "moved"
                            ? "bg-green-500 text-white"
                            : move === "error"
                            ? "bg-red-500 text-white"
                            : "bg-[#129cd3] hover:bg-[#0e87b5] text-white"
                        } ${move === "busy" ? "opacity-60 cursor-wait" : ""}`}
                      >
                        {move === "moved" ? (
                          <>
                            <Check size={14} /> Moved
                          </>
                        ) : move === "error" ? (
                          <>Could not move</>
                        ) : move === "busy" ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />{" "}
                            Moving…
                          </>
                        ) : (
                          <>
                            <ShoppingCart size={14} /> Move to Cart
                          </>
                        )}
                      </button>
                      {lineErr && (
                        <p className="text-[11px] text-red-600 mt-2">{lineErr}</p>
                      )}
                    </div>
                  </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="bg-gray-100 w-full sm:h-48 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
                  <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
                  <div className="h-9 w-full bg-gray-100 rounded animate-pulse mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
