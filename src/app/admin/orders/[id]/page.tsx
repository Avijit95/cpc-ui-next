"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminOrderDetail,
  OrderStatus,
  RefundReason,
  RefundStatus,
  OrderReturn,
  ReturnReason,
  ReturnStatus,
} from "@/lib/api";
import {
  ChevronLeft,
  Loader2,
  X,
  FileText,
  RefreshCw,
  Clock,
  Undo2,
} from "lucide-react";

const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  CANCELLATION: "Cancellation",
  LATE_PAYMENT: "Late payment on cancelled order",
  MANUAL: "Manual",
};

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "Pending",
  SUCCESS: "Refunded",
  FAILED: "Failed",
};

const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item",
  NOT_AS_DESCRIBED: "Not as described",
  DEFECTIVE: "Defective / not working",
  OTHER: "Other",
};

const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PICKED_UP: "Picked up",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
};

const RETURN_STYLE: Record<ReturnStatus, string> = {
  REQUESTED: "bg-orange-50 text-orange-600 border-orange-200",
  APPROVED: "bg-blue-50 text-blue-600 border-blue-200",
  REJECTED: "bg-red-50 text-red-600 border-red-200",
  PICKED_UP: "bg-indigo-50 text-indigo-600 border-indigo-200",
  COMPLETED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  WITHDRAWN: "bg-gray-100 text-gray-600 border-gray-200",
};

type ReturnActionKind = "reject" | "pickup" | "complete";

const RETURN_ACTION_TITLE: Record<ReturnActionKind, string> = {
  reject: "Reject return",
  pickup: "Mark picked up",
  complete: "Receive & refund",
};

