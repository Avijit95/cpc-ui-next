"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  MapPin,
  User,
  Headphones,
  LogOut,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  X,
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

type Address = {
  id: number;
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const initialAddresses: Address[] = [
  {
    id: 1,
    name: "John Doe",
    phone: "+91 98765 43210",
    line1: "42, Palm Avenue, Bandra West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400050",
    isDefault: true,
  },
  {
    id: 2,
    name: "John Doe",
    phone: "+91 87654 32109",
    line1: "Plot 7, Sector 18, Noida",
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    isDefault: false,
  },
];

type ModalForm = {
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

const emptyForm: ModalForm = { name: "", phone: "", line1: "", city: "", state: "", pincode: "" };

export default function AddressesPage() {
  const [activeKey] = useState("addresses");
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ModalForm>(emptyForm);

  const handleSave = () => {
    if (!form.name || !form.phone || !form.line1 || !form.city || !form.state || !form.pincode) return;
    const newAddress: Address = {
      id: Date.now(),
      ...form,
      isDefault: false,
    };
    setAddresses((prev) => [...prev, newAddress]);
    setShowModal(false);
    setForm(emptyForm);
  };

  const handleDelete = (id: number) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSetDefault = (id: number) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  };

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

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#129cd3] px-5 py-5 text-white">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2">
                  <span className="text-[#129cd3] font-bold text-lg">J</span>
                </div>
                <p className="font-semibold">John Doe</p>
                <p className="text-[#b8e8f5] text-xs">john.doe@example.com</p>
              </div>
              <nav className="py-2">
                {sidebarItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      activeKey === item.key
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
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus size={16} /> Add New Address
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {addresses.map((addr) => (
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
                    <p className="font-bold text-gray-800 text-sm">{addr.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{addr.phone}</p>
                    <p className="text-gray-600 text-sm mt-2">
                      {addr.line1},<br />
                      {addr.city}, {addr.state} – {addr.pincode}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                    <button className="flex items-center gap-1.5 text-xs text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors">
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="flex items-center gap-1.5 text-xs text-red-500 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                    {!addr.isDefault && (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <CheckCircle size={12} /> Set Default
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Add Address Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">Add New Address</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: "Full Name", key: "name", placeholder: "John Doe", type: "text" },
                { label: "Phone Number", key: "phone", placeholder: "+91 98765 43210", type: "tel" },
                { label: "Address Line 1", key: "line1", placeholder: "Street, Area, Landmark", type: "text" },
                { label: "City", key: "city", placeholder: "Mumbai", type: "text" },
                { label: "State", key: "state", placeholder: "Maharashtra", type: "text" },
                { label: "Pincode", key: "pincode", placeholder: "400001", type: "text" },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.key as keyof ModalForm]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Save Address
              </button>
              <button
                onClick={() => { setShowModal(false); setForm(emptyForm); }}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
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
