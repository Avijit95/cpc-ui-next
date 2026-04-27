"use client";

import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { ChevronLeft, Upload, Plus, X } from "lucide-react";
import { useState } from "react";

export default function AddProductPage() {
  const [variants, setVariants] = useState<{ color: string; storage: string; price: string }[]>([
    { color: "Black", storage: "128 GB", price: "" },
  ]);

  const addVariant = () =>
    setVariants((v) => [...v, { color: "", storage: "", price: "" }]);
  const removeVariant = (i: number) =>
    setVariants((v) => v.filter((_, idx) => idx !== i));

  return (
    <>
      <AdminHeader
        title="Add Product"
        subtitle="Create a new product listing with variants, pricing and media"
        actions={
          <div className="flex items-center gap-2">
            <button className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3]">
              Save draft
            </button>
            <button className="bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Publish
            </button>
          </div>
        }
      />

      <div className="p-6">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#129cd3] mb-4"
        >
          <ChevronLeft size={14} /> Back to products
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-5">
            {/* Basic info */}
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">Basic Information</h3>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Product name</label>
                <input
                  placeholder="e.g. iPhone 15 Pro Max"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Description</label>
                <textarea
                  rows={5}
                  placeholder="Describe key features, specs and what makes this product great…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">SKU</label>
                  <input
                    placeholder="SKU-00001"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Barcode</label>
                  <input
                    placeholder="1234567890123"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>
              </div>
            </section>

            {/* Images */}
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 text-sm mb-4">Product Images</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#129cd3] hover:text-[#129cd3] cursor-pointer transition-colors">
                  <Upload size={20} />
                  <span className="text-[11px] mt-1.5">Upload</span>
                  <input type="file" className="hidden" accept="image/*" />
                </label>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-xs text-gray-400"
                  >
                    Image {i}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-3">PNG or JPG up to 5MB. Recommended 1000×1000 px.</p>
            </section>

            {/* Variants */}
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 text-sm">Variants</h3>
                <button
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#129cd3] hover:underline"
                >
                  <Plus size={13} /> Add variant
                </button>
              </div>
              <div className="space-y-2.5">
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <input
                      placeholder="Color"
                      defaultValue={v.color}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
                    />
                    <input
                      placeholder="Storage / Size"
                      defaultValue={v.storage}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
                    />
                    <input
                      placeholder="Price"
                      defaultValue={v.price}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
                    />
                    <button
                      onClick={() => removeVariant(i)}
                      className="w-9 h-9 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Pricing */}
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">Pricing</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">MRP</label>
                  <input
                    placeholder="₹ 0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Selling price</label>
                  <input
                    placeholder="₹ 0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Cost per item</label>
                  <input
                    placeholder="₹ 0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">GST rate</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white">
                    <option>0%</option>
                    <option>5%</option>
                    <option>12%</option>
                    <option>18%</option>
                    <option>28%</option>
                  </select>
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">Status</h3>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white">
                <option>Active</option>
                <option>Draft</option>
                <option>Archived</option>
              </select>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">Organization</h3>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Category</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white">
                  <option>Smartphones</option>
                  <option>Cameras</option>
                  <option>Speakers</option>
                  <option>Smartwatches</option>
                  <option>Earphones</option>
                  <option>Accessories</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Brand</label>
                <input
                  placeholder="e.g. Apple"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tags</label>
                <input
                  placeholder="featured, trending, new"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">Inventory</h3>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Stock quantity</label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Low stock alert</label>
                <input
                  type="number"
                  placeholder="5"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#129cd3]" defaultChecked />
                <span className="text-xs text-gray-600">Track inventory</span>
              </label>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
