"use client";

import { useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { Download, Eye, Search, FileText, IndianRupee, Receipt, CheckCircle2 } from "lucide-react";

const invoices = [
  { id: "INV-2026-00482", order: "CPC-10294", customer: "Rahul Sharma", date: "2026-04-24", subtotal: 114406, gst: 20593, total: 134999, status: "Paid" },
  { id: "INV-2026-00481", order: "CPC-10293", customer: "Priya Menon", date: "2026-04-24", subtotal: 25415, gst: 4575, total: 29990, status: "Paid" },
  { id: "INV-2026-00480", order: "CPC-10292", customer: "Arjun Reddy", date: "2026-04-23", subtotal: 29660, gst: 5339, total: 34999, status: "Paid" },
  { id: "INV-2026-00479", order: "CPC-10291", customer: "Neha Kapoor", date: "2026-04-23", subtotal: 63558, gst: 11441, total: 74999, status: "Unpaid" },
  { id: "INV-2026-00478", order: "CPC-10289", customer: "Meera Nair", date: "2026-04-22", subtotal: 49788, gst: 8962, total: 58750, status: "Paid" },
];

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function InvoicesPage() {
  const [query, setQuery] = useState("");

  return (
    <>
      <AdminHeader
        title="Invoices & Billing"
        subtitle="Auto-generated invoices with GST, downloadable summaries"
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
          {[
            { label: "Total invoiced", value: "₹18,42,650", icon: IndianRupee, tint: "bg-[#e8f7fc] text-[#129cd3]" },
            { label: "GST collected", value: "₹3,31,677", icon: Receipt, tint: "bg-amber-100 text-amber-600" },
            { label: "Paid invoices", value: "2,284", icon: CheckCircle2, tint: "bg-emerald-100 text-emerald-600" },
            { label: "Unpaid invoices", value: "42", icon: FileText, tint: "bg-red-100 text-red-600" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${s.tint}`}>
                  <Icon size={18} />
                </div>
                <p className="text-xs text-gray-500 uppercase">{s.label}</p>
                <p className="text-xl font-bold text-gray-800 mt-1">{s.value}</p>
              </div>
            );
          })}
        </div>

        {/* GST configuration */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-bold text-gray-800 text-sm mb-4">GST Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">GSTIN</label>
              <input
                defaultValue="36ABCDE1234F1Z5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">State</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white">
                <option>Telangana (36)</option>
                <option>Karnataka (29)</option>
                <option>Maharashtra (27)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Default tax rate</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white">
                <option>18%</option>
                <option>12%</option>
                <option>5%</option>
                <option>28%</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Invoice prefix</label>
              <input
                defaultValue="INV-2026-"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button className="bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Save configuration
            </button>
          </div>
        </div>

        {/* Invoice list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <h3 className="font-bold text-gray-800 text-sm">Invoices</h3>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-80">
              <Search size={14} className="text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search invoice or customer…"
                className="bg-transparent outline-none text-sm text-gray-700 flex-1"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Invoice #</th>
                  <th className="text-left font-semibold px-5 py-3">Order</th>
                  <th className="text-left font-semibold px-5 py-3">Customer</th>
                  <th className="text-left font-semibold px-5 py-3">Date</th>
                  <th className="text-left font-semibold px-5 py-3">Subtotal</th>
                  <th className="text-left font-semibold px-5 py-3">GST</th>
                  <th className="text-left font-semibold px-5 py-3">Total</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices
                  .filter(
                    (i) =>
                      i.id.toLowerCase().includes(query.toLowerCase()) ||
                      i.customer.toLowerCase().includes(query.toLowerCase())
                  )
                  .map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono font-semibold text-[#129cd3] text-xs">{inv.id}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{inv.order}</td>
                      <td className="px-5 py-3 text-gray-800 font-medium">{inv.customer}</td>
                      <td className="px-5 py-3 text-gray-500">{inv.date}</td>
                      <td className="px-5 py-3 text-gray-700">{formatPrice(inv.subtotal)}</td>
                      <td className="px-5 py-3 text-gray-700">{formatPrice(inv.gst)}</td>
                      <td className="px-5 py-3 font-bold text-gray-800">{formatPrice(inv.total)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                            inv.status === "Paid"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href="/invoice"
                            className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]"
                            aria-label="View"
                          >
                            <Eye size={14} />
                          </Link>
                          <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]" aria-label="Download">
                            <Download size={14} />
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
