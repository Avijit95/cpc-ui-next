"use client";

import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Users,
  Package,
  IndianRupee,
  ArrowUpRight,
  MoreVertical,
} from "lucide-react";

const stats = [
  {
    label: "Total Revenue",
    value: "₹18,42,650",
    change: "+12.5%",
    trend: "up",
    icon: IndianRupee,
    tint: "bg-[#129cd3]/10 text-[#129cd3]",
  },
  {
    label: "Orders",
    value: "2,847",
    change: "+8.2%",
    trend: "up",
    icon: ShoppingBag,
    tint: "bg-amber-100 text-amber-600",
  },
  {
    label: "Customers",
    value: "14,392",
    change: "+18.3%",
    trend: "up",
    icon: Users,
    tint: "bg-emerald-100 text-emerald-600",
  },
  {
    label: "Products",
    value: "684",
    change: "-2.1%",
    trend: "down",
    icon: Package,
    tint: "bg-purple-100 text-purple-600",
  },
];

const recentOrders = [
  { id: "CPC-10294", customer: "Rahul Sharma", product: "iPhone 15 Pro", amount: 134999, status: "Delivered" },
  { id: "CPC-10293", customer: "Priya Menon", product: "Sony WH-1000XM5", amount: 29990, status: "Shipped" },
  { id: "CPC-10292", customer: "Arjun Reddy", product: "Samsung Galaxy Watch 6", amount: 34999, status: "Processing" },
  { id: "CPC-10291", customer: "Neha Kapoor", product: "Canon EOS R50", amount: 74999, status: "Pending" },
  { id: "CPC-10290", customer: "Vikram Singh", product: "OnePlus Buds Pro 2", amount: 11999, status: "Cancelled" },
];

const topProducts = [
  { name: "iPhone 15 Pro Max", sold: 248, revenue: 3349750 },
  { name: "Samsung Galaxy S24 Ultra", sold: 192, revenue: 2688000 },
  { name: "Sony WH-1000XM5 Headphones", sold: 412, revenue: 1234800 },
  { name: "OnePlus 12", sold: 156, revenue: 1248440 },
];

const statusStyle: Record<string, string> = {
  Delivered: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Shipped: "bg-blue-50 text-blue-600 border-blue-200",
  Processing: "bg-amber-50 text-amber-600 border-amber-200",
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled: "bg-red-50 text-red-600 border-red-200",
};

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

const salesByWeek = [42, 68, 51, 82, 74, 95, 88, 72, 91, 86, 110, 102];

export default function AdminDashboard() {
  const maxBar = Math.max(...salesByWeek);

  return (
    <>
      <AdminHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's happening with your store today."
        actions={
          <Link
            href="/admin/products/add"
            className="hidden sm:inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <ArrowUpRight size={14} /> New product
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.tint}`}>
                    <Icon size={18} />
                  </div>
                  <button className="text-gray-400 hover:text-gray-700">
                    <MoreVertical size={16} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
                <p className="text-2xl font-bold text-gray-800 mb-2">{s.value}</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex items-center gap-0.5 text-xs font-semibold ${
                      s.trend === "up" ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {s.trend === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {s.change}
                  </span>
                  <span className="text-xs text-gray-400">vs last month</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart + Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-gray-800">Revenue Overview</h3>
                <p className="text-xs text-gray-500">Last 12 weeks performance</p>
              </div>
              <select className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none hover:border-[#129cd3]">
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Yearly</option>
              </select>
            </div>
            <div className="flex items-end gap-3 h-56">
              {salesByWeek.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-gradient-to-t from-[#129cd3] to-[#8dd4ee] rounded-t hover:opacity-80 transition-opacity"
                    style={{ height: `${(v / maxBar) * 100}%` }}
                  />
                  <span className="text-[10px] text-gray-400">W{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Top Products</h3>
              <Link href="/admin/products" className="text-xs text-[#129cd3] hover:underline">
                View all
              </Link>
            </div>
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.name} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#e8f7fc] text-[#129cd3] text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-500">{p.sold} sold</span>
                      <span className="text-xs font-semibold text-[#129cd3]">{formatPrice(p.revenue)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Recent Orders</h3>
              <p className="text-xs text-gray-500">Latest 5 transactions on your store</p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-[#129cd3] hover:underline"
            >
              View all orders
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Order ID</th>
                  <th className="text-left font-semibold px-5 py-3">Customer</th>
                  <th className="text-left font-semibold px-5 py-3">Product</th>
                  <th className="text-left font-semibold px-5 py-3">Amount</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-[#129cd3]">{o.id}</td>
                    <td className="px-5 py-3 text-gray-700">{o.customer}</td>
                    <td className="px-5 py-3 text-gray-700">{o.product}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{formatPrice(o.amount)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle[o.status]}`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
