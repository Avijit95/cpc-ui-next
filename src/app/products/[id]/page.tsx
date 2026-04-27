"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { products } from "@/data/products";
import { Star, Heart, ShoppingCart, Truck, ShieldCheck, RotateCcw, ChevronRight } from "lucide-react";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

const tabs = ["Description", "Specifications", "Reviews"] as const;
type TabType = typeof tabs[number];

const mockSpecs: Record<string, string> = {
  "Brand": "Apple / Samsung / Sony",
  "Model Year": "2024",
  "Connectivity": "Bluetooth 5.3, Wi-Fi 6E",
  "Battery": "5000 mAh",
  "Warranty": "1 Year Manufacturer Warranty",
  "In the Box": "Device, Charging Cable, Adapter, Manual",
};

const mockReviews = [
  { name: "Rahul S.", rating: 5, comment: "Absolutely love this product! Build quality is top-notch.", date: "12 Mar 2024" },
  { name: "Priya M.", rating: 4, comment: "Great value for money. Delivery was fast too.", date: "28 Feb 2024" },
  { name: "Aakash T.", rating: 5, comment: "Best purchase this year. Highly recommend!", date: "14 Jan 2024" },
];

export default function ProductDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const product = products.find((p) => p.id === id);

  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("Description");
  const [wishlisted, setWishlisted] = useState(false);

  if (!product) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Product Not Found</h2>
            <p className="text-gray-500 mb-6">The product you are looking for does not exist.</p>
            <Link href="/products" className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              Browse Products
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <Link href="/products" className="hover:text-[#129cd3]">Products</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium line-clamp-1">{product.name}</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Product Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:p-8 flex flex-col lg:flex-row gap-8 mb-8">
            {/* Left: Image */}
            <div className="lg:w-2/5 flex-shrink-0">
              <div className="bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center aspect-square border border-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain p-8"
                />
              </div>
              <div className="flex gap-2 mt-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-16 h-16 bg-gray-50 rounded-lg border-2 border-[#129cd3] overflow-hidden cursor-pointer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Details */}
            <div className="flex-1">
              {/* Category badge */}
              <span className="inline-block bg-[#e8f7fc] text-[#129cd3] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                {product.category}
              </span>

              <h1 className="text-2xl font-bold text-gray-900 mb-3 leading-snug">{product.name}</h1>

              {/* Rating */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}
                    />
                  ))}
                </div>
                <span className="text-sm font-semibold text-gray-700">{product.rating}</span>
                <span className="text-sm text-gray-500">({product.reviews.toLocaleString()} reviews)</span>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl font-bold text-[#129cd3]">{formatPrice(product.price)}</span>
                {product.originalPrice && (
                  <>
                    <span className="text-lg text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
                    <span className="bg-green-100 text-green-700 text-sm font-bold px-2 py-0.5 rounded">{discount}% OFF</span>
                  </>
                )}
              </div>
              {product.originalPrice && (
                <p className="text-sm text-green-600 font-medium mb-4">
                  You save {formatPrice(product.originalPrice - product.price)}
                </p>
              )}

              {/* Stock */}
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-sm font-semibold text-green-600">In Stock</span>
                <span className="text-sm text-gray-400">· Usually dispatched in 24 hours</span>
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4 mb-5">
                <span className="text-sm font-medium text-gray-700">Quantity:</span>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-medium transition-colors"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-semibold text-gray-800">{qty}</span>
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-medium transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <button className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3 rounded-lg transition-colors">
                  <ShoppingCart size={18} /> Add to Cart
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors">
                  Buy Now
                </button>
                <button
                  onClick={() => setWishlisted(!wishlisted)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-lg font-semibold transition-colors ${
                    wishlisted
                      ? "border-red-400 bg-red-50 text-red-500"
                      : "border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
                  }`}
                >
                  <Heart size={18} className={wishlisted ? "fill-red-400" : ""} />
                  <span className="hidden sm:inline">{wishlisted ? "Wishlisted" : "Wishlist"}</span>
                </button>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-5 border-t border-gray-100">
                {[
                  { icon: <Truck size={18} className="text-[#129cd3]" />, label: "Free Delivery", sub: "On orders above ₹999" },
                  { icon: <ShieldCheck size={18} className="text-[#129cd3]" />, label: "1 Year Warranty", sub: "Official warranty" },
                  { icon: <RotateCcw size={18} className="text-[#129cd3]" />, label: "Easy Returns", sub: "10-day return policy" },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center text-center gap-1 p-2">
                    {item.icon}
                    <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                    <span className="text-[10px] text-gray-400">{item.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 text-sm font-semibold transition-colors ${
                    activeTab === tab
                      ? "text-[#129cd3] border-b-2 border-[#129cd3]"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === "Description" && (
                <div className="prose max-w-none text-gray-600 text-sm leading-relaxed space-y-3">
                  <p>
                    The <strong className="text-gray-800">{product.name}</strong> is a premium device in the <strong className="text-gray-800">{product.category}</strong> category, designed to deliver an exceptional user experience. Engineered with cutting-edge technology and premium materials, it sets a new standard in its class.
                  </p>
                  <p>
                    Whether you are a professional or an enthusiast, this device is built to handle demanding tasks with ease. The sleek design combined with powerful internals makes it a perfect companion for everyday use.
                  </p>
                  <p>
                    With a high-resolution display, industry-leading performance, and a long-lasting battery, the {product.name} ensures that you stay connected and productive throughout the day.
                  </p>
                </div>
              )}

              {activeTab === "Specifications" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(mockSpecs).map(([key, value], i) => (
                        <tr key={key} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          <td className="py-3 px-4 font-semibold text-gray-700 w-48">{key}</td>
                          <td className="py-3 px-4 text-gray-600">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "Reviews" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                    <div className="text-5xl font-bold text-[#129cd3]">{product.rating}</div>
                    <div>
                      <div className="flex mb-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={18} className={i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"} />
                        ))}
                      </div>
                      <p className="text-sm text-gray-500">{product.reviews.toLocaleString()} verified reviews</p>
                    </div>
                  </div>
                  {mockReviews.map((review, i) => (
                    <div key={i} className="pb-4 border-b border-gray-100 last:border-0">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <span className="font-semibold text-sm text-gray-800">{review.name}</span>
                          <div className="flex mt-0.5">
                            {[...Array(5)].map((_, j) => (
                              <Star key={j} size={12} className={j < review.rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"} />
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{review.date}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{review.comment}</p>
                    </div>
                  ))}
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
