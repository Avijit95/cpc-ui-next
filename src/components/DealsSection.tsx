"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Zap } from "lucide-react";
import { products } from "@/data/products";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function Countdown({ target }: { target: Date }) {
  const calc = () => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      h: Math.floor(diff / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  const [time, setTime] = useState(calc);

  useEffect(() => {
    const t = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-1">
      {[pad(time.h), pad(time.m), pad(time.s)].map((v, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="bg-gray-900 text-white text-sm font-bold w-9 h-9 rounded-lg flex items-center justify-center tabular-nums">
            {v}
          </span>
          {i < 2 && <span className="text-gray-900 font-bold text-lg">:</span>}
        </span>
      ))}
    </div>
  );
}

const dealProducts = products.filter((p) => p.originalPrice).slice(0, 4);

export default function DealsSection() {
  const target = new Date(Date.now() + 8 * 3600000);

  return (
    <section className="py-10 px-4 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🔥</span>
              <h2 className="text-2xl font-bold text-gray-900">Today&apos;s Deals</h2>
            </div>
            <p className="text-gray-500 text-sm">Hurry up! Limited time offers</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Ends in:</span>
            <Countdown target={target} />
          </div>
        </div>

        {/* Products */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {dealProducts.map((product) => {
            const discount = product.originalPrice
              ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
              : 0;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-transparent hover:border-blue-200"
              >
                {/* Image */}
                <div className="relative bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-44 object-cover"
                  />
                  <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    -{discount}% OFF
                  </span>
                </div>

                {/* Content */}
                <div className="p-4">
                  <p className="text-xs text-blue-600 font-medium">{product.category}</p>
                  <h3 className="text-sm font-semibold text-gray-800 mt-1 mb-2 line-clamp-1">{product.name}</h3>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Sold: 68%</span>
                      <span>32 left</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: "68%" }} />
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-base font-bold text-gray-900">{formatPrice(product.price)}</span>
                    {product.originalPrice && (
                      <span className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
                      <ShoppingCart size={13} /> Add to Cart
                    </button>
                    <button className="px-3 py-2 border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                      <Zap size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
