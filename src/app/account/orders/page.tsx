"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isApiError, ordersApi } from "@/lib/api";
import type { OrderListItem, OrderStatus } from "@/lib/api";
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
  Eye,
  FileText,
  Package,
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

const STATUS_FILTERS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "RETURN_REQUESTED", label: "Return Requested" },
  { value: "RETURNED", label: "Returned" },
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

const PAGE_SIZE = 20;

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

export default function OrdersPage() {
  const router = useRouter();
  const { user, status } = useAuth();

  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth gate.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account/orders");
    }
  }, [status, router]);

  // Fetch list when filter/offset/auth change.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    ordersApi
      .list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset,
      })
      .then((resp) => {
        if (!cancelled) {
          setItems(resp.items);
          setTotal(resp.total);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(isApiError(err) ? err.displayMessage : "Could not load orders");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, statusFilter, offset]);

  const onFilterChange = (next: OrderStatus | "ALL") => {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setOffset(0);
    setLoading(true);
  };

  const userName = user?.name ?? "Account";
  const userContact = user?.email ?? user?.phone ?? "";
  const userInitial = (user?.name?.[0] ?? "A").toUpperCase();

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            <span className="text-gray-800 font-medium">Orders</span>
          </div>
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

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h1 className="font-bold text-gray-800 text-lg">Order History</h1>
                <span className="text-sm text-gray-500">
                  {loading ? "Loading…" : `${total} order${total === 1 ? "" : "s"}`}
                </span>
              </div>

              {/* Status filter chips */}
              <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => onFilterChange(f.value)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      statusFilter === f.value
                        ? "bg-[#129cd3] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Body */}
              {loading ? (
                <div className="p-6 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : error ? (
                <div className="m-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {error}
                </div>
              ) : items.length === 0 ? (
                <div className="p-10 text-center">
                  <Package size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    {statusFilter === "ALL" ? "No orders yet" : "No orders match this filter"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {statusFilter === "ALL"
                      ? "Your orders will appear here once you place one."
                      : "Try a different status or clear the filter."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
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
                      {items.map((order) => (
                        <tr
                          key={order.id}
                          className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 font-medium text-[#129cd3]">
                            <Link
                              href={`/account/orders/${encodeURIComponent(order.id)}`}
                              className="hover:underline"
                            >
                              {order.orderNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            <div className="flex items-center gap-3">
                              {order.primaryImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={order.primaryImageUrl}
                                  alt=""
                                  className="w-10 h-10 object-cover rounded border border-gray-200"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200" />
                              )}
                              <span className="text-xs text-gray-500">
                                {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[order.status]}`}
                            >
                              {STATUS_LABEL[order.status]}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-800 whitespace-nowrap">
                            {formatPrice(order.grandTotal)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <Link
                                href={`/account/orders/${encodeURIComponent(order.id)}`}
                                className="flex items-center gap-1 text-xs text-[#129cd3] border border-[#129cd3] px-2.5 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors"
                              >
                                <Eye size={13} /> View
                              </Link>
                              <Link
                                href={`/account/orders/${encodeURIComponent(order.id)}#invoice`}
                                className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                <FileText size={13} /> Invoice
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && !error && total > PAGE_SIZE && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Page {page} of {pageCount} · {total} total
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={offset === 0}
                      onClick={() => {
                        setOffset(Math.max(0, offset - PAGE_SIZE));
                        setLoading(true);
                      }}
                      className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={13} /> Previous
                    </button>
                    <button
                      disabled={offset + PAGE_SIZE >= total}
                      onClick={() => {
                        setOffset(offset + PAGE_SIZE);
                        setLoading(true);
                      }}
                      className="flex items-center gap-1 text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
