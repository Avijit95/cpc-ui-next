"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminOrderDetail, OrderStatus } from "@/lib/api";
import {
  ChevronLeft,
  Loader2,
  X,
  FileText,
  RefreshCw,
  Clock,
} from "lucide-react";

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

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-gray-100 text-gray-600 border-gray-200",
  CONFIRMED: "bg-blue-50 text-blue-600 border-blue-200",
  PROCESSING: "bg-amber-50 text-amber-600 border-amber-200",
  SHIPPED: "bg-indigo-50 text-indigo-600 border-indigo-200",
  DELIVERED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 border-red-200",
  RETURN_REQUESTED: "bg-orange-50 text-orange-600 border-orange-200",
  RETURNED: "bg-gray-200 text-gray-700 border-gray-300",
};

// Tone for the action button per target status.
const TRANSITION_BUTTON_TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-gray-500 hover:bg-gray-600",
  CONFIRMED: "bg-blue-500 hover:bg-blue-600",
  PROCESSING: "bg-amber-500 hover:bg-amber-600",
  SHIPPED: "bg-indigo-500 hover:bg-indigo-600",
  DELIVERED: "bg-emerald-500 hover:bg-emerald-600",
  CANCELLED: "bg-red-500 hover:bg-red-600",
  RETURN_REQUESTED: "bg-orange-500 hover:bg-orange-600",
  RETURNED: "bg-gray-700 hover:bg-gray-800",
};

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
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

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transitionTarget, setTransitionTarget] = useState<OrderStatus | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [regenBusy, setRegenBusy] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getOrder(id)
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
  }, [id]);

  const refresh = useCallback(async () => {
    try {
      const data = await adminApi.getOrder(id);
      setOrder(data);
    } catch {
      // Best-effort refresh.
    }
  }, [id]);

  const openTransition = (target: OrderStatus) => {
    setTransitionTarget(target);
    setTransitionNote("");
    setDeliveryCode("");
    setDeliveryUrl("");
    setTransitionError(null);
  };

  const closeTransition = () => {
    if (transitionBusy) return;
    setTransitionTarget(null);
    setTransitionNote("");
    setDeliveryCode("");
    setDeliveryUrl("");
    setTransitionError(null);
  };

  const noteRequired = transitionTarget === "CANCELLED";

  const handleTransition = useCallback(async () => {
    if (!transitionTarget) return;
    if (noteRequired && !transitionNote.trim()) {
      setTransitionError("Please add a reason for cancellation.");
      return;
    }
    setTransitionBusy(true);
    setTransitionError(null);
    try {
      const body =
        transitionTarget === "SHIPPED"
          ? {
              toStatus: transitionTarget,
              deliveryCode: deliveryCode.trim() || undefined,
              deliveryUrl: deliveryUrl.trim() || undefined,
            }
          : {
              toStatus: transitionTarget,
              note: transitionNote.trim() || undefined,
            };
      await adminApi.patchOrderStatus(id, body);
      await refresh();
      setTransitionTarget(null);
      setTransitionNote("");
      setDeliveryCode("");
      setDeliveryUrl("");
    } catch (err) {
      setTransitionError(
        isApiError(err) ? err.displayMessage : "Could not update status",
      );
    } finally {
      setTransitionBusy(false);
    }
  }, [id, transitionTarget, transitionNote, deliveryCode, deliveryUrl, noteRequired, refresh]);

  const handleRegenerate = useCallback(async () => {
    setRegenBusy(true);
    setRegenMessage(null);
    try {
      await adminApi.regenerateInvoice(id);
      setRegenMessage("Invoice regeneration queued. Refresh in a few seconds.");
      // Poll once after a short delay so the new downloadUrl tends to land
      // on screen without manual refresh.
      setTimeout(() => {
        void refresh();
      }, 2500);
    } catch (err) {
      setRegenMessage(
        isApiError(err) ? err.displayMessage : "Could not regenerate invoice",
      );
    } finally {
      setRegenBusy(false);
    }
  }, [id, refresh]);

  return (
    <>
      <AdminHeader
        title="Order detail"
        subtitle={order?.orderNumber ?? "Loading…"}
      />

      <div className="p-6 space-y-5">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors"
        >
          <ChevronLeft size={13} /> Back to all orders
        </Link>

        {loading ? (
          <div className="space-y-4">
            <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
            <div className="h-56 bg-white rounded-xl border border-gray-200 animate-pulse" />
            <div className="h-32 bg-white rounded-xl border border-gray-200 animate-pulse" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
            {error}
          </div>
        ) : !order ? null : (
          <>
            {/* Header / actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-lg font-bold text-gray-800">
                    {order.orderNumber}
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Placed {formatDateTime(order.createdAt)} · by{" "}
                    <span className="font-semibold text-gray-700">
                      {order.user.name}
                    </span>{" "}
                    ({order.user.email ?? order.user.phone ?? "—"})
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLE[order.status]}`}
                >
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              {order.legalTransitions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {order.legalTransitions.map((t) => (
                    <button
                      key={t}
                      onClick={() => openTransition(t)}
                      className={`text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors ${TRANSITION_BUTTON_TONE[t]}`}
                    >
                      Move to {STATUS_LABEL[t]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  No state transitions available from <strong>{STATUS_LABEL[order.status]}</strong>.
                </p>
              )}

              {order.status === "CANCELLED" && order.cancelReason && (
                <div className="mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <strong>Cancel reason:</strong> {order.cancelReason}
                </div>
              )}
              {order.status === "RETURN_REQUESTED" && (
                <div className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  <strong>Return requested</strong> on {formatDateTime(order.returnRequestedAt)}
                  {order.returnReason ? ` · reason: ${order.returnReason}` : ""}
                  {order.returnReasonNote ? ` · ${order.returnReasonNote}` : ""}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-sm">Items</h2>
              </div>
              <div className="overflow-x-auto">
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
                            {it.variantSku && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                SKU: {it.variantSku}
                              </div>
                            )}
                            <div className="text-[10px] text-gray-400">HSN {it.hsnCode}</div>
                          </td>
                          <td className="px-5 py-3 text-center text-gray-600">{it.qty}</td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatPrice(it.unitPrice)}
                          </td>
                          <td className="px-5 py-3 text-right text-green-600">
                            {discount > 0 ? `−${formatPrice(discount)}` : "—"}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatPrice(it.gstAmount)}
                            <div className="text-[10px] text-gray-400">
                              {it.gstRatePercent}%
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-800">
                            {formatPrice(it.lineGrandTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shipping + totals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3">Ship To</h2>
                <p className="text-sm font-semibold text-gray-800">{order.recipientName}</p>
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
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h2 className="font-bold text-gray-800 text-sm">Invoice</h2>
                <button
                  onClick={handleRegenerate}
                  disabled={regenBusy}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  {regenBusy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Regenerate
                </button>
              </div>
              {!order.invoice ? (
                <p className="text-xs text-gray-500">
                  No invoice row yet. Try regenerating to enqueue the worker.
                </p>
              ) : order.invoice.downloadUrl ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {order.invoice.invoiceNumber}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Generated {formatDateTime(order.invoice.generatedAt)} · link valid ~5 min
                    </p>
                  </div>
                  <a
                    href={order.invoice.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#129cd3] hover:bg-[#0e87b5] px-4 py-2 rounded-lg transition-colors"
                  >
                    <FileText size={13} /> Download
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Clock size={14} className="animate-pulse" /> PDF not generated yet.
                </div>
              )}
              {regenMessage && (
                <p className="mt-3 text-xs text-gray-600">{regenMessage}</p>
              )}
            </div>

            {/* Status history */}
            {order.statusHistory.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3">Status History</h2>
                <ol className="space-y-2.5 text-xs">
                  {order.statusHistory.map((h, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-gray-700">
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

      {/* Transition modal */}
      {transitionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !transitionBusy && closeTransition()}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">
                Move to {STATUS_LABEL[transitionTarget]}?
              </h2>
              <button
                onClick={closeTransition}
                disabled={transitionBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {transitionTarget === "CANCELLED"
                ? "This will cancel the order and restore stock on every line."
                : transitionTarget === "RETURNED"
                ? "This marks the return complete and restores stock on every line."
                : transitionTarget === "DELIVERED"
                ? "This starts the customer's 7-day return window."
                : `Update the order status to ${STATUS_LABEL[transitionTarget]}.`}
            </p>
            {transitionTarget === "SHIPPED" ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Delivery Code <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={deliveryCode}
                    onChange={(e) => setDeliveryCode(e.target.value)}
                    placeholder="e.g. 1234567890"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Delivery URL <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={deliveryUrl}
                    onChange={(e) => setDeliveryUrl(e.target.value)}
                    placeholder="https://track.carrier.com/..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Note{" "}
                  <span className="font-normal text-gray-400">
                    {noteRequired ? "(required)" : "(optional)"}
                  </span>
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={transitionNote}
                  onChange={(e) => setTransitionNote(e.target.value)}
                  placeholder={
                    noteRequired
                      ? "Reason for cancellation (shown to customer)"
                      : "Internal note for the status history"
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none"
                />
              </>
            )}
            {transitionError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {transitionError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleTransition}
                disabled={transitionBusy}
                className={`flex-1 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${TRANSITION_BUTTON_TONE[transitionTarget]}`}
              >
                {transitionBusy && <Loader2 size={16} className="animate-spin" />}
                Confirm
              </button>
              <button
                onClick={closeTransition}
                disabled={transitionBusy}
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
