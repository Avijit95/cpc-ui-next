"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, catalogApi, isApiError } from "@/lib/api";
import type {
  Address,
  AdminUserRow,
  CreateAdminOrderItem,
  ListCard,
  ProductDetail,
  Variant,
} from "@/lib/api";
import {
  ChevronLeft,
  Search,
  Loader2,
  CheckCircle2,
  X,
  Plus,
  Package,
} from "lucide-react";

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

type SelectedLine = {
  // A locally-unique key so we can list duplicates of the same variant if
  // the admin really wants them (the backend wouldn't, but UX-wise no need
  // to merge silently).
  uid: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantSku: string | null;
  variantAttributes: Record<string, unknown> | null;
  imageUrl: string | null;
  unitPrice: number;
  stock: number | null;
  qty: number;
};

export default function AdminManualOrderPage() {
  const router = useRouter();

  // ── Customer ──
  const [userInput, setUserInput] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUserRow[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  // ── Address ──
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );

  // ── Product search + variant picker ──
  const [productInput, setProductInput] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ListCard[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [pickingProduct, setPickingProduct] = useState<ProductDetail | null>(
    null,
  );
  const [pickingBusy, setPickingBusy] = useState(false);
  const [pickingVariantId, setPickingVariantId] = useState<string | null>(null);
  const [pickingQty, setPickingQty] = useState(1);

  // ── Lines + submit ──
  const [lines, setLines] = useState<SelectedLine[]>([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Idempotency key — generated once per page mount, reused across retries
  // so a double-click on Place Order can't create two orders.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  // Debounce user search (300ms).
  useEffect(() => {
    const t = window.setTimeout(() => setUserQuery(userInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [userInput]);

  // Run user search when query changes. We deliberately don't clear results
  // synchronously when query goes empty (would trip React 19's
  // set-state-in-effect rule) — the result list is gated on `userQuery`
  // being non-empty at render time.
  useEffect(() => {
    if (!userQuery) return;
    let cancelled = false;
    adminApi
      .listAdminUsers({ q: userQuery, limit: 8 })
      .then((resp) => {
        if (!cancelled) {
          setUserResults(resp.rows);
          setUserLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUserResults([]);
          setUserLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userQuery]);

  // Load addresses when a user is selected. Clearing on deselect happens in
  // the "Change" click handler so this effect can stay free of synchronous
  // setState (React 19 rule).
  useEffect(() => {
    if (!selectedUser) return;
    let cancelled = false;
    adminApi
      .listUserAddresses(selectedUser.id)
      .then((rows) => {
        if (cancelled) return;
        setAddresses(rows);
        const def = rows.find((a) => a.isDefault) ?? rows[0];
        setSelectedAddressId(def?.id ?? null);
        setAddrLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAddresses([]);
          setSelectedAddressId(null);
          setAddrLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  // Debounce product search (300ms).
  useEffect(() => {
    const t = window.setTimeout(() => setProductQuery(productInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [productInput]);

  // Product search. Same React-19 pattern as the user-search effect — list
  // visibility is gated on `productQuery` so we never have to clear results
  // synchronously here.
  useEffect(() => {
    if (!productQuery) return;
    let cancelled = false;
    catalogApi
      .listProducts({ search: productQuery, limit: 8 })
      .then((resp) => {
        if (!cancelled) {
          setProductResults(resp.items);
          setProductLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProductResults([]);
          setProductLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productQuery]);

  const openProductPicker = useCallback(async (card: ListCard) => {
    setPickingBusy(true);
    setPickingProduct(null);
    setPickingVariantId(null);
    setPickingQty(1);
    try {
      const detail = await catalogApi.getProduct(card.slug);
      setPickingProduct(detail);
      if (detail.variants.length === 1) {
        setPickingVariantId(detail.variants[0].id);
      }
    } catch (err) {
      setSubmitError(
        isApiError(err) ? err.displayMessage : "Could not load product",
      );
    } finally {
      setPickingBusy(false);
    }
  }, []);

  const closeProductPicker = () => {
    setPickingProduct(null);
    setPickingVariantId(null);
    setPickingQty(1);
  };

  const addLineFromPicker = () => {
    if (!pickingProduct) return;
    const hasVariants = pickingProduct.variants.length > 0;
    if (hasVariants && !pickingVariantId) {
      setSubmitError("Please pick a variant.");
      return;
    }
    const variant: Variant | null = hasVariants
      ? pickingProduct.variants.find((v) => v.id === pickingVariantId) ?? null
      : null;
    if (hasVariants && !variant) {
      setSubmitError("Please pick a variant.");
      return;
    }
    const unitPrice =
      variant?.pricing.finalPrice ?? pickingProduct.pricing.finalPrice;
    const stock = variant?.stock ?? null;
    if (pickingQty < 1) {
      setSubmitError("Quantity must be at least 1.");
      return;
    }
    if (stock !== null && pickingQty > stock) {
      setSubmitError(`Only ${stock} in stock.`);
      return;
    }
    const imageUrl =
      variant?.images[0]?.url ??
      pickingProduct.images[0]?.url ??
      null;
    setLines((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        productId: pickingProduct.id,
        productName: pickingProduct.name,
        variantId: variant?.id ?? null,
        variantSku: variant?.sku ?? null,
        variantAttributes: variant?.attributes ?? null,
        imageUrl,
        unitPrice,
        stock,
        qty: pickingQty,
      },
    ]);
    setSubmitError(null);
    closeProductPicker();
    setProductInput("");
    setProductQuery("");
    setProductResults([]);
  };

  const updateLineQty = (uid: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.uid !== uid) return l;
        const next = Math.max(1, Math.floor(qty || 1));
        const clamped = l.stock !== null ? Math.min(next, l.stock) : next;
        return { ...l, qty: clamped };
      }),
    );
  };

  const removeLine = (uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  };

  const subtotalEstimate = lines.reduce(
    (sum, l) => sum + l.unitPrice * l.qty,
    0,
  );

  const canSubmit =
    !!selectedUser &&
    !!selectedAddressId &&
    lines.length > 0 &&
    !submitBusy;

  const handleSubmit = useCallback(async () => {
    if (!selectedUser || !selectedAddressId || lines.length === 0) return;
    setSubmitBusy(true);
    setSubmitError(null);
    const body = {
      userId: selectedUser.id,
      addressId: selectedAddressId,
      idempotencyKey,
      items: lines.map<CreateAdminOrderItem>((l) => ({
        productId: l.productId,
        variantId: l.variantId ?? undefined,
        qty: l.qty,
      })),
    };
    try {
      const resp = await adminApi.createOrder(body);
      router.replace(`/admin/orders/${encodeURIComponent(resp.orderId)}`);
    } catch (err) {
      setSubmitError(
        isApiError(err) ? err.displayMessage : "Could not create order",
      );
      setSubmitBusy(false);
    }
  }, [selectedUser, selectedAddressId, lines, idempotencyKey, router]);

  return (
    <>
      <AdminHeader
        title="Manual Order"
        subtitle="Create an order on behalf of a customer — pick user, address, items"
      />

      <div className="p-6 space-y-5">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors"
        >
          <ChevronLeft size={13} /> Back to all orders
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-5">
            {/* Step 1 — Customer */}
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 bg-[#129cd3] text-white text-xs font-bold rounded-full flex items-center justify-center">
                  1
                </span>
                <h3 className="text-sm font-bold text-gray-800">Customer</h3>
              </div>
              {selectedUser ? (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {selectedUser.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {selectedUser.email ?? "—"}
                      {selectedUser.phone ? ` · ${selectedUser.phone}` : ""}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {selectedUser.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setUserInput("");
                      setUserQuery("");
                      setUserResults([]);
                    }}
                    className="text-xs text-gray-500 hover:text-red-500"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 mb-3">
                    <Search size={14} className="text-gray-400" />
                    <input
                      value={userInput}
                      onChange={(e) => {
                        setUserInput(e.target.value);
                        if (e.target.value.trim()) setUserLoading(true);
                      }}
                      placeholder="Search by name, email, or phone"
                      className="bg-transparent outline-none text-sm text-gray-700 flex-1"
                    />
                    {userLoading && (
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                    )}
                  </div>
                  {userQuery && (
                    <ul className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                      {userResults.length === 0 && !userLoading ? (
                        <li className="px-4 py-3 text-xs text-gray-500">
                          No customers match.
                        </li>
                      ) : (
                        userResults.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUser(u);
                                setAddrLoading(true);
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-[#e8f7fc] transition-colors"
                            >
                              <p className="text-sm font-semibold text-gray-800">
                                {u.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {u.email ?? "—"}
                                {u.phone ? ` · ${u.phone}` : ""} · {u.role}
                              </p>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              )}
            </section>

            {/* Step 2 — Address */}
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`w-6 h-6 text-xs font-bold rounded-full flex items-center justify-center ${
                    selectedUser
                      ? "bg-[#129cd3] text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  2
                </span>
                <h3 className="text-sm font-bold text-gray-800">
                  Delivery address
                </h3>
              </div>
              {!selectedUser ? (
                <p className="text-xs text-gray-500">
                  Pick a customer first.
                </p>
              ) : addrLoading ? (
                <div className="space-y-2">
                  <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              ) : addresses.length === 0 ? (
                <p className="text-xs text-gray-500">
                  This customer has no saved addresses. They&apos;ll need to add
                  one before you can place an order on their behalf.
                </p>
              ) : (
                <ul className="space-y-2">
                  {addresses.map((a) => {
                    const active = selectedAddressId === a.id;
                    return (
                      <li key={a.id}>
                        <label
                          className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                            active
                              ? "border-[#129cd3] bg-[#e8f7fc]"
                              : "border-gray-200 hover:border-[#129cd3]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="address"
                            checked={active}
                            onChange={() => setSelectedAddressId(a.id)}
                            className="mt-1 accent-[#129cd3]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <p className="text-sm font-semibold text-gray-800">
                                {a.recipientName}
                              </p>
                              {a.isDefault && (
                                <span className="text-[10px] font-semibold text-[#129cd3] bg-white border border-[#129cd3]/30 px-1.5 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                              {a.label && (
                                <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {a.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600">
                              {a.line1}
                              {a.line2 ? `, ${a.line2}` : ""}, {a.city},{" "}
                              {a.stateCode} {a.pincode}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {a.phone}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Step 3 — Items */}
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`w-6 h-6 text-xs font-bold rounded-full flex items-center justify-center ${
                    selectedUser
                      ? "bg-[#129cd3] text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  3
                </span>
                <h3 className="text-sm font-bold text-gray-800">Items</h3>
              </div>

              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 mb-3">
                <Search size={14} className="text-gray-400" />
                <input
                  value={productInput}
                  onChange={(e) => {
                    setProductInput(e.target.value);
                    if (e.target.value.trim()) setProductLoading(true);
                  }}
                  placeholder="Search products by name or brand"
                  className="bg-transparent outline-none text-sm text-gray-700 flex-1"
                />
                {productLoading && (
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                )}
              </div>
              {productQuery && (
                <ul className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100 mb-4">
                  {productResults.length === 0 && !productLoading ? (
                    <li className="px-4 py-3 text-xs text-gray-500">
                      No products match.
                    </li>
                  ) : (
                    productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => openProductPicker(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#e8f7fc] transition-colors flex items-center gap-3"
                        >
                          <div className="w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                            {p.primaryImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.primaryImageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package
                                size={16}
                                className="text-gray-300 m-3"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {p.brand ?? "—"} · {formatPrice(p.finalPrice)}
                            </p>
                          </div>
                          <Plus size={14} className="text-[#129cd3]" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {lines.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No items added yet. Search above to pick a product.
                </p>
              ) : (
                <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {lines.map((l) => (
                    <li key={l.uid} className="px-3 py-2.5 flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        {l.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package
                            size={18}
                            className="text-gray-300 mx-auto my-3"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {l.productName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {l.variantSku ? `SKU ${l.variantSku} · ` : ""}
                          {formatPrice(l.unitPrice)} each
                          {l.stock !== null ? ` · ${l.stock} in stock` : ""}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={l.stock ?? 99}
                        value={l.qty}
                        onChange={(e) =>
                          updateLineQty(l.uid, parseInt(e.target.value, 10))
                        }
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#129cd3]"
                      />
                      <p className="text-sm font-semibold text-gray-800 w-24 text-right">
                        {formatPrice(l.unitPrice * l.qty)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeLine(l.uid)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                        aria-label="Remove line"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Right rail — summary */}
          <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit lg:sticky lg:top-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-800">Order summary</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Items</span>
                <span>{lines.reduce((s, l) => s + l.qty, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal (est.)</span>
                <span className="font-semibold text-gray-800">
                  {formatPrice(subtotalEstimate)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                GST + shipping are calculated by the server when the order is
                placed.
              </p>
            </div>
            {submitError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {submitError}
              </div>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {submitBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Place order
            </button>
            <p className="text-[11px] text-gray-400 leading-snug">
              Confirmation flips status to <strong>CONFIRMED</strong>{" "}
              immediately — admin manual orders skip payment.
            </p>
          </aside>
        </div>
      </div>

      {/* Variant + qty picker modal */}
      {(pickingBusy || pickingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !pickingBusy && closeProductPicker()}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            {pickingBusy || !pickingProduct ? (
              <div className="py-10 flex items-center justify-center text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading product…
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-800">
                      {pickingProduct.name}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {pickingProduct.brand ?? "—"} ·{" "}
                      {formatPrice(pickingProduct.pricing.finalPrice)}
                    </p>
                  </div>
                  <button
                    onClick={closeProductPicker}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
                  >
                    <X size={18} />
                  </button>
                </div>

                {pickingProduct.variants.length > 0 ? (
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Variant
                    </label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {pickingProduct.variants.map((v) => {
                        const active = pickingVariantId === v.id;
                        const attrs = Object.entries(v.attributes ?? {})
                          .map(([k, val]) => `${k}: ${String(val)}`)
                          .join(" · ");
                        return (
                          <label
                            key={v.id}
                            className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                              active
                                ? "border-[#129cd3] bg-[#e8f7fc]"
                                : "border-gray-200 hover:border-[#129cd3]"
                            } ${v.stock === 0 ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="radio"
                                name="variant"
                                checked={active}
                                disabled={v.stock === 0}
                                onChange={() => setPickingVariantId(v.id)}
                                className="accent-[#129cd3]"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">
                                  {v.sku}
                                </p>
                                {attrs && (
                                  <p className="text-[11px] text-gray-500 truncate">
                                    {attrs}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-gray-800">
                                {formatPrice(v.pricing.finalPrice)}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {v.stock === 0
                                  ? "Out of stock"
                                  : `${v.stock} in stock`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pickingQty}
                    onChange={(e) =>
                      setPickingQty(
                        Math.max(1, parseInt(e.target.value, 10) || 1),
                      )
                    }
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addLineFromPicker}
                    className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Add to order
                  </button>
                  <button
                    type="button"
                    onClick={closeProductPicker}
                    className="border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
