"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ChevronDown,
  Loader2,
  ShieldAlert,
  Package,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { isApiError, ordersApi } from "@/lib/api";
import type { OrderListItem, OrderStatus } from "@/lib/api";

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
];

// Orders not in one of these are counted as "Active".
const TERMINAL_STATUSES = new Set<OrderStatus>([
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
]);

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AccountPage() {
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const { items: wishlistItems, loading: wishlistLoading } = useWishlist();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account");
    }
  }, [status, router]);

  // Pull the customer's orders once authenticated. limit=100 (the API max) is
  // plenty to count Active orders exactly; `total` gives the exact Total.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    ordersApi
      .list({ limit: 100 })
      .then((resp) => {
        if (cancelled) return;
        setOrders(resp.items);
        setTotalOrders(resp.total);
        setOrdersError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setOrdersError(
            isApiError(err) ? err.displayMessage : "Could not load orders",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const activeOrders = orders.filter(
    (o) => !TERMINAL_STATUSES.has(o.status),
  ).length;
  const recentOrders = orders.slice(0, 5);

  if (status !== "authenticated" || !user) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center bg-gray-50">
          <Loader2 className="animate-spin text-[#129cd3]" size={28} />
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">My Account</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">
          <aside className="w-full lg:w-64 lg:flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Mobile: clickable header that toggles nav */}
              <button
                className="w-full bg-gradient-to-r from-[#129cd3] to-[#0e85b5] px-5 py-4 text-white text-left lg:cursor-default hover:from-[#10a8e0] hover:to-[#0c78a6] transition-all"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-expanded={sidebarOpen}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-white/40">
                    {user.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.profilePicUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-base">{initials(user.name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{user.name}</p>
                    <p className="text-white/70 text-xs truncate mt-0.5">{user.email ?? user.phone ?? ""}</p>
                  </div>
                  <div className={`lg:hidden w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 transition-transform ${sidebarOpen ? "rotate-180" : ""}`}>
                    <ChevronDown size={15} />
                  </div>
                </div>
              </button>

              {/* Nav — always visible on lg, toggleable below lg */}
              <nav className={`py-2 ${sidebarOpen ? "block" : "hidden"} lg:block`}>
                {sidebarItems.map((item) => (
                  <div key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                        item.key === "dashboard"
                          ? "bg-[#e8f7fc] text-[#129cd3] border-r-4 border-[#129cd3]"
                          : "text-gray-600 hover:bg-gray-50 hover:text-[#129cd3]"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                    <div className="h-px mx-5 bg-gradient-to-r from-transparent via-[#129cd3]/40 to-transparent" />
                  </div>
                ))}
                <button
                  onClick={async () => {
                    await logout();
                    router.replace("/login");
                  }}
                  className="w-full text-left flex items-center gap-3 px-5 py-3 text-sm font-medium text-red-500 hover:bg-red-50"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </nav>
            </div>
          </aside>

          <div className="flex-1 space-y-6">
            {/* Hello — mobile gradient */}
            <div className="lg:hidden bg-gradient-to-br from-[#129cd3] to-[#0b7aa8] rounded-xl px-5 py-4">
              <h1 className="text-xl font-bold text-white">
                Hello, {user.name.split(" ")[0]} 👋
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                Welcome back! Here&apos;s a summary of your account.
              </p>
            </div>
            {/* Hello — desktop */}
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 px-6 py-5">
              <h1 className="text-xl font-bold text-gray-800">
                Hello, {user.name.split(" ")[0]} 👋
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Welcome back! Here&apos;s a summary of your account.
              </p>
            </div>

            {user.phoneRequired && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <ShieldAlert size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 text-sm">Add your phone number</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    A verified phone number is required for checkout and partner registration.
                  </p>
                </div>
                <Link
                  href="/account/profile"
                  className="text-xs font-semibold text-[#129cd3] hover:underline whitespace-nowrap"
                >
                  Add now
                </Link>
              </div>
            )}

            {user.kycStatus === "PENDING" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
                <p className="font-semibold text-blue-800 text-sm">Partner application under review</p>
                <p className="text-blue-700 text-xs mt-0.5">
                  Our team is reviewing your KYC. You&apos;ll be notified once it&apos;s approved.
                </p>
              </div>
            )}

            {user.kycStatus === "REJECTED" && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
                <p className="font-semibold text-red-800 text-sm">Partner application rejected</p>
                <p className="text-red-700 text-xs mt-0.5">
                  You can resubmit with corrected details.{" "}
                  <Link href="/dealer/register" className="underline font-semibold">Try again</Link>
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 lg:gap-4">
              {[
                { label: "Total Orders", value: ordersLoading ? "—" : String(totalOrders), icon: <ShoppingBag size={22} className="text-[#129cd3]" />, bg: "bg-[#e8f7fc]" },
                { label: "Active Orders", value: ordersLoading ? "—" : String(activeOrders), icon: <LayoutDashboard size={22} className="text-orange-500" />, bg: "bg-orange-50" },
                { label: "Wishlist", value: wishlistLoading ? "—" : String(wishlistItems.length), icon: <Heart size={22} className="text-red-500" />, bg: "bg-red-50" },
              ].map((card, i) => (
                <div key={i} className={`rounded-xl border border-gray-100 lg:border-gray-200 p-3 lg:p-5 flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-4 ${card.bg} lg:bg-white`}>
                  <div className={`hidden lg:flex ${card.bg} rounded-xl w-12 h-12 items-center justify-center flex-shrink-0`}>
                    {card.icon}
                  </div>
                  <div className="text-center lg:text-left">
                    <p className="text-xl lg:text-2xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-[11px] lg:text-sm text-gray-500 leading-tight">{card.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Recent Orders</h2>
                <Link href="/account/orders" className="text-[#129cd3] text-sm hover:underline">View all</Link>
              </div>
              {ordersLoading ? (
                <div className="px-6 py-8 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : ordersError ? (
                <div className="m-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {ordersError}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Package size={28} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">You haven&apos;t placed any orders yet.</p>
                </div>
              ) : (
                <>
                  {/* Table — above 740px */}
                  <div className="hidden min-[740px]:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-[#129cd3] font-semibold uppercase border-b border-gray-200">
                          <th className="text-left px-6 py-3 whitespace-nowrap">Order ID</th>
                          <th className="text-left px-6 py-3 whitespace-nowrap">Items</th>
                          <th className="text-left px-6 py-3 whitespace-nowrap">Date</th>
                          <th className="text-left px-6 py-3 whitespace-nowrap">Status</th>
                          <th className="text-right px-6 py-3 whitespace-nowrap">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order) => (
                          <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-[#129cd3] whitespace-nowrap">
                              <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="hover:underline">
                                {order.orderNumber}
                              </Link>
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              <div className="flex items-center gap-3">
                                {order.primaryImageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={order.primaryImageUrl} alt="" className="w-10 h-10 object-cover rounded border border-gray-200" />
                                ) : (
                                  <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200" />
                                )}
                                <span className="text-xs text-gray-500">
                                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(order.createdAt)}</td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[order.status]}`}>
                                {STATUS_LABEL[order.status]}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-gray-800 whitespace-nowrap">{formatPrice(order.grandTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards — below 740px */}
                  <div className="min-[740px]:hidden divide-y divide-gray-100">
                    {recentOrders.map((order) => (
                      <Link
                        key={order.id}
                        href={`/account/orders/${encodeURIComponent(order.id)}`}
                        className="flex items-center gap-2 xxs:gap-3 px-3 xxs:px-4 py-2.5 xxs:py-3 hover:bg-gray-50 transition-colors"
                      >
                        {order.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={order.primaryImageUrl} alt="" className="w-9 h-9 xxs:w-12 xxs:h-12 object-cover rounded border border-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 xxs:w-12 xxs:h-12 bg-gray-100 rounded border border-gray-200 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] xxs:text-xs font-semibold text-[#129cd3] truncate">{order.orderNumber}</p>
                          <p className="text-[10px] xxs:text-xs text-gray-500 mt-0.5">{formatDate(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 max-w-[90px] xxs:max-w-none">
                          <span className={`text-[10px] font-semibold px-1.5 xxs:px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[order.status]}`}>
                            {STATUS_LABEL[order.status]}
                          </span>
                          <p className="text-[11px] xxs:text-xs font-bold text-gray-800 text-right">{formatPrice(order.grandTotal)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