const REFUND_STYLE: Record<RefundStatus, string> = {
  PENDING: "bg-amber-50 text-amber-600 border-amber-200",
  SUCCESS: "bg-emerald-50 text-emerald-600 border-emerald-200",
  FAILED: "bg-red-50 text-red-600 border-red-200",
};

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

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Return request actions (approve inline; reject / pickup / receive via dialog).
  const [returnAction, setReturnAction] = useState<{
    kind: ReturnActionKind;
    ret: OrderReturn;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pickupCarrier, setPickupCarrier] = useState("");
  const [pickupNumber, setPickupNumber] = useState("");
  const [pickupUrl, setPickupUrl] = useState("");
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [returnRefund, setReturnRefund] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [approveBusy, setApproveBusy] = useState<string | null>(null);
  const [returnCardError, setReturnCardError] = useState<string | null>(null);

  // Still refundable: what was paid online minus refunds that haven't failed.
  const refundable = order?.paidAt
    ? Math.max(
        0,
        Math.round(
          (order.grandTotal -
            order.refunds
              .filter((r) => r.status !== "FAILED")
              .reduce((sum, r) => sum + r.amount, 0)) *
            100,
        ) / 100,
      )
    : 0;

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
    if (transitionTarget === "SHIPPED") {
      if (!deliveryCode.trim()) {
        setTransitionError("Delivery Code is required to mark the order as Shipped.");
        return;
      }
      if (!deliveryUrl.trim()) {
        setTransitionError("Delivery URL is required to mark the order as Shipped.");
        return;
      }
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

  const openRefund = () => {
    setRefundAmount(refundable.toFixed(2));
    setRefundNote("");
    setRefundError(null);
    setRefundOpen(true);
  };

  const closeRefund = () => {
    if (refundBusy) return;
    setRefundOpen(false);
    setRefundError(null);
  };

  const handleRefund = useCallback(async () => {
    const amount = Math.round(Number(refundAmount) * 100) / 100;
    if (!(amount >= 1)) {
      setRefundError("Enter an amount of at least ₹1.");
      return;
    }
    if (amount > refundable) {
      setRefundError(`Only ${formatPrice(refundable)} can still be refunded.`);
      return;
    }
    if (refundNote.trim().length < 3) {
      setRefundError("Please add a reason (at least 3 characters).");
      return;
    }
    setRefundBusy(true);
    setRefundError(null);
    try {
      const refund = await adminApi.createRefund(id, {
        amount,
        note: refundNote.trim(),
      });
      await refresh();
      if (refund.status === "FAILED") {
        setRefundError(
          `Cashfree rejected the refund: ${refund.failureReason ?? "unknown reason"}`,
        );
      } else {
        setRefundOpen(false);
      }
    } catch (err) {
      setRefundError(
        isApiError(err) ? err.displayMessage : "Could not issue refund",
      );
    } finally {
      setRefundBusy(false);
    }
  }, [id, refundAmount, refundNote, refundable, refresh]);

  const itemName = (orderItemId: string) =>
    order?.items.find((it) => it.id === orderItemId)?.productName ?? "Item";

  const handleApproveReturn = useCallback(
    async (returnId: string) => {
      setApproveBusy(returnId);
      setReturnCardError(null);
      try {
        await adminApi.approveReturn(returnId);
        await refresh();
      } catch (err) {
        setReturnCardError(
          isApiError(err) ? err.displayMessage : "Could not approve return",
        );
      } finally {
        setApproveBusy(null);
      }
    },
    [refresh],
  );

  const openReturnAction = (kind: ReturnActionKind, ret: OrderReturn) => {
    setRejectReason("");
    setPickupCarrier("");
    setPickupNumber("");
    setPickupUrl("");
    setRestock(Object.fromEntries(ret.items.map((it) => [it.id, true])));
    setReturnRefund((ret.maxRefund ?? 0).toFixed(2));
    setReturnError(null);
    setReturnAction({ kind, ret });
  };

  const closeReturnAction = () => {
    if (returnBusy) return;
    setReturnAction(null);
    setReturnError(null);
  };

  const handleReturnAction = useCallback(async () => {
    if (!returnAction) return;
    const { kind, ret } = returnAction;
    const maxRefund = ret.maxRefund ?? 0;
    const amount = Math.round(Number(returnRefund) * 100) / 100;
    if (kind === "reject" && rejectReason.trim().length < 3) {
      setReturnError("Please give the customer a reason (at least 3 characters).");
      return;
    }
    if (kind === "pickup") {
      if (!pickupCarrier.trim() || !pickupNumber.trim()) {
        setReturnError("Courier and tracking number are required.");
        return;
      }
      if (pickupUrl.trim() && !/^https?:\/\//.test(pickupUrl.trim())) {
        setReturnError("Tracking URL must start with http:// or https://");
        return;
      }
    }
    if (kind === "complete" && !(amount >= 0 && amount <= maxRefund)) {
      setReturnError(`Refund must be between ₹0 and ${formatPrice(maxRefund)}.`);
      return;
    }
    setReturnBusy(true);
    setReturnError(null);
    try {
      if (kind === "reject") {
        await adminApi.rejectReturn(ret.id, rejectReason.trim());
      } else if (kind === "pickup") {
        await adminApi.pickupReturn(ret.id, {
          carrier: pickupCarrier.trim(),
          trackingNumber: pickupNumber.trim(),
          trackingUrl: pickupUrl.trim() || undefined,
        });
      } else {
        await adminApi.completeReturn(ret.id, {
          items: ret.items.map((it) => ({
            returnItemId: it.id,
            restock: restock[it.id] ?? false,
          })),
          refundAmount: amount,
        });
      }
      await refresh();
      setReturnAction(null);
    } catch (err) {
      setReturnError(
        isApiError(err) ? err.displayMessage : "Could not update return",
      );
    } finally {
      setReturnBusy(false);
    }
  }, [
    returnAction,
    rejectReason,
    pickupCarrier,
    pickupNumber,
    pickupUrl,
    restock,
    returnRefund,
    refresh,
  ]);

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

            {/* Return requests */}
            {order.returns.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-3">
                  {order.returns.length > 1 ? "Return requests" : "Return request"}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {order.returns.map((r) => (
                    <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">
                          {r.items
                            .map((ri) => `${itemName(ri.orderItemId)} × ${ri.qty}`)
                            .join(", ")}
                        </p>
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${RETURN_STYLE[r.status]}`}
                        >
                          {RETURN_STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Reason: {RETURN_REASON_LABEL[r.reason]}
                        {r.note ? ` — “${r.note}”` : ""}
                      </p>
                      {r.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.photos.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`Return photo ${i + 1}`}
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Requested {formatDateTime(r.createdAt)}
                        {r.approvedAt ? ` · Approved ${formatDateTime(r.approvedAt)}` : ""}
                        {r.pickedUpAt ? ` · Picked up ${formatDateTime(r.pickedUpAt)}` : ""}
                        {r.completedAt ? ` · Completed ${formatDateTime(r.completedAt)}` : ""}
                      </p>
                      {r.pickupTrackingNumber && (
                        <p className="text-xs text-gray-600 mt-1">
                          Pickup: {r.pickupCarrier} {r.pickupTrackingNumber}
                          {r.pickupTrackingUrl && (
                            <>
                              {" · "}
                              <a
                                href={r.pickupTrackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#129cd3] hover:underline"
                              >
                                Track
                              </a>
                            </>
                          )}
                        </p>
                      )}
                      {r.status === "REJECTED" && (
                        <p className="text-xs text-red-600 mt-1">Rejected: {r.rejectReason}</p>
                      )}
                      {r.status === "WITHDRAWN" && (
                        <p className="text-xs text-gray-500 mt-1">
                          Withdrawn by the customer {formatDateTime(r.withdrawnAt)}.
                        </p>
                      )}
                      {r.status === "COMPLETED" && (
                        <p className="text-xs text-gray-600 mt-1">
                          Restocked:{" "}
                          {r.items
                            .map((ri) => `${itemName(ri.orderItemId)} ${ri.restocked ? "yes" : "no"}`)
                            .join(", ")}
                          {" · "}Refund {formatPrice(r.refundAmount ?? 0)}
                          {r.refundStatus ? ` (${REFUND_STATUS_LABEL[r.refundStatus]})` : ""}
                        </p>
                      )}
                      {(r.status === "REQUESTED" ||
                        r.status === "APPROVED" ||
                        r.status === "PICKED_UP") && (
                        <div className="flex flex-wrap justify-end gap-2 mt-3">
                          {(r.status === "REQUESTED" || r.status === "APPROVED") && (
                            <button
                              onClick={() => openReturnAction("reject", r)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
                            >
                              Reject
                            </button>
                          )}
                          {r.status === "REQUESTED" && (
                            <button
                              onClick={() => handleApproveReturn(r.id)}
                              disabled={approveBusy === r.id}
                              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#129cd3] hover:bg-[#0e87b5] px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors"
                            >
                              {approveBusy === r.id && (
                                <Loader2 size={13} className="animate-spin" />
                              )}
                              Approve
                            </button>
                          )}
                          {r.status === "APPROVED" && (
                            <button
                              onClick={() => openReturnAction("pickup", r)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                            >
                              Mark picked up
                            </button>
                          )}
                          {(r.status === "APPROVED" || r.status === "PICKED_UP") && (
                            <button
                              onClick={() => openReturnAction("complete", r)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#129cd3] hover:bg-[#0e87b5] px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors"
                            >
                              Receive &amp; refund
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {returnCardError && (
                  <p className="mt-3 text-xs text-red-600">{returnCardError}</p>
                )}
              </div>
            )}

            {/* Refunds */}
            {(order.paidAt || order.refunds.length > 0) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <h2 className="font-bold text-gray-800 text-sm">Refunds</h2>
                  {refundable > 0 && (
                    <button
                      onClick={openRefund}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Undo2 size={13} />
                      Issue refund
                    </button>
                  )}
                </div>
                {order.refunds.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No refunds yet. Cancelling this order refunds the customer automatically.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {order.refunds.map((r) => (
                      <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">
                            {formatPrice(r.amount)} · {REFUND_REASON_LABEL[r.reason]}
                            {r.note ? ` — “${r.note}”` : ""}
                          </p>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${REFUND_STYLE[r.status]}`}
                          >
                            {REFUND_STATUS_LABEL[r.status]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDateTime(r.processedAt ?? r.createdAt)}
                          {r.bankReference ? ` · Bank ref ${r.bankReference}` : ""}
                          {r.cfRefundId ? ` · Cashfree ref ${r.cfRefundId}` : ""}
                        </p>
                        {r.status === "FAILED" && r.failureReason && (
                          <p className="text-xs text-red-600 mt-1">
                            Cashfree: {r.failureReason}
                          </p>
                        )}
                        {r.creditNote && (
                          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                            <p className="text-xs text-gray-600">
                              Credit note {r.creditNote.number}
                            </p>
                            {r.creditNote.downloadUrl ? (
                              <a
                                href={r.creditNote.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#129cd3] hover:bg-[#0e87b5] px-4 py-2 rounded-lg transition-colors"
                              >
                                <FileText size={13} /> Download
                              </a>
                            ) : (
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <Clock size={14} className="animate-pulse" /> PDF not generated yet.
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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
                    Delivery Code <span className="text-red-500">*</span>
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
                    Delivery URL <span className="text-red-500">*</span>
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

      {returnAction && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !returnBusy && closeReturnAction()}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">
                {RETURN_ACTION_TITLE[returnAction.kind]}
              </h2>
              <button
                onClick={closeReturnAction}
                disabled={returnBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {returnAction.kind === "reject"
                ? "The customer is emailed this reason and the order goes back to Delivered."
                : returnAction.kind === "pickup"
                ? "The customer is emailed these courier details."
                : "Check each item. Items in good condition go back into stock, then the refund starts."}
            </p>

            {returnAction.kind === "reject" && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Shown to the customer"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none"
                />
              </>
            )}

            {returnAction.kind === "pickup" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Courier <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={pickupCarrier}
                    onChange={(e) => setPickupCarrier(e.target.value)}
                    placeholder="e.g. Delhivery"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Tracking # <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={pickupNumber}
                    onChange={(e) => setPickupNumber(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Tracking URL <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={pickupUrl}
                    onChange={(e) => setPickupUrl(e.target.value)}
                    placeholder="https://track.carrier.com/..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
              </div>
            )}

            {returnAction.kind === "complete" && (
              <div className="space-y-3">
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {returnAction.ret.items.map((it) => (
                    <label key={it.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                      <span className="flex-1 text-sm text-gray-800">
                        {itemName(it.orderItemId)} × {it.qty}
                      </span>
                      <input
                        type="checkbox"
                        checked={restock[it.id] ?? false}
                        onChange={(e) =>
                          setRestock((prev) => ({ ...prev, [it.id]: e.target.checked }))
                        }
                        className="accent-[#129cd3]"
                      />
                      <span className="text-xs text-gray-600">Good condition — restock</span>
                    </label>
                  ))}
                </div>
                {(returnAction.ret.maxRefund ?? 0) > 0 ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Refund (₹){" "}
                      <span className="font-normal text-gray-400">
                        (max {formatPrice(returnAction.ret.maxRefund ?? 0)})
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={returnAction.ret.maxRefund}
                      step="0.01"
                      value={returnRefund}
                      onChange={(e) => setReturnRefund(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    This order wasn&apos;t paid online — settle any refund offline.
                  </p>
                )}
              </div>
            )}

            {returnError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {returnError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleReturnAction}
                disabled={returnBusy}
                className={`flex-1 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                  returnAction.kind === "reject"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-[#129cd3] hover:bg-[#0e87b5]"
                }`}
              >
                {returnBusy && <Loader2 size={16} className="animate-spin" />}
                {returnAction.kind === "reject"
                  ? "Reject return"
                  : returnAction.kind === "pickup"
                  ? "Save pickup"
                  : (returnAction.ret.maxRefund ?? 0) > 0
                  ? "Confirm & refund"
                  : "Confirm"}
              </button>
              <button
                onClick={closeReturnAction}
                disabled={returnBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {refundOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !refundBusy && closeRefund()}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">Issue refund</h2>
              <button
                onClick={closeRefund}
                disabled={refundBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Goes back to the customer&apos;s original payment method (5–7 working
              days). Up to {formatPrice(refundable)} can still be refunded.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={refundable}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  placeholder="e.g. Price drop, goodwill (shown on the credit note)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
            </div>
            {refundError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {refundError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleRefund}
                disabled={refundBusy}
                className="flex-1 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5]"
              >
                {refundBusy && <Loader2 size={16} className="animate-spin" />}
                Issue refund
              </button>
              <button
                onClick={closeRefund}
                disabled={refundBusy}
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
