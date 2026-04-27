"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Plus, Pencil, Trash2, Tag, Percent, Calendar, Clock } from "lucide-react";

type Tab = "rules" | "coupons" | "campaigns";

const rules = [
  { id: 1, name: "Premium Smartphones", scope: "Category: Smartphones", type: "Markup %", value: "12%", updated: "2026-04-18" },
  { id: 2, name: "Bulk Order Discount", scope: "Order > ₹50,000", type: "Flat discount", value: "₹2,500", updated: "2026-04-11" },
  { id: 3, name: "Dealer Pricing Tier A", scope: "Partners: Tier A", type: "Discount %", value: "8%", updated: "2026-03-29" },
  { id: 4, name: "Clearance - Last 20", scope: "Tag: clearance", type: "Flat price", value: "₹9,999", updated: "2026-04-02" },
];

const coupons = [
  { id: 1, code: "WELCOME100", type: "₹ off", value: "₹100", minOrder: "₹999", uses: "1,284 / 5,000", expiry: "2026-06-30", status: "Active" },
  { id: 2, code: "SUMMER20", type: "% off", value: "20%", minOrder: "₹1,999", uses: "618 / 2,000", expiry: "2026-05-31", status: "Active" },
  { id: 3, code: "CAM500", type: "₹ off", value: "₹500", minOrder: "₹7,000", uses: "212 / 1,000", expiry: "2026-04-20", status: "Expired" },
  { id: 4, code: "PARTNER10", type: "% off", value: "10%", minOrder: "—", uses: "487 / ∞", expiry: "—", status: "Active" },
];

const campaigns = [
  { id: 1, name: "Weekend Flash Sale", starts: "2026-04-26 00:00", ends: "2026-04-28 23:59", discount: "Up to 30%", categories: "Smartphones, Cameras", status: "Scheduled" },
  { id: 2, name: "Audio Audio Mega Sale", starts: "2026-04-20 10:00", ends: "2026-04-24 22:00", discount: "Up to 40%", categories: "Speakers, Earphones", status: "Live" },
  { id: 3, name: "Diwali Dhamaka 2026", starts: "2026-10-18 00:00", ends: "2026-10-25 23:59", discount: "Up to 50%", categories: "All", status: "Draft" },
];

const statusCls: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Live: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Expired: "bg-red-50 text-red-600 border-red-200",
  Scheduled: "bg-blue-50 text-blue-600 border-blue-200",
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function PricingPage() {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <>
      <AdminHeader
        title="Pricing & Discounts"
        subtitle="Manage global pricing rules, coupon codes and timed campaigns"
        actions={
          <button className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New {tab === "rules" ? "rule" : tab === "coupons" ? "coupon" : "campaign"}
          </button>
        }
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <Tag size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Active rules</p>
              <p className="text-xl font-bold text-gray-800">{rules.length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Percent size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Live coupons</p>
              <p className="text-xl font-bold text-gray-800">{coupons.filter((c) => c.status === "Active").length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Running campaigns</p>
              <p className="text-xl font-bold text-gray-800">{campaigns.filter((c) => c.status === "Live").length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2">
            {(["rules", "coupons", "campaigns"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-3.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                  tab === t
                    ? "border-[#129cd3] text-[#129cd3]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "rules" ? "Pricing rules" : t === "coupons" ? "Coupons" : "Campaigns"}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            {tab === "rules" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Rule</th>
                    <th className="text-left font-semibold px-5 py-3">Scope</th>
                    <th className="text-left font-semibold px-5 py-3">Type</th>
                    <th className="text-left font-semibold px-5 py-3">Value</th>
                    <th className="text-left font-semibold px-5 py-3">Last updated</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 text-gray-600">{r.scope}</td>
                      <td className="px-5 py-3 text-gray-700">{r.type}</td>
                      <td className="px-5 py-3 font-semibold text-[#129cd3]">{r.value}</td>
                      <td className="px-5 py-3 text-gray-500">{r.updated}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]">
                            <Pencil size={14} />
                          </button>
                          <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "coupons" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Code</th>
                    <th className="text-left font-semibold px-5 py-3">Type</th>
                    <th className="text-left font-semibold px-5 py-3">Value</th>
                    <th className="text-left font-semibold px-5 py-3">Min Order</th>
                    <th className="text-left font-semibold px-5 py-3">Usage</th>
                    <th className="text-left font-semibold px-5 py-3">Expires</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {coupons.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-[#129cd3] bg-[#e8f7fc] px-2 py-1 rounded text-xs">
                          {c.code}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{c.type}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{c.value}</td>
                      <td className="px-5 py-3 text-gray-600">{c.minOrder}</td>
                      <td className="px-5 py-3 text-gray-600">{c.uses}</td>
                      <td className="px-5 py-3 text-gray-500">{c.expiry}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCls[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]">
                            <Pencil size={14} />
                          </button>
                          <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "campaigns" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Campaign</th>
                    <th className="text-left font-semibold px-5 py-3">Window</th>
                    <th className="text-left font-semibold px-5 py-3">Discount</th>
                    <th className="text-left font-semibold px-5 py-3">Applies to</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{c.name}</td>
                      <td className="px-5 py-3 text-gray-600">
                        <div className="flex items-center gap-1 text-xs">
                          <Clock size={12} />
                          <span>{c.starts} → {c.ends}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-semibold text-[#129cd3]">{c.discount}</td>
                      <td className="px-5 py-3 text-gray-700">{c.categories}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCls[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]">
                            <Pencil size={14} />
                          </button>
                          <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
