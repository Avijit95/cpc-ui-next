"use client";

import { useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { products } from "@/data/products";
import { Plus, Search, Filter, Pencil, Trash2, MoreHorizontal, Package } from "lucide-react";

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function AdminProductsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const cats = ["All", ...Array.from(new Set(products.map((p) => p.category)))];

  const filtered = products.filter((p) => {
    const q = query.toLowerCase();
    const matchName = p.name.toLowerCase().includes(q);
    const matchCat = category === "All" || p.category === category;
    return matchName && matchCat;
  });

  return (
    <>
      <AdminHeader
        title="Products"
        subtitle="Add, edit or remove products from your catalog"
        actions={
          <Link
            href="/admin/products/add"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Add product
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Inventory summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Total Products", value: products.length, tint: "bg-[#e8f7fc] text-[#129cd3]" },
            { label: "In Stock", value: products.length - 2, tint: "bg-emerald-50 text-emerald-600" },
            { label: "Low Stock", value: 6, tint: "bg-amber-50 text-amber-600" },
            { label: "Out of Stock", value: 2, tint: "bg-red-50 text-red-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.tint}`}>
                <Package size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
          >
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-2 hover:border-[#129cd3] hover:text-[#129cd3]">
            <Filter size={14} /> More filters
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Product</th>
                  <th className="text-left font-semibold px-5 py-3">Category</th>
                  <th className="text-left font-semibold px-5 py-3">Price</th>
                  <th className="text-left font-semibold px-5 py-3">Stock</th>
                  <th className="text-left font-semibold px-5 py-3">Rating</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const stock = (p.id * 7) % 40;
                  const stockStatus =
                    stock === 0
                      ? "out"
                      : stock < 5
                        ? "low"
                        : "ok";
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image} alt={p.name} className="w-11 h-11 object-cover rounded-lg border border-gray-100" />
                          <div>
                            <p className="font-semibold text-gray-800 line-clamp-1">{p.name}</p>
                            <p className="text-xs text-gray-500">SKU-{String(p.id).padStart(5, "0")}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{p.category}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800">{formatPrice(p.price)}</p>
                        {p.originalPrice && (
                          <p className="text-[11px] text-gray-400 line-through">{formatPrice(p.originalPrice)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            stockStatus === "out"
                              ? "text-red-500"
                              : stockStatus === "low"
                                ? "text-amber-600"
                                : "text-emerald-600"
                          }`}
                        >
                          {stock} units
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{p.rating.toFixed(1)} ★</td>
                      <td className="px-5 py-3">
                        {stockStatus === "out" ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
                            Out of stock
                          </span>
                        ) : stockStatus === "low" ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-600 border-amber-200">
                            Low stock
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]" aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                          <button className="p-1.5 rounded text-gray-400 hover:text-gray-700">
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {filtered.length} of {products.length} products</span>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3]">‹</button>
              <button className="w-7 h-7 rounded bg-[#129cd3] text-white">1</button>
              <button className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3]">2</button>
              <button className="w-7 h-7 rounded border border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3]">›</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
