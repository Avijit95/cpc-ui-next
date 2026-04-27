"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Plus, Search, Filter, Eye, MoreHorizontal, Truck, Package2, CheckCircle2, XCircle, RefreshCcw, Clock } from "lucide-react";

const orders = [
  { id: "CPC-10294", customer: "Rahul Sharma", email: "rahul.s@gmail.com", date: "2026-04-24", items: 2, amount: 134999, payment: "Paid", status: "Delivered" },
  { id: "CPC-10293", customer: "Priya Menon", email: "priyam@gmail.com", date: "2026-04-24", items: 1, amount: 29990, payment: "Paid", status: "Shipped" },
  { id: "CPC-10292", customer: "Arjun Reddy", email: "arjun.r@outlook.com", date: "2026-04-23", items: 1, amount: 34999, payment: "Paid", status: "Processing" },
  { id: "CPC-10291", customer: "Neha Kapoor", email: "nehak@yahoo.in", date: "2026-04-23", items: 3, amount: 74999, payment: "Pending", status: "Pending" },
  { id: "CPC-10290", customer: "Vikram Singh", email: "vsingh@gmail.com", date: "2026-04-22", items: 1, amount: 11999, payment: "Refunded", status: "Cancelled" },
  { id: "CPC-10289", customer: "Meera Nair", email: "meera@cpc.com", date: "2026-04-22", items: 4, amount: 58750, payment: "Paid", status: "Delivered" },
  { id: "CPC-10288", customer: "Aditya Mehra", email: "aditya@gmail.com", date: "2026-04-21", items: 2, amount: 92400, payment: "Paid", status: "Shipped" },
];

const summaryCards = [
  { label: "Pending", value: 42, tint: "bg-gray-100 text-gray-600", icon: Clock },
  { label: "Processing", value: 124, tint: "bg-amber-100 text-amber-600", icon: Package2 },
  { label: "Shipped", value: 318, tint: "bg-blue-100 text-blue-600", icon: Truck },
  { label: "Delivered", value: 2241, tint: "bg-emerald-100 text-emerald-600", icon: CheckCircle2 },
  { label: "Refunds", value: 19, tint: "bg-red-100 text-red-600", icon: RefreshCcw },
];

const statusStyle: Record<string, string> = {
  Delivered: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Shipped: "bg-blue-50 text-blue-600 border-blue-200",
  Processing: "bg-amber-50 text-amber-600 border-amber-200",
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled: "bg-red-50 text-red-600 border-red-200",
};

const paymentStyle: Record<string, string> = {
  Paid: "text-emerald-600",
  Pending: "text-amber-600",
  Refunded: "text-red-500",
};

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function OrdersPage() {
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");

  const filtered = orders.filter((o) => {
    const s = status === "All" || o.status === status;
    const q = o.id.toLowerCase().includes(query.toLowerCase()) || o.customer.toLowerCase().includes(query.toLowerCase());
    return s && q;
  });

  return (
    <>
      <AdminHeader
        title="Orders"
        subtitle="Track lifecycle, create manual orders, handle cancellations and refunds"
        actions={
          <button className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Manual order
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {summaryCards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.tint}`}>
                  <Icon size={16} />
                </div>
                <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                <p className="text-xl font-bold text-gray-800 mt-0.5">{c.value.toLocaleString()}</p>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order ID or customer…"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
          >
            <option>All</option>
            <option>Pending</option>
            <option>Processing</option>
            <option>Shipped</option>
            <option>Delivered</option>
            <option>Cancelled</option>
          </select>
          <input
            type="date"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white text-gray-600"
          />
          <button className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-2 hover:border-[#129cd3] hover:text-[#129cd3]">
            <Filter size={14} /> More
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Order</th>
                  <th className="text-left font-semibold px-5 py-3">Customer</th>
                  <th className="text-left font-semibold px-5 py-3">Date</th>
                  <th className="text-left font-semibold px-5 py-3">Items</th>
                  <th className="text-left font-semibold px-5 py-3">Amount</th>
                  <th className="text-left font-semibold px-5 py-3">Payment</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-[#129cd3] font-semibold">{o.id}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-800">{o.customer}</p>
                      <p className="text-xs text-gray-500">{o.email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{o.date}</td>
                    <td className="px-5 py-3 text-gray-700">{o.items}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{formatPrice(o.amount)}</td>
                    <td className={`px-5 py-3 text-xs font-semibold ${paymentStyle[o.payment] ?? ""}`}>{o.payment}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]" aria-label="View">
                          <Eye size={14} />
                        </button>
                        {o.status !== "Cancelled" && o.status !== "Delivered" && (
                          <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" aria-label="Cancel">
                            <XCircle size={14} />
                          </button>
                        )}
                        <button className="p-1.5 rounded text-gray-400 hover:text-gray-700">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
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
