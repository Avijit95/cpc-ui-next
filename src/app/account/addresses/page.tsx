"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { addressesApi, isApiError } from "@/lib/api";
import type {
  Address,
  CreateAddressBody,
  StateCode,
  UpdateAddressBody,
} from "@/lib/api";
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
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  Loader2,
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

type FormState = {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  stateCode: StateCode;
  pincode: string;
};

const emptyForm: FormState = {
  label: "",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  stateCode: "WB",
  pincode: "",
};

const toFormState = (addr: Address): FormState => ({
  label: addr.label ?? "",
  recipientName: addr.recipientName,
  phone: addr.phone,
  line1: addr.line1,
  line2: addr.line2 ?? "",
  city: addr.city,
  stateCode: addr.stateCode,
  pincode: addr.pincode,
});

export default function AddressesPage() {
  const router = useRouter();
  const { user, status } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [defaultBusy, setDefaultBusy] = useState<Record<string, boolean>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account/addresses");
    }
  }, [status, router]);

  // Initial fetch (only when authenticated). State is already `loading: true`
  // and `loadError: null` from useState, so we don't reset synchronously
  // (React 19's react-hooks/set-state-in-effect rule).
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    addressesApi
      .list()
      .then((items) => {
        if (!cancelled) setAddresses(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            isApiError(err) ? err.displayMessage : "Could not load addresses",
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

  const openCreate = () => {
    setModalMode("create");
    setEditId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const openEdit = (addr: Address) => {
    setModalMode("edit");
    setEditId(addr.id);
    setForm(toFormState(addr));
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode("closed");
    setEditId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const setLineErr = (id: string, msg: string | null) =>
    setLineErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const validateForm = (): string | null => {
    if (!form.recipientName.trim()) return "Recipient name is required";
    if (!/^\+\d{10,15}$/.test(form.phone.trim()))
      return "Phone must be in E.164 format (e.g. +919000000001)";
    if (!form.line1.trim()) return "Address line 1 is required";
    if (!form.city.trim()) return "City is required";
    if (!/^\d{6}$/.test(form.pincode.trim()))
      return "Pincode must be exactly 6 digits";
    return null;
  };

  const handleSave = useCallback(async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (modalMode === "create") {
        const body: CreateAddressBody = {
          recipientName: form.recipientName.trim(),
          phone: form.phone.trim(),
          line1: form.line1.trim(),
          city: form.city.trim(),
          stateCode: form.stateCode,
          pincode: form.pincode.trim(),
        };
        if (form.label.trim()) body.label = form.label.trim();
        if (form.line2.trim()) body.line2 = form.line2.trim();
        const created = await addressesApi.create(body);
        // Re-fetch so the server's default-first ordering is preserved.
        const fresh = await addressesApi.list();
        setAddresses(fresh);
        void created;
      } else if (modalMode === "edit" && editId) {
        const body: UpdateAddressBody = {
          recipientName: form.recipientName.trim(),
          phone: form.phone.trim(),
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          city: form.city.trim(),
          stateCode: form.stateCode,
          pincode: form.pincode.trim(),
          label: form.label.trim() || undefined,
        };
        const updated = await addressesApi.update(editId, body);
        setAddresses((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a)),
        );
      }
      closeModal();
    } catch (caught) {
      setFormError(
        isApiError(caught)
          ? caught.displayMessage
          : "Could not save address",
      );
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalMode, editId, form]);

  const handleSetDefault = useCallback(async (addr: Address) => {
    if (addr.isDefault) return;
    setDefaultBusy((prev) => ({ ...prev, [addr.id]: true }));
    setLineErr(addr.id, null);
    // Optimistic flip.
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, isDefault: a.id === addr.id })),
    );
    try {
      await addressesApi.setDefault(addr.id);
      // Re-fetch to re-sort default-first.
      const fresh = await addressesApi.list();
      setAddresses(fresh);
    } catch (err) {
      // Roll back: re-fetch authoritative state.
      try {
        const fresh = await addressesApi.list();
        setAddresses(fresh);
      } catch {
        // Best-effort rollback; surface the original error either way.
      }
      setLineErr(
        addr.id,
        isApiError(err) ? err.displayMessage : "Could not set as default",
      );
    } finally {
      setDefaultBusy((prev) => {
        const next = { ...prev };
        delete next[addr.id];
        return next;
      });
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await addressesApi.remove(confirmDelete.id);
      setAddresses((prev) => prev.filter((a) => a.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(
        isApiError(err) ? err.displayMessage : "Could not delete address",
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [confirmDelete]);

  // Sidebar avatar / contact line — use real user when present, fall back gracefully.
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
            <span className="text-gray-800 font-medium">Addresses</span>
          </div>
        </div>
        <div className="lg:hidden max-w-7xl mx-auto px-4 pt-4">
          <Link href="/account" className="inline-flex items-center gap-1 text-sm text-[#129cd3] font-medium hover:underline">
            <ChevronLeft size={16} /> Back to Account
          </Link>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
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
                      item.key === "addresses"
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

          {/* Main Content */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-lg font-bold text-gray-800">Saved Addresses</h1>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus size={16} /> Add New Address
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border-2 border-gray-200 p-5 animate-pulse"
                  >
                    <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                    <div className="h-3 w-40 bg-gray-200 rounded mb-3" />
                    <div className="h-3 w-full bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-3/4 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
                {loadError}
              </div>
            ) : addresses.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <MapPin size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  No addresses saved yet
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Add your first delivery address to speed up checkout.
                </p>
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Plus size={16} /> Add New Address
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {addresses.map((addr) => {
                  const lineErr = lineErrors[addr.id];
                  const busyDefault = !!defaultBusy[addr.id];
                  return (
                    <div
                      key={addr.id}
                      className={`bg-white rounded-xl border-2 p-5 relative ${
                        addr.isDefault ? "border-[#129cd3]" : "border-gray-200"
                      }`}
                    >
                      {addr.isDefault && (
                        <span className="absolute top-3 right-3 flex items-center gap-1 bg-[#e8f7fc] text-[#129cd3] text-xs font-bold px-2.5 py-1 rounded-full">
                          <CheckCircle size={11} /> Default
                        </span>
                      )}
                      <div className="mb-4">
                        <p className="font-bold text-gray-800 text-sm">
                          {addr.recipientName}
                          {addr.label ? (
                            <span className="ml-2 text-xs font-semibold text-[#129cd3] bg-[#e8f7fc] px-2 py-0.5 rounded-full">
                              {addr.label}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">{addr.phone}</p>
                        <p className="text-gray-600 text-sm mt-2">
                          {addr.line1}
                          {addr.line2 ? (
                            <>
                              ,<br />
                              {addr.line2}
                            </>
                          ) : null}
                          ,<br />
                          {addr.city}, {stateName(addr.stateCode)} – {addr.pincode}
                        </p>
                      </div>
                      {lineErr && (
                        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {lineErr}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => openEdit(addr)}
                          className="flex items-center gap-1.5 text-xs text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors"
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDelete(addr);
                            setDeleteError(null);
                          }}
                          className="flex items-center gap-1.5 text-xs text-red-500 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                        {!addr.isDefault && (
                          <button
                            onClick={() => handleSetDefault(addr)}
                            disabled={busyDefault}
                            className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            {busyDefault ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle size={12} />
                            )}{" "}
                            Set Default
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />

      {/* Add / Edit Address Modal */}
      {modalMode !== "closed" && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && closeModal()} />
          <div className="flex min-h-full items-start justify-center p-4 pt-20 pb-8">
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10" style={{ top: "70px" }}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">
                {modalMode === "create" ? "Add New Address" : "Edit Address"}
              </h2>
              <button
                onClick={closeModal}
                disabled={saving}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 px-6 pt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Label <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Home, Office, etc."
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={form.recipientName}
                  onChange={(e) => setForm((prev) => ({ ...prev, recipientName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+919000000001"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
                <p className="text-[10px] text-gray-400 mt-1">Include country code, no spaces.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 1</label>
                <input
                  type="text"
                  placeholder="Street, Area, Landmark"
                  value={form.line1}
                  onChange={(e) => setForm((prev) => ({ ...prev, line1: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Address Line 2 <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Apartment, suite, unit, etc."
                  value={form.line2}
                  onChange={(e) => setForm((prev) => ({ ...prev, line2: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  placeholder="Mumbai"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
                <select
                  value={form.stateCode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, stateCode: e.target.value as StateCode }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 bg-white"
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
                  placeholder="400001"
                  value={form.pincode}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      pincode: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
            </div>

            {formError && (
              <div className="mt-4 mx-6 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex gap-3 mt-3 px-6 pb-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {modalMode === "create" ? "Save Address" : "Save Changes"}
              </button>
              <button
                onClick={closeModal}
                disabled={saving}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deleteBusy && setConfirmDelete(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Delete address?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will remove the address for {confirmDelete.recipientName} at {confirmDelete.city}, {stateName(confirmDelete.stateCode)} – {confirmDelete.pincode}.
            </p>
            {deleteError && (
              <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteBusy}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {deleteBusy && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusy}
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
