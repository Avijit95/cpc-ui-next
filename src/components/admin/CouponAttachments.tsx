"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminCouponRow, ProductCouponSlot } from "@/lib/api";

type AttachmentSnapshot = {
  couponId: string;
  couponName: string;
  value: number;
};

type SlotState = {
  current: AttachmentSnapshot | null;
  selectedCouponId: string;
  valueInput: string;
  busy: boolean;
  error: string | null;
};

const initialSlot: SlotState = {
  current: null,
  selectedCouponId: "",
  valueInput: "",
  busy: false,
  error: null,
};

function attachErrorMessage(err: unknown, slot: ProductCouponSlot): string {
  if (!isApiError(err)) return "Couldn't attach coupon. Try again.";
  switch (err.code) {
    case "COUPON_TYPE_MISMATCH":
      return "That coupon doesn't match this slot's type.";
    case "COUPON_PAUSED":
      return "That coupon is paused. Activate it before attaching.";
    case "COUPON_VALUE_OUT_OF_BOUNDS":
      return slot === "customer"
        ? "Value must be greater than 0."
        : "Value must be between 0 and 100 (percent).";
    case "COUPON_NOT_FOUND":
      return "That coupon was deleted. Refresh the list.";
    case "PRODUCT_NOT_FOUND":
      return "This product no longer exists.";
    default:
      return err.displayMessage || "Couldn't attach coupon.";
  }
}

