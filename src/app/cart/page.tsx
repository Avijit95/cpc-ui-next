"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { cartApi, catalogApi, isApiError } from "@/lib/api";
import { useStock } from "@/lib/stock/StockProvider";
import type { CartView, PricedCartLine } from "@/lib/api";
import {
  Trash2,
  Truck,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function CartPage() {
  const router = useRouter();
  const { status } = useAuth();

  const { setCart: syncHeaderCart } = useCart();
  const { stocks, setStock, adjustStock } = useStock();
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantImages, setVariantImages] = useState<Record<string, string>>({});
  const [mrpMap, setMrpMap] = useState<Record<string, number>>({});

  // Mirror cart changes (load, qty, coupons, removal) into the header badge.
  useEffect(() => {
    if (cart) syncHeaderCart(cart);
  }, [cart, syncHeaderCart]);

  // After cart changes, fetch product detail and seed global stock store with
  // EFFECTIVE remaining stock = API stock − qty already in this cart.
  // This prevents the cart page from overwriting adjustments made on other pages.
  useEffect(() => {
    if (!cart || cart.items.length === 0) return;
    const slugs = [...new Set(cart.items.map((l) => l.slug))];
    // Build maps of how many units are already in the cart per variant / product.
    const variantCartQty: Record<string, number> = {};
    const productCartQty: Record<string, number> = {};
    cart.items.forEach((line) => {
      if (line.variantId) {
        variantCartQty[line.variantId] = (variantCartQty[line.variantId] ?? 0) + line.qty;
      } else {
        productCartQty[line.slug] = (productCartQty[line.slug] ?? 0) + line.qty;
      }
    });
    Promise.all(slugs.map((slug) => catalogApi.getProduct(slug).catch(() => null))).then(
      (details) => {
        const newVariantImages: Record<string, string> = {};
        const newMrpMap: Record<string, number> = {};
        details.forEach((detail, i) => {
          if (!detail) return;
          const slug = slugs[i];
          if (detail.variants.length > 0) {
            // Variant product: effective stock per variant = API variant stock − cart qty for that variant.
            detail.variants.forEach((v) => {
              const effective = Math.max(0, v.stock - (variantCartQty[v.id] ?? 0));
              setStock(`v:${v.id}`, effective);
              // Capture variant-specific image URL and MRP.
              const imgUrl = v.images[0]?.url;
              if (imgUrl) newVariantImages[v.id] = imgUrl;
              newMrpMap[`v:${v.id}`] = v.pricing.basePrice;
            });
          } else {
            // Non-variant product: effective stock = API stock − cart qty for this slug.
            const effective = Math.max(0, detail.stock - (productCartQty[slug] ?? 0));
            setStock(`p:${slug}`, effective);
            newMrpMap[`p:${slug}`] = detail.pricing.basePrice;
          }
        });
        if (Object.keys(newVariantImages).length > 0) {
          setVariantImages((prev) => ({ ...prev, ...newVariantImages }));
        }
        if (Object.keys(newMrpMap).length > 0) {
          setMrpMap((prev) => ({ ...prev, ...newMrpMap }));
        }
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  // Per-line pending qty for optimistic updates (rolled back on error).
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [busyLines, setBusyLines] = useState<Record<string, boolean>>({});

  // Auth gate: redirect logged-out users to login with a return path.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/cart");
    }
  }, [status, router]);

  // Initial cart load.
  useEffect(() => {
    if (status !== "authenticated") return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    cartApi
      .view()
      .then((c) => {
        if (ac.signal.aborted) return;
        setCart(c);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(isApiError(err) ? err.displayMessage : "Failed to load cart");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [status]);

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyLines((prev) => {
      const next = { ...prev };
      if (busy) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);

  const updateQty = useCallback(
    async (line: PricedCartLine, nextQty: number) => {
      if (nextQty < 1 || nextQty > 99) return;
      const id = line.cartItemId;
      const lineStockKey = line.variantId ? `v:${line.variantId}` : `p:${line.slug}`;
      const delta = nextQty - line.qty;
      // Optimistic: stash the new qty for instant feedback.
      setPendingQty((p) => ({ ...p, [id]: nextQty }));
      setLineErrors((e) => {
        if (!e[id]) return e;
        const rest = { ...e };
        delete rest[id];
        return rest;
      });
      setBusy(id, true);
      try {
        let updated = await cartApi.updateItem(id, { qty: nextQty });
        // If the backend accepted a qty that exceeds available stock, auto-correct
        // it back to the available amount so the price reflects reality.
        const sw = updated.stockWarnings.find((s) => s.cartItemId === id);
        if (sw && sw.available > 0 && nextQty > sw.available) {
          setPendingQty((p) => ({ ...p, [id]: sw.available }));
          updated = await cartApi.updateItem(id, { qty: sw.available });
        }
        setCart(updated);
        // Reflect the qty change in the global stock store.
        adjustStock(lineStockKey, -delta);
      } catch (err: unknown) {
        // Rollback the optimistic qty on error.
        setLineErrors((e) => ({
          ...e,
          [id]: isApiError(err) ? err.displayMessage : "Could not update",
        }));
      } finally {
        setPendingQty((p) => {
          const rest = { ...p };
          delete rest[id];
          return rest;
        });
        setBusy(id, false);
      }
    },
    [setBusy, adjustStock],
  );

  const toggleCoupon = useCallback(
    async (line: PricedCartLine, slot: "customer" | "retail", apply: boolean) => {
      const id = line.cartItemId;
      setLineErrors((e) => {
        if (!e[id]) return e;
        const rest = { ...e };
        delete rest[id];
        return rest;
      });
      setBusy(id, true);
      try {
        const updated = await cartApi.updateItem(id, {
          ...(slot === "customer" ? { customerCouponApplied: apply } : {}),
          ...(slot === "retail" ? { retailCouponApplied: apply } : {}),
        });
        setCart(updated);
      } catch (err: unknown) {
        setLineErrors((e) => ({
          ...e,
          [id]: isApiError(err) ? err.displayMessage : "Could not apply coupon",
        }));
      } finally {
        setBusy(id, false);
      }
    },
    [setBusy],
  );

  const removeLine = useCallback(
    async (line: PricedCartLine) => {
      const id = line.cartItemId;
      const lineStockKey = line.variantId ? `v:${line.variantId}` : `p:${line.slug}`;
      setBusy(id, true);
      try {
        const updated = await cartApi.removeItem(id);
        // Return all qty back to the global stock store immediately.
        adjustStock(lineStockKey, line.qty);
        setCart(updated);
      } catch (err: unknown) {
        setLineErrors((e) => ({
          ...e,
          [id]: isApiError(err) ? err.displayMessage : "Could not remove item",
        }));
      } finally {
        setBusy(id, false);
      }
    },
    [setBusy, adjustStock],
  );

  // While auth is bootstrapping or redirecting, show a skeleton.
  if (status === "loading" || status === "unauthenticated") {
    return <CartSkeleton />;
  }

  if (loading) return <CartSkeleton />;

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Shopping Cart</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">
            Shopping Cart{" "}
            <span className="text-base font-normal text-gray-500">
              ({cart?.items.length ?? 0} items)
            </span>
          </h1>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {cart && cart.staleApplications.length > 0 && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-0.5">Some coupon applications were reset</p>
                <ul className="list-disc list-inside">
                  {cart.staleApplications.map((s, i) => (
                    <li key={i}>
                      {s.type === "customer" ? "Customer" : "Retail"} coupon —{" "}
                      {s.reason === "COUPON_REMOVED"
                        ? "coupon was removed by the seller"
                        : "verified-partner status required"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!cart || cart.items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Cart Items */}
              <div className="flex-1 space-y-4">
                {cart.items.map((line) => {
                  const id = line.cartItemId;
                  const displayQty = pendingQty[id] ?? line.qty;
                  const lineErr = lineErrors[id];
                  const busy = !!busyLines[id];
                  const stockWarning = cart.stockWarnings.find(
                    (s) => s.cartItemId === id,
                  );
                  // Live stock from global store (populated by the detail fetch above).
                  const lineStockKey = line.variantId ? `v:${line.variantId}` : `p:${line.slug}`;
                  const lineStock = stocks[lineStockKey];

                  return (
                    <div
                      key={id}
                      className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex gap-3 sm:gap-4"
                    >
                      {/* Image — links to the product detail page */}
                      <Link
                        href={`/products/${line.slug}${line.variantId ? `?variant=${line.variantId}` : ""}`}
                        aria-label={`View ${line.name}`}
                        className="w-16 h-16 sm:w-24 sm:h-24 bg-gray-100 rounded-lg flex-shrink-0 border border-gray-100 overflow-hidden hover:opacity-80 transition-opacity"
                      >
                        {(() => {
                          const imgSrc = (line.variantId && variantImages[line.variantId]) || line.primaryImageUrl;
                          return imgSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgSrc}
                              alt={line.name}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : null;
                        })()}
                      </Link>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/products/${line.slug}${line.variantId ? `?variant=${line.variantId}` : ""}`}
                          className="block"
                        >
                          <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-1 line-clamp-2 hover:text-[#129cd3] transition-colors">
                            {line.name}
                          </h3>
                        </Link>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3">
                          <span className="text-sm sm:text-base font-bold text-[#129cd3]">
                            {formatPrice(line.unitPrice)}
                          </span>
                          {line.deal && (
                            <>
                              <span className="text-xs text-gray-400 line-through">
                                {formatPrice(line.deal.basePrice)}
                              </span>
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded">
                                DEAL -{line.deal.percentOff}%
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Qty */}
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                            <button
                              onClick={() => displayQty <= 1 ? removeLine(line) : updateQty(line, displayQty - 1)}
                              disabled={busy}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-semibold text-gray-800">
                              {displayQty}
                            </span>
                            <button
                              onClick={() => updateQty(line, displayQty + 1)}
                              disabled={busy || lineStock === 0 || displayQty >= (stockWarning?.available ?? 99)}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => removeLine(line)}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-xs font-medium transition-colors disabled:opacity-40"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                          {busy && (
                            <Loader2
                              size={14}
                              className="animate-spin text-gray-400"
                            />
                          )}
                        </div>


                        {(lineStock === 0 || stockWarning?.available === 0) && (
                          <p className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                            <AlertTriangle size={13} />
                            Out of stock
                          </p>
                        )}
                        {stockWarning && stockWarning.available > 0 && (
                          <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Only {stockWarning.available} in stock
                          </p>
                        )}

                        {/* Inline total — shown only below 450px */}
                        <div className="xxs:hidden mt-2 flex items-center justify-between">
                          <span className="text-xs text-gray-400">Total</span>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-800">{formatPrice((line.lineSubtotal / line.qty) * displayQty - line.discount.total)}</span>
                            {line.discount.total > 0 && (
                              <p className="text-[10px] text-green-600">saved {formatPrice(line.discount.total)}</p>
                            )}
                          </div>
                        </div>

                        {lineErr && (
                          <p className="mt-2 text-xs text-red-600">{lineErr}</p>
                        )}
                      </div>

                      {/* Item total — hidden below 450px */}
                      <div className="hidden xxs:flex flex-col flex-shrink-0 text-right">
                        <p className="text-xs text-gray-400 mb-1">Total</p>
                        <p className="text-sm sm:text-base font-bold text-gray-800">
                          {formatPrice((line.lineSubtotal / line.qty) * displayQty - line.discount.total)}
                        </p>
                        {line.discount.total > 0 && (
                          <p className="text-[10px] text-green-600 mt-0.5">
                            saved {formatPrice(line.discount.total)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: Order Summary */}
              <div className="lg:w-80 flex-shrink-0">
                <div className="bg-white rounded-xl border border-gray-200 p-5 lg:sticky lg:top-24">
                  <h2 className="text-base font-bold text-gray-800 mb-4 pb-3 border-b border-gray-100">
                    Order Summary
                  </h2>

                  {(() => {
                    // MRP = pricing.basePrice per line (fetched from product detail).
                    // Falls back to unitPrice until details load.
                    const mrpTotal = cart.items.reduce((sum, line) => {
                      const key = line.variantId ? `v:${line.variantId}` : `p:${line.slug}`;
                      return sum + (mrpMap[key] ?? line.unitPrice) * line.qty;
                    }, 0);
                    const discountOnMrp = mrpTotal - cart.subtotal;
                    const grossAmount = cart.subtotal;
                    const couponDiscount = cart.discountTotal;
                    // Total Purchase = gross − coupon (excluding GST for display)
                    const totalPurchase = grossAmount - couponDiscount;
                    const totalSavings = mrpTotal - totalPurchase;
                    return (
                      <>
                        <div className="space-y-3 mb-4">
                          {/* MRP */}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">MRP ({cart.items.length} {cart.items.length === 1 ? "item" : "items"})</span>
                            <span className="font-semibold text-gray-800">{formatPrice(mrpTotal)}</span>
                          </div>

                          {/* Discount on MRP */}
                          {discountOnMrp > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Total Discount on MRP</span>
                              <span className="font-semibold text-green-600">−{formatPrice(discountOnMrp)}</span>
                            </div>
                          )}

                          {/* Gross Amount */}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Gross Amount</span>
                            <span className="font-semibold text-gray-800">{formatPrice(grossAmount)}</span>
                          </div>

                          {/* Coupon Discount — only show if coupon available or applied */}
                          {couponDiscount > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Coupon Discount</span>
                              <span className="font-semibold text-green-600">−{formatPrice(couponDiscount)}</span>
                            </div>
                          )}

                          {cart.shippingHint && (
                            <div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Shipping</span>
                                <span className={`font-semibold ${cart.shippingHint.estimatedRate === 0 ? "text-green-600" : "text-gray-800"}`}>
                                  {cart.shippingHint.estimatedRate === 0 ? "Free" : formatPrice(cart.shippingHint.estimatedRate)}
                                </span>
                              </div>
                              {cart.shippingHint.amountAwayFromFree !== null && cart.shippingHint.amountAwayFromFree > 0 && (
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  Add {formatPrice(cart.shippingHint.amountAwayFromFree)} more for free shipping
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Total Purchase Amount */}
                        <div className="border-t border-gray-100 pt-3 mb-3">
                          <div className="flex justify-between">
                            <span className="font-bold text-gray-800">Total Purchase Amount</span>
                            <span className="font-bold text-lg text-[#129cd3]">{formatPrice(totalPurchase)}</span>
                          </div>
                        </div>

                        {/* Your total savings */}
                        {totalSavings > 0 && (
                          <div className="flex justify-between text-sm mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                            <span className="font-semibold text-green-700">Your total savings</span>
                            <span className="font-bold text-green-600">{formatPrice(totalSavings)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="bg-[#e8f7fc] rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-xs text-[#129cd3]">
                    <Truck size={14} />
                    <span>
                      Estimated delivery:{" "}
                      <strong>3–5 business days</strong>
                    </span>
                  </div>

                  <Link
                    href="/checkout"
                    className="w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors"
                  >
                    Proceed to Checkout <ChevronRight size={16} />
                  </Link>

                  <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-400">
                    <ShieldCheck size={13} /> Secure Checkout — SSL Encrypted
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function CouponChips({
  line,
  busy,
  onToggle,
}: {
  line: PricedCartLine;
  busy: boolean;
  onToggle: (
    line: PricedCartLine,
    slot: "customer" | "retail",
    apply: boolean,
  ) => void;
}) {
  const customer = line.availableCoupons.customer;
  const retail = line.availableCoupons.retail;
  const customerApplied = !!line.appliedCoupons.customer;
  const retailApplied = !!line.appliedCoupons.retail;
  if (!customer && !retail) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {customer && (
        <button
          onClick={() => onToggle(line, "customer", !customerApplied)}
          disabled={busy}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
            customerApplied
              ? "bg-[#e8f7fc] border-[#129cd3] text-[#129cd3]"
              : "bg-white border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
          } disabled:opacity-50`}
        >
          <input
            type="checkbox"
            readOnly
            checked={customerApplied}
            className="w-3 h-3 accent-[#129cd3] cursor-pointer"
          />
          Apply ₹{customer.value} off ({customer.name})
        </button>
      )}
      {retail && (
        <button
          onClick={() => onToggle(line, "retail", !retailApplied)}
          disabled={busy}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
            retailApplied
              ? "bg-[#e8f7fc] border-[#129cd3] text-[#129cd3]"
              : "bg-white border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
          } disabled:opacity-50`}
        >
          <input
            type="checkbox"
            readOnly
            checked={retailApplied}
            className="w-3 h-3 accent-[#129cd3] cursor-pointer"
          />
          Apply {retail.value}% partner discount ({retail.name})
        </button>
      )}
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
      <div className="text-6xl mb-4">🛒</div>
      <h2 className="text-xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
      <p className="text-gray-500 mb-6">Add some products to get started.</p>
      <Link
        href="/products"
        className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
      >
        Browse Products
      </Link>
    </div>
  );
}

function CartSkeleton() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 h-6" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4"
                >
                  <div className="w-24 h-24 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                    <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:w-80 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-12 w-full bg-gray-100 rounded animate-pulse mt-4" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
