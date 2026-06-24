"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type {
  AdminOrderListItem,
  DashboardSummary,
  OrderStatus,
} from "@/lib/api";
import {
  ArrowUpRight,
  ShoppingBag,
  Users,
  IndianRupee,
  AlertTriangle,
  Package2,
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

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminApi.getDashboard(),
      adminApi.listOrders({ limit: 5, offset: 0 }),
    ])
      .then(([s, o]) => {
        if (cancelled) return;
        setSummary(s);
        setRecentOrders(o.items);
      })
      .catch((err) => {
        if (!cancelled) {
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
  }, []);

  return (
    <>
      <AdminHeader
        title="Dashboard"
        subtitle="What's happening with your store right now"
        actions={
          <Link
            href="/admin/products/add"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <ArrowUpRight size={14} /> New product
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {error && (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            label="Today's orders"
            value={summary ? summary.todayOrders.count.toLocaleString() : "—"}
            sub={
              summary ? `${formatPrice(summary.todayOrders.revenue)} revenue` : ""
            }
            icon={ShoppingBag}
            tint="bg-amber-100 text-amber-600"
            loading={loading}
          />
          <StatCard
            label="Today's revenue"
            value={summary ? formatPrice(summary.revenue.today) : "—"}
            sub={
              summary
                ? `${formatPrice(summary.revenue.last7Days)} last 7 days`
                : ""
            }
            icon={IndianRupee}
            tint="bg-[#129cd3]/10 text-[#129cd3]"
            loading={loading}
          />
          <StatCard
            label="MTD revenue"
            value={summary ? formatPrice(summary.revenue.monthToDate) : "—"}
            sub="month to date"
            icon={IndianRupee}
            tint="bg-emerald-100 text-emerald-600"
            loading={loading}
          />
          <StatCard
            label="Pending partners"
            value={summary ? summary.pendingPartners.toLocaleString() : "—"}
            sub="awaiting KYC approval"
            icon={Users}
            tint="bg-purple-100 text-purple-600"
            loading={loading}
          />
        </div>

        {/* Top products + low stock alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">Top Products</h3>
                <p className="text-xs text-gray-500">By units sold over last 30 days</p>
              </div>
              <Link href="/admin/products" className="text-xs text-[#129cd3] hover:underline">
                View all
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !summary || summary.topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">No sales data yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {summary.topProducts.map((p, i) => (
                  <li key={p.productId} className="py-2.5 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[#e8f7fc] text-[#129cd3] text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-sm font-semibold text-gray-800 truncate">
                      {p.name.split(" ").slice(0, 4).join(" ")}{p.name.split(" ").length > 4 ? "…" : ""}
                    </p>
                    <span className="text-xs text-gray-500">
                      {p.unitsSold} sold
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">Low stock</h3>
                {summary && (
                  <p className="text-xs text-gray-500">
                    Threshold: {summary.lowStockAlerts.threshold} units
                  </p>
                )}
              </div>
              <Link href="/admin/products" className="text-xs text-[#129cd3] hover:underline">
                Manage
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !summary || summary.lowStockAlerts.items.length === 0 ? (
              <p className="text-sm text-gray-500">All stock levels are healthy.</p>
            ) : (
              <ul className="space-y-2">
                {summary.lowStockAlerts.items.map((it) => (
                  <li
                    key={`${it.kind}-${it.id}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <AlertTriangle
                      size={12}
                      className={
                        it.stock === 0 ? "text-red-500" : "text-amber-500"
                      }
                    />
                    <span className="flex-1 text-gray-700 truncate">
                      {it.label}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        it.stock === 0 ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {it.stock}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Recent Orders</h3>
              <p className="text-xs text-gray-500">Latest 5 orders</p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-[#129cd3] hover:underline"
            >
              View all orders
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No orders yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Order</th>
                    <th className="text-left font-semibold px-5 py-3">Customer</th>
                    <th className="text-left font-semibold px-5 py-3">Date</th>
                    <th className="text-left font-semibold px-5 py-3">Amount</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono text-xs text-[#129cd3] font-semibold">
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.id)}`}
                          className="hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800">{o.user.name}</p>
                        <p className="text-xs text-gray-500">
                          {o.user.email ?? o.user.phone ?? "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {formatDate(o.createdAt)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-800">
                        {formatPrice(o.grandTotal)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLE[o.status]}`}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tint,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Package2;
  tint: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tint}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mb-1">
        {loading ? <span className="inline-block w-20 h-6 bg-gray-100 rounded animate-pulse" /> : value}
      </p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
