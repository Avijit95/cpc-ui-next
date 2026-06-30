"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  addressesApi,
  cartApi,
  checkoutApi,
  paymentsApi,
  isApiError,
} from "@/lib/api";
import type {
  Address,
  CartView,
  CreateAddressBody,
  StateCode,
  StockShortage,
} from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Truck,
  X,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

const STATE_OPTIONS: { code: StateCode; name: string }[] = [
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "CH", name: "Chandigarh" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "HR", name: "Haryana" },
  { code: "JH", name: "Jharkhand" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MH", name: "Maharashtra" },
  { code: "ML", name: "Meghalaya" },
  { code: "MN", name: "Manipur" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OR", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "PY", name: "Puducherry" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TG", name: "Telangana" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TR", name: "Tripura" },
  { code: "UK", name: "Uttarakhand" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "WB", name: "West Bengal" },
];

const stateName = (code: StateCode) =>
  STATE_OPTIONS.find((s) => s.code === code)?.name ?? code;

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

type AddressForm = {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  stateCode: StateCode;
  pincode: string;
};

const emptyAddressForm: AddressForm = {
  label: "",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  stateCode: "WB",
  pincode: "",
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback — extremely unlikely on modern browsers.
  return `ck-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useAuth();

  // Buy Now: `?items=<cartItemId,...>` scopes checkout to those cart lines.
  const cartItemIds = useMemo(() => {
    const raw = searchParams.get("items");
    const ids = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    return ids.length > 0 ? ids : null;
  }, [searchParams]);

  const [cart, setCart] = useState<CartView | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddressForm>(emptyAddressForm);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<StockShortage[] | null>(null);

  // Idempotency key — stable across retries from this page mount.
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/checkout");
    }
  }, [status, router]);

  // Parallel-load cart + addresses.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    Promise.all([cartApi.view(), addressesApi.list()])
      .then(([cartResp, addrResp]) => {
        if (cancelled) return;
        setCart(cartResp);
        setAddresses(addrResp);
        const def = addrResp.find((a) => a.isDefault);
        if (def) setSelectedAddressId(def.id);
        else if (addrResp.length > 0) setSelectedAddressId(addrResp[0].id);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            isApiError(err) ? err.displayMessage : "Could not load checkout",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const openAdd = () => {
    setAddForm(emptyAddressForm);
    setAddError(null);
    setShowAddModal(true);
  };

  const closeAdd = () => {
    if (addBusy) return;
    setShowAddModal(false);
    setAddForm(emptyAddressForm);
    setAddError(null);
  };

  const validateAddressForm = (): string | null => {
    if (!addForm.recipientName.trim()) return "Recipient name is required";
    if (!/^\+\d{10,15}$/.test(addForm.phone.trim()))
      return "Phone must be in E.164 format (e.g. +919000000001)";
    if (!addForm.line1.trim()) return "Address line 1 is required";
    if (!addForm.city.trim()) return "City is required";
    if (!/^\d{6}$/.test(addForm.pincode.trim()))
      return "Pincode must be exactly 6 digits";
    return null;
  };

  const handleSaveAddress = useCallback(async () => {
    const err = validateAddressForm();
    if (err) {
      setAddError(err);
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const body: CreateAddressBody = {
        recipientName: addForm.recipientName.trim(),
        phone: addForm.phone.trim(),
        line1: addForm.line1.trim(),
        city: addForm.city.trim(),
        stateCode: addForm.stateCode,
        pincode: addForm.pincode.trim(),
      };
      if (addForm.label.trim()) body.label = addForm.label.trim();
      if (addForm.line2.trim()) body.line2 = addForm.line2.trim();
      const created = await addressesApi.create(body);
      const fresh = await addressesApi.list();
      setAddresses(fresh);
      // Newly-created becomes the selected address (and possibly the default).
      setSelectedAddressId(created.id);
      setShowAddModal(false);
      setAddForm(emptyAddressForm);
    } catch (caught) {
      setAddError(
        isApiError(caught)
          ? caught.displayMessage
          : "Could not save address",
      );
    } finally {
      setAddBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addForm]);

  const handlePlaceOrder = useCallback(async () => {
    if (!selectedAddressId) return;
    setPlacing(true);
    setPlaceError(null);
    setShortages(null);
    try {
      const resp = await checkoutApi.submit({
        addressId: selectedAddressId,
        idempotencyKey,
        ...(cartItemIds ? { cartItemIds } : {}),
      });
      // Save ordered items so the result page can reduce global stock after payment.
      if (cart) {
        const lines = cartItemIds
          ? cart.items.filter((l) => cartItemIds.includes(l.cartItemId))
          : cart.items;
        const orderedItems = lines.map((l) => ({
          variantId: l.variantId,
          slug: l.slug,
          qty: l.qty,
        }));
        try {
          sessionStorage.setItem(
            `cpc_order_${resp.orderId}`,
            JSON.stringify(orderedItems),
          );
        } catch { /* sessionStorage unavailable — skip */ }
      }
      // Order created (PENDING_PAYMENT) → start payment and hand off to the
      // Pine Labs hosted page. If initiation fails, send the user to the order
      // detail page where they can retry payment.
      try {
        const { redirectUrl } = await paymentsApi.initiate(resp.orderId);
        window.location.href = redirectUrl;
        return;
      } catch {
        router.replace(
          `/account/orders/${encodeURIComponent(resp.orderId)}`,
        );
        return;
      }
    } catch (err) {
      if (isApiError(err)) {
        // STOCK_INSUFFICIENT carries a structured shortages list; surface it.
        const shortagesField =
          err.statusCode === 409 && err.code === "STOCK_INSUFFICIENT"
            ? extractShortages(err)
            : null;
        if (shortagesField) setShortages(shortagesField);
        setPlaceError(err.displayMessage);
      } else {
        setPlaceError("Could not place order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  }, [selectedAddressId, idempotencyKey, cartItemIds, router, cart]);

  // What checkout actually displays/orders: the whole cart, or just the
  // Buy-Now lines (with totals + warnings recomputed from those lines).
  const view = useMemo<CartView | null>(() => {
    if (!cart) return null;
    if (!cartItemIds) return cart;
    const selected = new Set(cartItemIds);
    const items = cart.items.filter((l) => selected.has(l.cartItemId));
    return {
      ...cart,
      items,
      subtotal: items.reduce((s, l) => s + l.lineSubtotal, 0),
      discountTotal: items.reduce((s, l) => s + l.discount.total, 0),
      gstTotal: items.reduce((s, l) => s + l.gst.total, 0),
      grandTotal: items.reduce((s, l) => s + l.lineGrandTotal, 0),
      staleApplications: cart.staleApplications.filter((s) =>
        selected.has(s.cartItemId),
      ),
      stockWarnings: cart.stockWarnings.filter((w) =>
        selected.has(w.cartItemId),
      ),
    };
  }, [cart, cartItemIds]);

  const isEmpty = !loading && view !== null && view.items.length === 0;
  const selectedAddress =
    addresses.find((a) => a.id === selectedAddressId) ?? null;

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <Link href="/cart" className="hover:text-[#129cd3]">Cart</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Checkout</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-lg font-bold text-gray-800 mb-5">Checkout</h1>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-40 bg-white rounded-xl border border-gray-200 animate-pulse" />
                <div className="h-56 bg-white rounded-xl border border-gray-200 animate-pulse" />
              </div>
              <div className="h-72 bg-white rounded-xl border border-gray-200 animate-pulse" />
            </div>
          ) : loadError ? (
            <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
              {loadError}
            </div>
          ) : isEmpty ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <AlertTriangle size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-700 mb-1">
                Your cart is empty
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Add a few items to your cart, then come back to check out.
              </p>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                Browse Products
              </Link>
            </div>
          ) : view ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: address + items */}
              <div className="lg:col-span-2 space-y-5">
                {/* Address picker */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                      <MapPin size={16} className="text-[#129cd3]" /> Delivery Address
                    </h2>
                    <button
                      onClick={openAdd}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors"
                    >
                      <Plus size={13} /> Add new
                    </button>
                  </div>

                  {addresses.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-600 mb-3">
                        You haven&apos;t saved any addresses yet.
                      </p>
                      <button
                        onClick={openAdd}
                        className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                      >
                        <Plus size={14} /> Add Delivery Address
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {addresses.map((addr) => {
                        const selected = addr.id === selectedAddressId;
                        return (
                          <label
                            key={addr.id}
                            className={`flex items-start gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-colors ${
                              selected
                                ? "border-[#129cd3] bg-[#e8f7fc]"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="address"
                              checked={selected}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="mt-1 accent-[#129cd3]"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-semibold text-sm text-gray-800">
                                  {addr.recipientName}
                                </p>
                                {addr.label && (
                                  <span className="text-[10px] font-semibold text-[#129cd3] bg-white border border-[#129cd3]/30 px-1.5 py-0.5 rounded-full">
                                    {addr.label}
                                  </span>
                                )}
                                {addr.isDefault && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                                    <CheckCircle size={9} /> Default
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{addr.phone}</p>
                              <p className="text-xs text-gray-600 mt-1">
                                {addr.line1}
                                {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {stateName(addr.stateCode)} – {addr.pincode}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Items review */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-bold text-gray-800 text-sm">
                      Order Items ({view.items.length})
                    </h2>
                    <Link
                      href="/cart"
                      className="text-xs text-[#129cd3] hover:underline"
                    >
                      Edit cart
                    </Link>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {view.items.map((line) => {
                      const discountTotal = line.discount.total;
                      return (
                        <div
                          key={line.cartItemId}
                          className="px-5 py-3 flex items-start gap-3"
                        >
                          <div className="w-12 h-12 bg-gray-100 rounded border border-gray-200 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 line-clamp-1">
                              {line.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {line.qty} × {formatPrice(line.unitPrice)}
                            </p>
                            {discountTotal > 0 && (
                              <p className="text-xs text-green-700 mt-0.5">
                                −{formatPrice(discountTotal)} discount
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                            {formatPrice(line.lineGrandTotal)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {view.staleApplications.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs text-yellow-800 flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <div>
                      Some applied coupons are no longer valid. Open your{" "}
                      <Link href="/cart" className="underline font-semibold">
                        cart
                      </Link>{" "}
                      to review.
                    </div>
                  </div>
                )}

                {view.stockWarnings.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-800 flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <div>
                      One or more items have less stock than your requested quantity.{" "}
                      <Link href="/cart" className="underline font-semibold">
                        Review your cart
                      </Link>{" "}
                      before placing the order.
                    </div>
                  </div>
                )}
              </div>

              {/* Right: summary */}
              <aside className="lg:col-span-1">
                <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
                  <h2 className="font-bold text-gray-800 text-sm mb-4">Order Summary</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="text-gray-800">{formatPrice(view.subtotal)}</span>
                    </div>
                    {view.discountTotal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Discount</span>
                        <span className="text-green-600">
                          −{formatPrice(view.discountTotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">GST</span>
                      <span className="text-gray-800">{formatPrice(view.gstTotal)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-gray-100">
                      <span className="font-bold text-gray-800">Grand Total</span>
                      <span className="font-bold text-lg text-[#129cd3]">
                        {formatPrice(view.grandTotal)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#e8f7fc] rounded-lg px-3 py-2 mt-4 flex items-center gap-2 text-xs text-[#129cd3]">
                    <Truck size={14} />
                    <span>
                      Estimated delivery: <strong>3–5 business days</strong>
                    </span>
                  </div>

                  {placeError && (
                    <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {placeError}
                      {shortages && shortages.length > 0 && (
                        <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px]">
                          {shortages.map((s, idx) => (
                            <li key={idx}>
                              Product needs {s.requested}, only {s.available} in stock
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link
                        href="/cart"
                        className="inline-block mt-2 text-[11px] font-semibold underline"
                      >
                        Go to cart
                      </Link>
                    </div>
                  )}

                  <button
                    onClick={handlePlaceOrder}
                    disabled={
                      placing ||
                      !selectedAddressId ||
                      view.stockWarnings.length > 0
                    }
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors"
                  >
                    {placing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Placing…
                      </>
                    ) : (
                      <>
                        Place Order {selectedAddress ? `(${formatPrice(view.grandTotal)})` : ""}
                      </>
                    )}
                  </button>

                  {!selectedAddressId && (
                    <p className="mt-2 text-[11px] text-gray-500 text-center">
                      Pick a delivery address to continue.
                    </p>
                  )}

                  <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-400">
                    <ShieldCheck size={13} /> Secure Checkout — SSL Encrypted
                  </div>

                  <Link
                    href="/cart"
                    className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors"
                  >
                    <ChevronLeft size={13} /> Back to cart
                  </Link>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </main>
      <Footer />

      {/* Add address modal — minimal inline version. Same shape as /account/addresses. */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeAdd} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">Add Delivery Address</h2>
              <button
                onClick={closeAdd}
                disabled={addBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Label <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Home, Office, etc."
                  value={addForm.label}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
                <input
                  type="text"
                  value={addForm.recipientName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, recipientName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+919000000001"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
                <p className="text-[10px] text-gray-400 mt-1">Include country code, no spaces.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 1</label>
                <input
                  type="text"
                  value={addForm.line1}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, line1: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Address Line 2 <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={addForm.line2}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, line2: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  value={addForm.city}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
                <select
                  value={addForm.stateCode}
                  onChange={(e) =>
                    setAddForm((prev) => ({
                      ...prev,
                      stateCode: e.target.value as StateCode,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 bg-white"
                >
                  {STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={addForm.pincode}
                  onChange={(e) =>
                    setAddForm((prev) => ({
                      ...prev,
                      pincode: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
            </div>

            {addError && (
              <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {addError}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveAddress}
                disabled={addBusy}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {addBusy && <Loader2 size={16} className="animate-spin" />}
                Save Address
              </button>
              <button
                onClick={closeAdd}
                disabled={addBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Best-effort extraction of the shortages list from an ApiError payload.
// Backend returns it on the underlying response body's `shortages` field;
// `ApiError` currently only surfaces statusCode/message, so we look for a
// trailing JSON-ish hint in the message. If the shape isn't there, we just
// show the message verbatim and skip the list.
function extractShortages(err: { messages: string[] }): StockShortage[] | null {
  for (const msg of err.messages) {
    const idx = msg.indexOf("[");
    if (idx === -1) continue;
    try {
      const parsed = JSON.parse(msg.slice(idx)) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as StockShortage[];
      }
    } catch {
      // not JSON
    }
  }
  return null;
}
