"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Percent,
  Calendar,
  Loader2,
  X,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminCouponRow,
  CouponStatus,
  CouponType,
  CreateCouponBody,
  UpdateCouponBody,
} from "@/lib/api";

type Tab = "rules" | "coupons" | "campaigns";

const statusCls: Record<CouponStatus | "Expired" | "Live" | "Scheduled" | "Draft", string> = {
  ACTIVE: "bg-emerald-50 text-emerald-600 border-emerald-200",
  PAUSED: "bg-gray-100 text-gray-600 border-gray-200",
  // Legacy entries kept so the same table can render mocks for the disabled tabs.
  Expired: "bg-red-50 text-red-600 border-red-200",
  Live: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Scheduled: "bg-blue-50 text-blue-600 border-blue-200",
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
};

function typeLabel(t: CouponType): string {
  return t === "CUSTOMER_FIXED" ? "₹ off" : "% off";
}

function statusLabel(s: CouponStatus): string {
  return s === "ACTIVE" ? "Active" : "Paused";
}

function deleteErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Couldn't delete the coupon. Try again.";
  switch (err.code) {
    case "COUPON_HAS_ATTACHMENTS":
      return "This coupon is attached to one or more products. Detach it from each product first.";
    case "COUPON_NOT_FOUND":
      return "This coupon no longer exists. Refresh the list.";
    default:
      return err.displayMessage || "Couldn't delete the coupon.";
  }
}

function saveErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "COUPON_NAME_TAKEN":
      return "That name is already in use. Pick a different one.";
    case "COUPON_TYPE_IMMUTABLE":
      return "Type can't be changed once a coupon is created.";
    case "COUPON_NOT_FOUND":
      return "This coupon no longer exists. Refresh the list.";
    default:
      return err.displayMessage || "Couldn't save the coupon.";
  }
}

