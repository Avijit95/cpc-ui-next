"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isApiError, ordersApi, paymentsApi } from "@/lib/api";
import type { OrderDetail, OrderStatus, ReturnReason } from "@/lib/api";
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  MapPin,
  User,
  Headphones,
  LogOut,
  ChevronRight,
  ChevronLeft,
  FileText,
  XCircle,
  Undo2,
  Loader2,
  X,
  Clock,
} from "lucide-react";

type SidebarItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const sidebarItems: SidebarItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, href: "/account" },
  { key: "orders", label: "Orders", icon: <ShoppingBag size={18} />, href: "/account/orders" },
  { key: "wishlist", label: "Wishlist", icon: <Heart size={18} />, href: "/wishlist" },
  { key: "addresses", label: "Addresses", icon: <MapPin size={18} />, href: "/account/addresses" },
  { key: "profile", label: "Profile", icon: <User size={18} />, href: "/account/profile" },
  { key: "support", label: "Support", icon: <Headphones size={18} />, href: "/account/support" },
  { key: "logout", label: "Logout", icon: <LogOut size={18} />, href: "/login" },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending Payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return Requested",
  RETURNED: "Returned",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURNED: "bg-gray-200 text-gray-700",
};

const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "DAMAGED", label: "Item arrived damaged" },
  { value: "WRONG_ITEM", label: "Received the wrong item" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "OTHER", label: "Other (please explain)" },
];

const RETURN_WINDOW_DAYS = 7;
const INVOICE_POLL_INTERVAL_MS = 1500;
const INVOICE_POLL_MAX_ATTEMPTS = 20; // ~30s

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function canCancel(s: OrderStatus): boolean {
  return s === "PENDING_PAYMENT" || s === "CONFIRMED";
}

