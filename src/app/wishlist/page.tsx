"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { products } from "@/data/products";
import { X, ShoppingCart, Heart, ChevronRight } from "lucide-react";

type WishlistProduct = typeof products[0];

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function WishlistPage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistProduct[]>(products.slice(0, 4));

  const removeItem = (id: number) => {
    setWishlistItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Wishlist</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Heart size={24} className="text-red-500 fill-red-500" />
              My Wishlist{" "}
              <span className="text-base font-normal text-gray-500">({wishlistItems.length} items)</span>
            </h1>
            {wishlistItems.length > 0 && (
              <button
                onClick={() => setWishlistItems([])}
                className="text-sm text-gray-500 hover:text-red-500 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {wishlistItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
              <Heart size={56} className="text-gray-200 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-700 mb-2">Your wishlist is empty</h2>
              <p className="text-gray-500 mb-6">Save items you love to your wishlist and revisit them anytime.</p>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {wishlistItems.map((product) => {
                const discount = product.originalPrice
                  ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                  : 0;
                return (
                  <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group relative hover:shadow-md transition-shadow">
                    {/* Remove button */}
                    <button
                      onClick={() => removeItem(product.id)}
                      className="absolute top-2 right-2 z-10 w-7 h-7 bg-white shadow rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X size={14} />
                    </button>

                    {/* Badge */}
                    {product.badge && (
                      <div className="absolute top-2 left-2 z-10">
                        <span className={`text-white text-[10px] font-bold px-2 py-0.5 rounded ${
                          product.badge === "NEW" ? "bg-green-500" :
                          product.badge === "HOT" ? "bg-red-500" :
                          "bg-[#129cd3]"
                        }`}>
                          {product.badge}
                        </span>
                      </div>
                    )}

                    {/* Image */}
                    <div className="bg-gray-50 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">{product.category}</p>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 line-clamp-2 leading-snug">
                        {product.name}
                      </h3>

                      <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-base font-bold text-[#129cd3]">{formatPrice(product.price)}</span>
                        {product.originalPrice && (
                          <>
                            <span className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
                            <span className="text-[10px] text-green-600 font-semibold">{discount}% off</span>
                          </>
                        )}
                      </div>

                      <button className="w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors">
                        <ShoppingCart size={14} /> Move to Cart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
