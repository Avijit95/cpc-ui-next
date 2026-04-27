"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import { TrendingUp, Users, ShoppingBag, IndianRupee, Eye, Download } from "lucide-react";

const monthlyRevenue = [
  { m: "May", v: 124 }, { m: "Jun", v: 148 }, { m: "Jul", v: 162 },
  { m: "Aug", v: 139 }, { m: "Sep", v: 178 }, { m: "Oct", v: 221 },
  { m: "Nov", v: 198 }, { m: "Dec", v: 268 }, { m: "Jan", v: 244 },
  { m: "Feb", v: 213 }, { m: "Mar", v: 289 }, { m: "Apr", v: 312 },
];

const categorySplit = [
  { cat: "Smartphones", value: 42, color: "#129cd3" },
  { cat: "Cameras", value: 18, color: "#f59e0b" },
  { cat: "Speakers", value: 14, color: "#10b981" },
  { cat: "Earphones", value: 11, color: "#8b5cf6" },
  { cat: "Smartwatches", value: 9, color: "#ec4899" },
  { cat: "Accessories", value: 6, color: "#64748b" },
];

const topProducts = [
  { name: "iPhone 15 Pro Max", units: 248, revenue: 3349750 },
  { name: "Samsung Galaxy S24 Ultra", units: 192, revenue: 2688000 },
  { name: "Sony WH-1000XM5", units: 412, revenue: 1234800 },
  { name: "OnePlus 12", units: 156, revenue: 1248440 },
  { name: "Canon EOS R50", units: 84, revenue: 629916 },
];

const customerCohorts = [
  { label: "New", value: 64, color: "bg-[#129cd3]" },
  { label: "Returning", value: 28, color: "bg-amber-400" },
  { label: "Churned", value: 8, color: "bg-red-400" },
];

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function AnalyticsPage() {
  const maxRev = Math.max(...monthlyRevenue.map((d) => d.v));
  const total = categorySplit.reduce((s, c) => s + c.value, 0);

  let acc = 0;
  const pieSegments = categorySplit.map((c) => {
    const start = (acc / total) * 360;
    acc += c.value;
    const end = (acc / total) * 360;
    return { ...c, start, end };
  });

  return (
    <>
      <AdminHeader
        title="Analytics & Reports"
        subtitle="Performance insights across revenue, customers and catalog"
        actions={
          <button className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-4 py-2 hover:border-[#129cd3] hover:text-[#129cd3]">
            <Download size={14} /> Export
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Total Revenue", value: "₹31.2 L", sub: "+14.8% MoM", icon: IndianRupee, tint: "bg-[#e8f7fc] text-[#129cd3]" },
            { label: "Orders", value: "2,847", sub: "+8.2% MoM", icon: ShoppingBag, tint: "bg-amber-100 text-amber-600" },
            { label: "New Customers", value: "1,182", sub: "+22.4% MoM", icon: Users, tint: "bg-emerald-100 text-emerald-600" },
            { label: "Avg Order Value", value: "₹6,482", sub: "+3.1% MoM", icon: TrendingUp, tint: "bg-purple-100 text-purple-600" },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${k.tint}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 uppercase">{k.label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{k.value}</p>
                <p className="text-xs text-emerald-600 font-semibold mt-1">{k.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Revenue chart + category pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-gray-800 text-base">Revenue Trend</h3>
                <p className="text-xs text-gray-500">Last 12 months (₹ in lakhs)</p>
              </div>
              <select className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none hover:border-[#129cd3]">
                <option>Monthly</option>
                <option>Quarterly</option>
              </select>
            </div>
            <div className="flex items-end gap-3 h-56">
              {monthlyRevenue.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-gradient-to-t from-[#129cd3] to-[#8dd4ee] rounded-t hover:opacity-80 transition-opacity"
                    style={{ height: `${(d.v / maxRev) * 100}%` }}
                  />
                  <span className="text-[10px] text-gray-400">{d.m}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-bold text-gray-800 text-base mb-1">Sales by Category</h3>
            <p className="text-xs text-gray-500 mb-4">Revenue share by product category</p>
            <div className="flex items-center justify-center mb-4">
              <div
                className="w-40 h-40 rounded-full relative"
                style={{
                  background: `conic-gradient(${pieSegments
                    .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
                    .join(", ")})`,
                }}
              >
                <div className="absolute inset-6 bg-white rounded-full flex items-center justify-center flex-col">
                  <span className="text-xl font-bold text-gray-800">100%</span>
                  <span className="text-[10px] text-gray-400">Total share</span>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {categorySplit.map((c) => (
                <li key={c.cat} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                    <span className="text-gray-700">{c.cat}</span>
                  </span>
                  <span className="font-semibold text-gray-800">{c.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Top products + customer cohorts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-base">Top Performing Products</h3>
              <button className="text-xs font-semibold text-[#129cd3] hover:underline flex items-center gap-1">
                <Eye size={12} /> View all
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-2.5">#</th>
                  <th className="text-left font-semibold px-5 py-2.5">Product</th>
                  <th className="text-left font-semibold px-5 py-2.5">Units</th>
                  <th className="text-left font-semibold px-5 py-2.5">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map((p, i) => (
                  <tr key={p.name} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <span className="w-6 h-6 rounded-lg bg-[#e8f7fc] text-[#129cd3] text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{p.name}</td>
                    <td className="px-5 py-3 text-gray-700">{p.units}</td>
                    <td className="px-5 py-3 font-semibold text-[#129cd3]">{formatPrice(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-bold text-gray-800 text-base mb-1">Customer Cohorts</h3>
            <p className="text-xs text-gray-500 mb-5">Distribution this month</p>
            <div className="space-y-5">
              {customerCohorts.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700">{c.label}</span>
                    <span className="text-xs font-bold text-gray-800">{c.value}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${c.color} rounded-full`} style={{ width: `${c.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-500">Customer retention</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">78.4%</p>
              <p className="text-xs text-emerald-600 font-semibold mt-1">+4.2% vs last month</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