export default function PricingPage() {
  const [tab, setTab] = useState<Tab>("coupons");

  const [items, setItems] = useState<AdminCouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminCouponRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminCouponRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await adminApi.listCoupons({ limit: 100 });
      setItems(resp.items);
    } catch (err) {
      setError(
        isApiError(err)
          ? err.displayMessage
          : "Couldn't load coupons. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCount = items.length;
  const activeCount = useMemo(
    () => items.filter((c) => c.status === "ACTIVE").length,
    [items],
  );
  const pausedCount = useMemo(
    () => items.filter((c) => c.status === "PAUSED").length,
    [items],
  );

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await adminApi.deleteCoupon(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch (err) {
      setDeleteError(deleteErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Pricing & Discounts"
        subtitle="Manage global pricing rules, coupon codes and timed campaigns"
        actions={
          tab === "coupons" ? (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={14} /> New coupon
            </button>
          ) : null
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatCard
            icon={<Tag size={20} />}
            iconBg="bg-[#e8f7fc] text-[#129cd3]"
            label="Total coupons"
            value={loading ? "…" : String(totalCount)}
          />
          <StatCard
            icon={<Percent size={20} />}
            iconBg="bg-amber-100 text-amber-600"
            label="Active"
            value={loading ? "…" : String(activeCount)}
          />
          <StatCard
            icon={<Calendar size={20} />}
            iconBg="bg-purple-100 text-purple-600"
            label="Paused"
            value={loading ? "…" : String(pausedCount)}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2">
            {(["rules", "coupons", "campaigns"] as Tab[]).map((t) => {
              const disabled = t !== "coupons";
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => !disabled && setTab(t)}
                  disabled={disabled}
                  title={disabled ? "Coming in Sprint 4+" : undefined}
                  className={`px-5 py-3.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    active
                      ? "border-[#129cd3] text-[#129cd3]"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  } ${disabled ? "opacity-50 cursor-not-allowed hover:text-gray-500" : ""}`}
                >
                  {t === "rules"
                    ? "Pricing rules"
                    : t === "coupons"
                    ? "Coupons"
                    : "Campaigns"}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            {error && (
              <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Code</th>
                  <th className="text-left font-semibold px-5 py-3">Type</th>
                  <th className="text-left font-semibold px-5 py-3">Value</th>
                  <th className="text-left font-semibold px-5 py-3">Min Order</th>
                  <th className="text-left font-semibold px-5 py-3">Usage</th>
                  <th className="text-left font-semibold px-5 py-3">Expires</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
                      No coupons yet. Click <span className="font-semibold">New coupon</span> to create your first one.
                    </td>
                  </tr>
                ) : (
                  items.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-[#129cd3] bg-[#e8f7fc] px-2 py-1 rounded text-xs">
                          {c.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{typeLabel(c.type)}</td>
                      <td className="px-5 py-3 text-gray-400">—</td>
                      <td className="px-5 py-3 text-gray-400">—</td>
                      <td className="px-5 py-3 text-gray-400">—</td>
                      <td className="px-5 py-3 text-gray-400">—</td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCls[c.status]}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(c)}
                            className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDelete(c);
                            }}
                            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {creating && (
        <CouponModal
          mode={{ kind: "create" }}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {editing && (
        <CouponModal
          mode={{ kind: "edit", coupon: editing }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          coupon={confirmDelete}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) {
              setConfirmDelete(null);
              setDeleteError(null);
            }
          }}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3 bg-gray-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

type ModalMode =
  | { kind: "create" }
  | { kind: "edit"; coupon: AdminCouponRow };

function CouponModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: ModalMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.coupon : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<CouponType>(editing?.type ?? "CUSTOMER_FIXED");
  const [status, setStatus] = useState<CouponStatus>(editing?.status ?? "ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setBusy(true);
    try {
      if (mode.kind === "create") {
        const body: CreateCouponBody = { name: trimmed, type, status };
        await adminApi.createCoupon(body);
      } else {
        const body: UpdateCouponBody = { name: trimmed, status };
        await adminApi.updateCoupon(mode.coupon.id, body);
      }
      onSaved();
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !busy && onClose()}
      />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-xl space-y-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              {mode.kind === "create" ? "Create coupon" : "Edit coupon"}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              The discount value is set per product when the coupon is attached.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            placeholder="e.g. WELCOME100"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
            required
            autoFocus
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Up to 80 characters. Doubles as the human-friendly identifier.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["CUSTOMER_FIXED", "RETAIL_PERCENT"] as CouponType[]).map((t) => {
              const selected = type === t;
              const disabled = mode.kind === "edit";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => !disabled && setType(t)}
                  disabled={disabled}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selected
                      ? "border-[#129cd3] bg-[#e8f7fc]"
                      : "border-gray-200 hover:border-[#8dd4ee]"
                  } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <p className={`text-xs font-semibold ${selected ? "text-[#129cd3]" : "text-gray-700"}`}>
                    {t === "CUSTOMER_FIXED" ? "Customer (₹ off)" : "Partner (% off)"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {t === "CUSTOMER_FIXED"
                      ? "Flat-rupee discount for any customer"
                      : "Percent discount for verified partners"}
                  </p>
                </button>
              );
            })}
          </div>
          {mode.kind === "edit" && (
            <p className="text-[11px] text-gray-400 mt-1">
              Type cannot be changed after creation.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Status
          </label>
          <div className="flex gap-2">
            {(["ACTIVE", "PAUSED"] as CouponStatus[]).map((s) => {
              const selected = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    selected
                      ? s === "ACTIVE"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                        : "border-gray-400 bg-gray-50 text-gray-700"
                      : "border-gray-200 text-gray-500 hover:border-[#8dd4ee]"
                  }`}
                >
                  {s === "ACTIVE" ? "Active" : "Paused"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode.kind === "create" ? "Create coupon" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteModal({
  coupon,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  coupon: AdminCouponRow;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative bg-white rounded-xl border border-gray-200 max-w-sm w-full p-6 shadow-xl">
        <h3 className="text-lg font-bold text-gray-800 mb-2">
          Delete coupon?
        </h3>
        <p className="text-sm text-gray-600 mb-1">
          This will permanently remove{" "}
          <span className="font-mono font-bold text-[#129cd3]">{coupon.name}</span>.
        </p>
        {coupon.attachmentCount > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2">
            Currently attached to {coupon.attachmentCount} product
            {coupon.attachmentCount === 1 ? "" : "s"}. Detach before deleting.
          </p>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
