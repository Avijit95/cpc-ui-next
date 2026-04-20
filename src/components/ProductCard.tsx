"use client";

import { Heart, ShoppingCart, Star, Zap } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/data/products";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function ProductCard({ product }: { product: Product }) {
  const [wishlisted, setWishlisted] = useState(false);
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all overflow-hidden flex flex-col">
      {/* Image */}
      <div className="relative bg-gray-50 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Badge */}
        {product.badge && (
          <span className={`absolute top-3 left-3 text-xs font-bold px-2 py-1 rounded-full ${
            product.badge === "NEW" || product.badge === "Just Launched"
              ? "bg-green-500 text-white"
              : product.badge === "HOT"
              ? "bg-red-500 text-white"
              : "bg-orange-400 text-white"
          }`}>
            {product.badge}
          </span>
        )}
        {/* Wishlist */}
        <button
          onClick={() => setWishlisted(!wishlisted)}
          className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Heart
            size={16}
            className={wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"}
          />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-blue-600 font-medium mb-1">{product.category}</p>
        <h3 className="text-sm font-semibold text-gray-800 mb-2 line-clamp-2 leading-snug">{product.name}</h3>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-3">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={12}
                className={i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">({product.reviews.toLocaleString()})</span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-3 mt-auto">
          <span className="text-lg font-bold text-gray-900">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <>
              <span className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
              <span className="text-xs text-green-600 font-semibold">{discount}% off</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
            <ShoppingCart size={14} />
            Add to Cart
          </button>
          <button className="flex items-center justify-center gap-1.5 border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
            <Zap size={14} />
            Buy Now
          </button>
        </div>
      </div>
    </div>
  );
}