function canRequestReturn(order: OrderDetail): boolean {
  if (order.status !== "DELIVERED") return false;
  if (!order.deliveredAt) return false;
  const delivered = new Date(order.deliveredAt).getTime();
  const days = (Date.now() - delivered) / (1000 * 60 * 60 * 24);
  return days <= RETURN_WINDOW_DAYS;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, status } = useAuth();

  const id = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState<ReturnReason>("DAMAGED");
  const [returnNote, setReturnNote] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=/account/orders/${encodeURIComponent(id)}`);
    }
  }, [status, id, router]);

  // Manual re-fetch for after mutations (cancel/return). Doesn't touch loading.
  const fetchOrder = useCallback(async () => {
    try {
      const data = await ordersApi.get(id);
      setOrder(data);
      setError(null);
      return data;
    } catch (err) {
      setError(
        isApiError(err) ? err.displayMessage : "Could not load order",
      );
      return null;
    }
  }, [id]);

  // Initial fetch — inline (not via fetchOrder) so the React 19
  // react-hooks/set-state-in-effect lint doesn't trip on the indirect setState.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    ordersApi
      .get(id)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load order",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, id]);

  // Poll for invoice URL when it's not yet ready.
  useEffect(() => {
    if (!order) return;
    if (!order.invoice) return;
    if (order.invoice.downloadUrl) return;

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      attempts += 1;
      if (attempts > INVOICE_POLL_MAX_ATTEMPTS) return;
      ordersApi
        .get(id)
        .then((fresh) => {
          setOrder(fresh);
          if (!fresh.invoice?.downloadUrl) {
            timer = setTimeout(tick, INVOICE_POLL_INTERVAL_MS);
          }
        })
        .catch(() => {
          // Silently stop polling on error.
        });
    };
    timer = setTimeout(tick, INVOICE_POLL_INTERVAL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [order, id]);

  const handleCancel = useCallback(async () => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      const body = cancelReason.trim()
        ? { reason: cancelReason.trim() }
        : undefined;
      await ordersApi.cancel(id, body);
      // Re-fetch full detail so status history + cancelledAt populate.
      await fetchOrder();
      setShowCancel(false);
      setCancelReason("");
    } catch (err) {
      setCancelError(
        isApiError(err) ? err.displayMessage : "Could not cancel order",
      );
    } finally {
      setCancelBusy(false);
    }
  }, [id, cancelReason, fetchOrder]);

  const handleCompletePayment = useCallback(async () => {
    setPayBusy(true);
    setPayError(null);
    try {
      const { redirectUrl } = await paymentsApi.initiate(id);
      window.location.href = redirectUrl;
    } catch (err) {
      setPayError(
        isApiError(err) ? err.displayMessage : "Could not start payment",
      );
      setPayBusy(false);
    }
  }, [id]);

  const handleReturn = useCallback(async () => {
    if (returnReason === "OTHER" && !returnNote.trim()) {
      setReturnError("Please explain why you're returning this order");
      return;
    }
    setReturnBusy(true);
    setReturnError(null);
    try {
      await ordersApi.returnRequest(id, {
        reason: returnReason,
        note: returnNote.trim() || undefined,
      });
      await fetchOrder();
      setShowReturn(false);
      setReturnNote("");
    } catch (err) {
      setReturnError(
        isApiError(err) ? err.displayMessage : "Could not request return",
      );
    } finally {
      setReturnBusy(false);
    }
  }, [id, returnReason, returnNote, fetchOrder]);

  const userName = user?.name ?? "Account";
  const userContact = user?.email ?? user?.phone ?? "";
  const userInitial = (user?.name?.[0] ?? "A").toUpperCase();

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <Link href="/account" className="hover:text-[#129cd3]">My Account</Link>
            <ChevronRight size={12} />
            <Link href="/account/orders" className="hover:text-[#129cd3]">Orders</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">
              {order?.orderNumber ?? "Order"}
            </span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#129cd3] px-5 py-5 text-white">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2">
                  <span className="text-[#129cd3] font-bold text-lg">{userInitial}</span>
                </div>
                <p className="font-semibold">{userName}</p>
                <p className="text-[#b8e8f5] text-xs">{userContact}</p>
              </div>
              <nav className="py-2">
                {sidebarItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      item.key === "orders"
                        ? "bg-[#e8f7fc] text-[#129cd3] border-r-4 border-[#129cd3]"
                        : item.key === "logout"
                        ? "text-red-500 hover:bg-red-50"
                        : "text-gray-600 hover:bg-gray-50 hover:text-[#129cd3]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1 space-y-5">
            <Link
              href="/account/orders"
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors"
            >
              <ChevronLeft size={13} /> Back to all orders
            </Link>

            {loading ? (
              <div className="space-y-4">
                <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
                <div className="h-48 bg-white rounded-xl border border-gray-200 animate-pulse" />
                <div className="h-32 bg-white rounded-xl border border-gray-200 animate-pulse" />
              </div>
            ) : error ? (
              <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
                {error}
              </div>
            ) : !order ? null : (
              <>
                {/* Summary */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h1 className="text-lg font-bold text-gray-800">
                        Order {order.orderNumber}
                      </h1>
                      <p className="text-xs text-gray-500 mt-1">
                        Placed on {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canCancel(order.status) && (
                      <button
                        onClick={() => {
                          setShowCancel(true);
                          setCancelError(null);
                        }}
                        className="flex items-center gap-1.5 text-xs text-red-500 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <XCircle size={13} /> Cancel Order
                      </button>
                    )}
                    {canRequestReturn(order) && (
                      <button
                        onClick={() => {
                          setShowReturn(true);
                          setReturnError(null);
                        }}
                        className="flex items-center gap-1.5 text-xs text-orange-600 border border-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        <Undo2 size={13} /> Request Return
                      </button>
                    )}
                  </div>

                  {order.status === "RETURN_REQUESTED" && (
                    <div className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      Return requested on {formatDateTime(order.returnRequestedAt)}. We&apos;ll review and update the order shortly.
                    </div>
                  )}
                  {order.status === "CANCELLED" && (
                    <div className="mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      Cancelled on {formatDateTime(order.cancelledAt)}
                      {order.cancelReason ? ` · ${order.cancelReason}` : ""}.
                    </div>
                  )}
                  {order.status === "PENDING_PAYMENT" && (
                    <div className="mt-3 bg-[#e8f7fc] border border-[#129cd3]/30 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-700 mb-2">
                        This order is awaiting payment. Complete it to confirm
                        your order.
                      </p>
                      <button
                        onClick={handleCompletePayment}
                        disabled={payBusy}
                        className="flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                      >
                        {payBusy && <Loader2 size={15} className="animate-spin" />}
                        Complete Payment
                      </button>
                      {payError && (
                        <p className="text-xs text-red-600 mt-2">{payError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800 text-sm">Items</h2>
                  </div>
                  {/* Table — sm and above */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
                          <th className="text-left px-5 py-3">Product</th>
                          <th className="text-center px-5 py-3">Qty</th>
                          <th className="text-right px-5 py-3">Unit Price</th>
                          <th className="text-right px-5 py-3">Discount</th>
                          <th className="text-right px-5 py-3">GST</th>
                          <th className="text-right px-5 py-3">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((it, idx) => {
                          const discount = it.customerDiscount + it.retailDiscount;
                          return (
                            <tr key={idx} className="border-t border-gray-100">
                              <td className="px-5 py-3 text-gray-800">
                                <div className="font-medium">{it.productName}</div>
                                {it.variantSku && <div className="text-xs text-gray-500 mt-0.5">SKU: {it.variantSku}</div>}
                                {(it.customerCouponName || it.retailCouponName) && (
                                  <div className="text-xs text-green-700 mt-0.5">
                                    {it.customerCouponName}{it.customerCouponName && it.retailCouponName ? " + " : null}{it.retailCouponName}
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-3 text-center text-gray-600">{it.qty}</td>
                              <td className="px-5 py-3 text-right text-gray-600">{formatPrice(it.unitPrice)}</td>
                              <td className="px-5 py-3 text-right text-green-600">{discount > 0 ? `−${formatPrice(discount)}` : "—"}</td>
                              <td className="px-5 py-3 text-right text-gray-600">
                                {formatPrice(it.gstAmount)}
                                <div className="text-[10px] text-gray-400">{it.gstRatePercent}%</div>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatPrice(it.lineGrandTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards — below sm */}
                  <div className="sm:hidden divide-y divide-gray-100">
                    {order.items.map((it, idx) => {
                      const discount = it.customerDiscount + it.retailDiscount;
                      return (
                        <div key={idx} className="px-4 py-3 text-xs">
                          <p className="font-semibold text-gray-800 text-sm">{it.productName}</p>
                          {it.variantSku && <p className="text-gray-400 mt-0.5">SKU: {it.variantSku}</p>}
                          {(it.customerCouponName || it.retailCouponName) && (
                            <p className="text-green-700 mt-0.5">
                              {it.customerCouponName}{it.customerCouponName && it.retailCouponName ? " + " : null}{it.retailCouponName}
                            </p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                            <span className="text-gray-400 uppercase font-semibold">Qty</span>
                            <span className="text-right">{it.qty}</span>
                            <span className="text-gray-400 uppercase font-semibold">Unit Price</span>
                            <span className="text-right">{formatPrice(it.unitPrice)}</span>
                            {discount > 0 && <>
                              <span className="text-gray-400 uppercase font-semibold">Discount</span>
                              <span className="text-right text-green-600">−{formatPrice(discount)}</span>
                            </>}
                            <span className="text-gray-400 uppercase font-semibold">GST ({it.gstRatePercent}%)</span>
                            <span className="text-right">{formatPrice(it.gstAmount)}</span>
                            <span className="text-gray-400 uppercase font-semibold border-t border-gray-100 pt-1">Total</span>
                            <span className="text-right font-bold text-gray-800 border-t border-gray-100 pt-1">{formatPrice(it.lineGrandTotal)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Shipping Address + Pricing breakdown side-by-side on lg */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Shipping address */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="font-bold text-gray-800 text-sm mb-3">Shipping Address</h2>
                    <p className="text-sm font-semibold text-gray-800">
                      {order.recipientName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{order.recipientPhone}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      {order.addressSnapshot.line1}
                      {order.addressSnapshot.line2 ? (
                        <>
                          ,<br />
                          {order.addressSnapshot.line2}
                        </>
                      ) : null}
                      ,<br />
                      {order.addressSnapshot.city}, {order.recipientStateCode} – {order.addressSnapshot.pincode}
                    </p>
                  </div>

                  {/* Totals */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="font-bold text-gray-800 text-sm mb-3">Payment Summary</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="text-gray-800">{formatPrice(order.subtotal)}</span>
                      </div>
                      {order.discountTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Discount</span>
                          <span className="text-green-600">
                            −{formatPrice(order.discountTotal)}
                          </span>
                        </div>
                      )}
                      {order.cgstTotal > 0 || order.sgstTotal > 0 ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">CGST</span>
                            <span className="text-gray-800">{formatPrice(order.cgstTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">SGST</span>
                            <span className="text-gray-800">{formatPrice(order.sgstTotal)}</span>
                          </div>
                        </>
                      ) : order.igstTotal > 0 ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">IGST</span>
                          <span className="text-gray-800">{formatPrice(order.igstTotal)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Shipping</span>
                        <span className="text-gray-800">
                          {order.shippingTotal === 0
                            ? "FREE"
                            : formatPrice(order.shippingTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-3 border-t border-gray-100">
                        <span className="font-bold text-gray-800">Grand Total</span>
                        <span className="font-bold text-[#129cd3]">
                          {formatPrice(order.grandTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invoice */}
                <div id="invoice" className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-bold text-gray-800 text-sm mb-3">Invoice</h2>
                  {!order.invoice ? (
                    <p className="text-xs text-gray-500">
                      An invoice will be generated once payment is confirmed.
                    </p>
                  ) : order.invoice.downloadUrl ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {order.invoice.invoiceNumber}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Generated {formatDateTime(order.invoice.generatedAt)} · link valid for ~5 min
                        </p>
                      </div>
                      <a
                        href={order.invoice.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#129cd3] hover:bg-[#0e87b5] px-4 py-2 rounded-lg transition-colors"
                      >
                        <FileText size={13} /> Download Invoice
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Clock size={14} className="animate-pulse" /> Invoice is being generated…
                    </div>
                  )}
                </div>

                {/* Status history */}
                {order.statusHistory.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="font-bold text-gray-800 text-sm mb-3">Status History</h2>
                    <ol className="space-y-2.5 text-xs">
                      {order.statusHistory.map((h, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-3 text-gray-700"
                        >
                          <span className="w-1.5 h-1.5 bg-[#129cd3] rounded-full" />
                          <span className="text-gray-500 whitespace-nowrap">
                            {formatDateTime(h.createdAt)}
                          </span>
                          <span>
                            {h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ""}
                            <span className="font-medium">{STATUS_LABEL[h.toStatus]}</span>
                          </span>
                          {h.note && <span className="text-gray-400">· {h.note}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !cancelBusy && setShowCancel(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">Cancel Order?</h2>
              <button
                onClick={() => setShowCancel(false)}
                disabled={cancelBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              The order will be cancelled and stock restored. This can&apos;t be undone.
            </p>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Reason <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Help us understand why…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none"
            />
            {cancelError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {cancelError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCancel}
                disabled={cancelBusy}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {cancelBusy && <Loader2 size={16} className="animate-spin" />}
                Cancel Order
              </button>
              <button
                onClick={() => setShowCancel(false)}
                disabled={cancelBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Keep Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !returnBusy && setShowReturn(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">Request Return</h2>
              <button
                onClick={() => setShowReturn(false)}
                disabled={returnBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Returns are accepted within {RETURN_WINDOW_DAYS} days of delivery. We&apos;ll review your request and follow up.
            </p>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Reason</label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 bg-white mb-4"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Note{" "}
              <span className="font-normal text-gray-400">
                {returnReason === "OTHER" ? "(required)" : "(optional)"}
              </span>
            </label>
            <textarea
              rows={3}
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Describe the issue…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none"
            />
            {returnError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {returnError}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleReturn}
                disabled={returnBusy}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {returnBusy && <Loader2 size={16} className="animate-spin" />}
                Submit Request
              </button>
              <button
                onClick={() => setShowReturn(false)}
                disabled={returnBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
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
