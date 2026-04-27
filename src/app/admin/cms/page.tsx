"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Plus, Pencil, Trash2, Eye, EyeOff, Image as ImageIcon, LayoutGrid, Megaphone } from "lucide-react";

type Tab = "heroSlides" | "promoBanners" | "pages";

const heroSlides = [
  { id: 1, title: "Flagship smartphones", image: "/slide1.jpg", badge: "NEW DROP", active: true, order: 1 },
  { id: 2, title: "Camera collection", image: "/slide2.jpg", badge: "UP TO 40% OFF", active: true, order: 2 },
  { id: 3, title: "Audio experience", image: "/slide3.jpg", badge: "BEST DEAL", active: false, order: 3 },
];

const promoBanners = [
  { id: 1, slot: "Right panel #1", image: "/1.webp", link: "/products?category=Smartphones", active: true },
  { id: 2, slot: "Right panel #2", image: "/2.webp", link: "/products?category=Cameras", active: true },
];

const pages = [
  { id: 1, title: "About us", slug: "/about", updated: "2026-03-12", status: "Published" },
  { id: 2, title: "Privacy policy", slug: "/privacy", updated: "2026-02-18", status: "Published" },
  { id: 3, title: "Refund policy", slug: "/refund", updated: "2026-02-18", status: "Published" },
  { id: 4, title: "Partner program", slug: "/dealer", updated: "2026-04-21", status: "Draft" },
];

export default function CmsPage() {
  const [tab, setTab] = useState<Tab>("heroSlides");

  return (
    <>
      <AdminHeader
        title="CMS"
        subtitle="Banners, hero slides and editable content pages"
        actions={
          <button className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New {tab === "heroSlides" ? "slide" : tab === "promoBanners" ? "banner" : "page"}
          </button>
        }
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <LayoutGrid size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Hero slides</p>
              <p className="text-xl font-bold text-gray-800">{heroSlides.length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Megaphone size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Promo banners</p>
              <p className="text-xl font-bold text-gray-800">{promoBanners.length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Content pages</p>
              <p className="text-xl font-bold text-gray-800">{pages.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2">
            {([
              { id: "heroSlides" as const, label: "Hero slides" },
              { id: "promoBanners" as const, label: "Promo banners" },
              { id: "pages" as const, label: "Pages" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-[#129cd3] text-[#129cd3]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "heroSlides" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {heroSlides.map((s) => (
                  <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden group">
                    <div className="relative h-36 bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt={s.title} className="w-full h-full object-cover" />
                      <span className="absolute top-2 left-2 bg-yellow-400 text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded">
                        {s.badge}
                      </span>
                      <span
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          s.active ? "bg-emerald-500 text-white" : "bg-gray-500 text-white"
                        }`}
                      >
                        {s.active ? "Live" : "Hidden"}
                      </span>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{s.title}</p>
                        <p className="text-xs text-gray-500">Order #{s.order}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]">
                          {s.active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]">
                          <Pencil size={14} />
                        </button>
                        <button className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "promoBanners" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {promoBanners.map((b) => (
                  <div key={b.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="relative h-48 bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image} alt={b.slot} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm text-gray-800">{b.slot}</p>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            b.active ? "bg-emerald-500 text-white" : "bg-gray-500 text-white"
                          }`}
                        >
                          {b.active ? "Live" : "Hidden"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mb-3">{b.link}</p>
                      <div className="flex items-center gap-2">
                        <button className="flex-1 text-xs font-semibold border border-gray-200 rounded-lg px-3 py-1.5 hover:border-[#129cd3] hover:text-[#129cd3]">
                          Edit
                        </button>
                        <button className="flex-1 text-xs font-semibold border border-red-200 text-red-500 rounded-lg px-3 py-1.5 hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "pages" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left font-semibold px-5 py-3">Page</th>
                      <th className="text-left font-semibold px-5 py-3">Slug</th>
                      <th className="text-left font-semibold px-5 py-3">Last updated</th>
                      <th className="text-left font-semibold px-5 py-3">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pages.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-semibold text-gray-800">{p.title}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{p.slug}</td>
                        <td className="px-5 py-3 text-gray-500">{p.updated}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              p.status === "Published"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {p.status}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
