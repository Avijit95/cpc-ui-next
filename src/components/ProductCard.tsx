"use client";

import { Heart, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/data/products";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function ProductCard({ product }: { product: Product }) {
  const [wishlisted, setWishlisted] = useState(false);
  const router = useRouter();
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="group bg-white border border-gray-200 hover:border-[#8dd4ee] hover:shadow-md transition-all overflow-hidden flex flex-col">
      {/* Image */}
      <Link href={`/products/${product.id}`} className="relative bg-gray-50 overflow-hidden block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-44 object-contain p-3 group-hover:scale-105 transition-transform duration-400"
        />
        {product.badge && (
          <span
            className={`absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded ${
              product.badge === "NEW" ? "bg-green-500" :
              product.badge === "HOT" ? "bg-red-500" :
              "bg-[#129cd3]"
            }`}
          >
            {product.badge}
          </span>
        )}
        <button
          onClick={(e) => { e.preventDefault(); setWishlisted(!wishlisted); }}
          className="absolute top-2 right-2 w-7 h-7 bg-white shadow rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#e8f7fc]"
        >
          <Heart
            size={14}
            className={wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"}
          />
        </button>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">{product.category}</p>
        <Link href={`/products/${product.id}`}>
          <h3 className="text-xs font-semibold text-gray-800 mb-2 line-clamp-2 leading-snug hover:text-[#129cd3] transition-colors cursor-pointer">
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-2">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={11}
                className={i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"}
              />
            ))}
          </div>
          <span className="text-[10px] text-gray-500">({product.reviews.toLocaleString()})</span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-3 mt-auto">
          <span className="text-sm font-bold text-[#129cd3]">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <>
              <span className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
              <span className="text-[10px] text-green-600 font-semibold">{discount}% off</span>
            </>
          )}
        </div>

        {/* Add to Cart */}
        <button
          onClick={() => router.push("/cart")}
          className="w-full flex items-center justify-center gap-1.5 bg-white border border-[#129cd3] text-[#129cd3] hover:bg-[#129cd3] hover:text-white text-xs font-semibold py-2 transition-colors rounded"
        >
          <ShoppingCart size={13} />
          Add to Cart
        </button>
      </div>
    </div>
  );
}