export default function CouponAttachments({ productId }: { productId: string }) {
  const [coupons, setCoupons] = useState<AdminCouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<SlotState>(initialSlot);
  const [retail, setRetail] = useState<SlotState>(initialSlot);

  const reloadCurrent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) All ACTIVE coupons for the dropdowns.
      const list = await adminApi.listCoupons({
        status: "ACTIVE",
        limit: 100,
      });
      setCoupons(list.items);

      // 2) Find what's currently attached to this product:
      //    fan out getCoupon for any coupon with attachmentCount > 0.
      //    Backend doesn't expose attached-to-product directly (see docs/backend-gaps.md).
      const candidates = list.items.filter((c) => c.attachmentCount > 0);
      const details = await Promise.all(
        candidates.map((c) =>
          adminApi.getCoupon(c.id).catch(() => null),
        ),
      );

      let cur: AttachmentSnapshot | null = null;
      let ret: AttachmentSnapshot | null = null;
      for (const d of details) {
        if (!d) continue;
        const att = d.attachments.find((a) => a.productId === productId);
        if (!att) continue;
        if (d.type === "CUSTOMER_FIXED") {
          cur = { couponId: d.id, couponName: d.name, value: att.value };
        } else if (d.type === "RETAIL_PERCENT") {
          ret = { couponId: d.id, couponName: d.name, value: att.value };
        }
      }
      setCustomer((s) => ({ ...s, current: cur, error: null }));
      setRetail((s) => ({ ...s, current: ret, error: null }));
    } catch (err) {
      setError(
        isApiError(err)
          ? err.displayMessage
          : "Couldn't load coupon attachments.",
      );
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void reloadCurrent();
  }, [reloadCurrent]);

  const customerOptions = useMemo(
    () => coupons.filter((c) => c.type === "CUSTOMER_FIXED"),
    [coupons],
  );
  const retailOptions = useMemo(
    () => coupons.filter((c) => c.type === "RETAIL_PERCENT"),
    [coupons],
  );

  const handleAttach = async (slot: ProductCouponSlot) => {
    const state = slot === "customer" ? customer : retail;
    const setState = slot === "customer" ? setCustomer : setRetail;

    if (!state.selectedCouponId) {
      setState((s) => ({ ...s, error: "Select a coupon to attach." }));
      return;
    }
    const value = Number(state.valueInput);
    if (!Number.isFinite(value)) {
      setState((s) => ({ ...s, error: "Enter a numeric value." }));
      return;
    }
    if (slot === "customer" && value <= 0) {
      setState((s) => ({ ...s, error: "Value must be greater than 0." }));
      return;
    }
    if (slot === "retail" && (value <= 0 || value > 100)) {
      setState((s) => ({
        ...s,
        error: "Value must be between 0 and 100 (percent).",
      }));
      return;
    }

    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const resp = await adminApi.attachProductCoupon(productId, slot, {
        couponId: state.selectedCouponId,
        value,
      });
      setState((s) => ({
        ...s,
        busy: false,
        current: {
          couponId: resp.couponId,
          couponName: resp.couponName,
          value: resp.value,
        },
        selectedCouponId: "",
        valueInput: "",
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: attachErrorMessage(err, slot),
      }));
    }
  };

  const handleDetach = async (slot: ProductCouponSlot) => {
    const setState = slot === "customer" ? setCustomer : setRetail;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await adminApi.detachProductCoupon(productId, slot);
      setState((s) => ({
        ...s,
        busy: false,
        current: null,
        selectedCouponId: "",
        valueInput: "",
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error:
          isApiError(err) && err.displayMessage
            ? err.displayMessage
            : "Couldn't detach coupon.",
      }));
    }
  };

  return (
    <div className="px-6 pb-6">
      <div className="max-w-2xl bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Tag size={16} className="text-[#129cd3]" />
          <h2 className="text-base font-bold text-gray-800">
            Coupon attachments
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Attach one customer coupon (₹ off) and one partner coupon (% off) to
          this product. The discount value is set per-product here.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-[#129cd3]" />
          </div>
        ) : (
          <div className="space-y-5">
            <SlotPanel
              slot="customer"
              label="Customer coupon"
              caption="Flat-rupee discount available to all customers"
              valueLabel="₹ off"
              valuePlaceholder="e.g. 100"
              options={customerOptions}
              state={customer}
              onChange={(patch) => setCustomer((s) => ({ ...s, ...patch }))}
              onAttach={() => handleAttach("customer")}
              onDetach={() => handleDetach("customer")}
            />
            <SlotPanel
              slot="retail"
              label="Partner coupon"
              caption="Percent discount for verified partners only"
              valueLabel="% off"
              valuePlaceholder="0–100"
              options={retailOptions}
              state={retail}
              onChange={(patch) => setRetail((s) => ({ ...s, ...patch }))}
              onAttach={() => handleAttach("retail")}
              onDetach={() => handleDetach("retail")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SlotPanel({
  slot,
  label,
  caption,
  valueLabel,
  valuePlaceholder,
  options,
  state,
  onChange,
  onAttach,
  onDetach,
}: {
  slot: ProductCouponSlot;
  label: string;
  caption: string;
  valueLabel: string;
  valuePlaceholder: string;
  options: AdminCouponRow[];
  state: SlotState;
  onChange: (patch: Partial<SlotState>) => void;
  onAttach: () => void;
  onDetach: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
        <span className="text-[11px] text-gray-400">{valueLabel}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">{caption}</p>

      {state.current && (
        <div className="flex items-center justify-between bg-[#e8f7fc] border border-[#8dd4ee] rounded-lg px-3 py-2 mb-3">
          <div className="text-xs text-gray-700">
            Currently attached:{" "}
            <span className="font-mono font-bold text-[#129cd3]">
              {state.current.couponName}
            </span>
            <span className="text-gray-500">
              {" "}
              at{" "}
              {slot === "customer"
                ? `₹${state.current.value}`
                : `${state.current.value}%`}
            </span>
          </div>
          <button
            type="button"
            onClick={onDetach}
            disabled={state.busy}
            className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {state.busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <X size={11} />
            )}
            Detach
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-7">
          <select
            value={state.selectedCouponId}
            onChange={(e) =>
              onChange({ selectedCouponId: e.target.value, error: null })
            }
            disabled={state.busy}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50"
          >
            <option value="">— Select a coupon —</option>
            {options.length === 0 ? (
              <option disabled value="">
                No active{" "}
                {slot === "customer" ? "customer" : "partner"} coupons
              </option>
            ) : (
              options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="col-span-3">
          <input
            type="number"
            value={state.valueInput}
            onChange={(e) =>
              onChange({ valueInput: e.target.value, error: null })
            }
            placeholder={valuePlaceholder}
            min={slot === "retail" ? 0 : undefined}
            max={slot === "retail" ? 100 : undefined}
            step={slot === "retail" ? "0.01" : "1"}
            disabled={state.busy}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50"
          />
        </div>
        <div className="col-span-2">
          <button
            type="button"
            onClick={onAttach}
            disabled={state.busy || options.length === 0}
            className="w-full inline-flex items-center justify-center gap-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {state.busy && <Loader2 size={12} className="animate-spin" />}
            Attach
          </button>
        </div>
      </div>

      {state.error && (
        <p className="text-xs text-red-600 mt-2">{state.error}</p>
      )}
    </div>
  );
}
