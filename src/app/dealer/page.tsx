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
  Package,
  ClipboardList,
  ChevronRight,
  BadgeCheck,
  Eye,
  FileText,
} from "lucide-react";

type SidebarItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const sidebarItems: SidebarItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, href: "/dealer" },
  { key: "wholesale", label: "Wholesale Products", icon: <Package size={18} />, href: "/dealer/products" },
  { key: "bulk", label: "Bulk Orders", icon: <ClipboardList size={18} />, href: "/dealer/bulk-orders" },
  { key: "wishlist", label: "Wishlist", icon: <Heart size={18} />, href: "/wishlist" },
  { key: "addresses", label: "Addresses", icon: <MapPin size={18} />, href: "/account/addresses" },
  { key: "profile", label: "Profile", icon: <User size={18} />, href: "/account/profile" },
  { key: "support", label: "Support", icon: <Headphones size={18} />, href: "/account/support" },
  { key: "orders", label: "Orders", icon: <ShoppingBag size={18} />, href: "/account/orders" },
  { key: "logout", label: "Logout", icon: <LogOut size={18} />, href: "/login" },
];

const recentOrders = [
  { id: "ORD-D-2024-001", product: "iPhone 15 Pro Max (x20)", date: "15 Mar 2024", status: "Delivered", amount: 2698000 },
  { id: "ORD-D-2024-002", product: "Samsung Galaxy S24 Ultra (x15)", date: "20 Mar 2024", status: "Processing", amount: 1949985 },
  { id: "ORD-D-2024-003", product: "Sony WH-1000XM5 (x30)", date: "22 Mar 2024", status: "Shipped", amount: 869700 },
];

const statusColor: Record<string, string> = {
  Delivered: "bg-green-100 text-green-700",
  Processing: "bg-yellow-100 text-yellow-700",
  Shipped: "bg-blue-100 text-blue-700",
  Cancelled: "bg-red-100 text-red-700",
};

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function DealerDashboardPage() {
  const [activeKey] = useState("dashboard");

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Dealer Dashboard</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#129cd3] px-5 py-5 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-[#129cd3] font-bold text-lg">A</span>
                  </div>
                  <BadgeCheck size={18} className="text-yellow-300" />
                </div>
                <p className="font-semibold">Acme Electronics</p>
                <p className="text-[#b8e8f5] text-xs">acme@dealer.com</p>
                <span className="inline-block mt-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Verified Partner
                </span>
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
          <div className="flex-1 space-y-6">
            {/* Verified Partner Banner */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-5 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <BadgeCheck size={24} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">Verified Partner</span>
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">✓ Certified</span>
                </div>
                <p className="text-green-100 text-sm">
                  You receive exclusive wholesale pricing on all products. Bulk discount applies automatically at checkout.
                </p>
              </div>
            </div>

            {/* Greeting */}
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
              <h1 className="text-xl font-bold text-gray-800">Welcome back, Acme Electronics 👋</h1>
              <p className="text-sm text-gray-500 mt-1">Here&apos;s your dealer dashboard overview.</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: "Total Orders",
                  value: "45",
                  sub: "All time",
                  icon: <ShoppingBag size={22} className="text-[#129cd3]" />,
                  bg: "bg-[#e8f7fc]",
                },
                {
                  label: "Partner Savings",
                  value: "₹12,400",
                  sub: "This month",
                  icon: <BadgeCheck size={22} className="text-green-600" />,
                  bg: "bg-green-50",
                },
                {
                  label: "Active Orders",
                  value: "3",
                  sub: "In progress",
                  icon: <Package size={22} className="text-orange-500" />,
                  bg: "bg-orange-50",
                },
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                  <div className={`${card.bg} rounded-xl w-12 h-12 flex items-center justify-center flex-shrink-0`}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-sm text-gray-500">{card.label}</p>
                    <p className="text-xs text-gray-400">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Recent Bulk Orders</h2>
                <Link href="/account/orders" className="text-[#129cd3] text-sm hover:underline">View all</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
                      <th className="text-left px-6 py-3">Order ID</th>
                      <th className="text-left px-6 py-3">Product</th>
                      <th className="text-left px-6 py-3">Date</th>
                      <th className="text-left px-6 py-3">Status</th>
                      <th className="text-right px-6 py-3">Amount</th>
                      <th className="text-center px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-[#129cd3]">{order.id}</td>
                        <td className="px-6 py-4 text-gray-700 max-w-[200px]">
                          <span className="line-clamp-1">{order.product}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{order.date}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusColor[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-800 whitespace-nowrap">
                          {formatPrice(order.amount)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button className="flex items-center gap-1 text-xs text-[#129cd3] border border-[#129cd3] px-2.5 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors">
                              <Eye size={13} /> View
                            </button>
                            <a href="/invoice" className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                              <FileText size={13} /> Invoice
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
