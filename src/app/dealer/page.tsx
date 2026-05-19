"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { isApiError, partnersApi } from "@/lib/api";
import type { PartnerDashboardResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
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
  Wallet,
  Loader2,
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

// Real OrderStatus enum colors (replaces the prior static human-string map).
const statusColor: Record<string, string> = {
  PENDING_PAYMENT: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURNED: "bg-gray-200 text-gray-700",
};

const statusLabel: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return Requested",
  RETURNED: "Returned",
};

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DealerDashboardPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const [activeKey] = useState("dashboard");

  const [dashboard, setDashboard] = useState<PartnerDashboardResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false);

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/dealer");
    }
  }, [status, router]);

  // Fetch dashboard.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    partnersApi
      .dashboard()
      .then((d) => {
        if (!cancelled) {
          setDashboard(d);
          setError(null);
          setNotVerified(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiError(err) && err.code === "PARTNER_NOT_VERIFIED") {
          setNotVerified(true);
        } else {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load dashboard",
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

  const companyName = user?.companyName ?? user?.name ?? "Partner";
  const userInitial = (user?.companyName?.[0] ?? user?.name?.[0] ?? "P").toUpperCase();
  const userContact = user?.email ?? user?.phone ?? "";
  const isVerified = user?.kycStatus === "VERIFIED";

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
                    <span className="text-[#129cd3] font-bold text-lg">{userInitial}</span>
                  </div>
                  {isVerified && <BadgeCheck size={18} className="text-yellow-300" />}
                </div>
                <p className="font-semibold">{companyName}</p>
                <p className="text-[#b8e8f5] text-xs">{userContact}</p>
                {isVerified && (
                  <span className="inline-block mt-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Verified Partner
                  </span>
                )}
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
            {notVerified ? (
              <div className="bg-white rounded-xl border border-amber-200 p-8 text-center">
                <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BadgeCheck size={28} className="text-amber-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">
                  Partner verification pending
                </h2>
                <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
                  Your partner application hasn&apos;t been verified yet. Once
                  an admin approves it, your dashboard will populate
                  automatically.
                </p>
                <Link
                  href="/dealer/register"
                  className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
                >
                  Complete or update application
                </Link>
              </div>
            ) : error ? (
              <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-600">
                {error}
              </div>
            ) : loading || !dashboard ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 flex items-center justify-center text-gray-500 text-sm gap-2">
                <Loader2 size={16} className="animate-spin" /> Loading dashboard…
              </div>
            ) : (
              <>
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
                  <h1 className="text-xl font-bold text-gray-800">Welcome back, {companyName} 👋</h1>
                  <p className="text-sm text-gray-500 mt-1">Here&apos;s your dealer dashboard overview.</p>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      label: "Total Orders",
                      value: String(dashboard.orderCount),
                      sub:
                        dashboard.lastOrderAt
                          ? `Last on ${formatDate(dashboard.lastOrderAt)}`
                          : "All time",
                      icon: <ShoppingBag size={22} className="text-[#129cd3]" />,
                      bg: "bg-[#e8f7fc]",
                    },
                    {
                      label: "Partner Savings",
                      value: formatPrice(Math.round(dashboard.discountClaimed)),
                      sub: "Lifetime discount claimed",
                      icon: <BadgeCheck size={22} className="text-green-600" />,
                      bg: "bg-green-50",
                    },
                    {
                      label: "Total Spent",
                      value: formatPrice(Math.round(dashboard.gross)),
                      sub: "Lifetime gross",
                      icon: <Wallet size={22} className="text-orange-500" />,
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
                    {dashboard.recentOrders.length === 0 ? (
                      <p className="px-6 py-10 text-center text-sm text-gray-500">
                        No orders yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
                            <th className="text-left px-6 py-3">Order ID</th>
                            <th className="text-left px-6 py-3">Items</th>
                            <th className="text-left px-6 py-3">Date</th>
                            <th className="text-left px-6 py-3">Status</th>
                            <th className="text-right px-6 py-3">Amount</th>
                            <th className="text-center px-6 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard.recentOrders.map((order) => (
                            <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-[#129cd3]">{order.orderNumber}</td>
                              <td className="px-6 py-4 text-gray-700">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 bg-gray-100 rounded-md flex-shrink-0 overflow-hidden">
                                    {order.primaryImageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={order.primaryImageUrl}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <span className="text-xs text-gray-600">
                                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(order.createdAt)}</td>
                              <td className="px-6 py-4">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusColor[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {statusLabel[order.status] ?? order.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-semibold text-gray-800 whitespace-nowrap">
                                {formatPrice(order.grandTotal)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <Link href={`/account/orders/${order.id}`} className="flex items-center gap-1 text-xs text-[#129cd3] border border-[#129cd3] px-2.5 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors">
                                    <Eye size={13} /> View
                                  </Link>
                                  <Link href={`/account/orders/${order.id}#invoice`} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                                    <FileText size={13} /> Invoice
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
