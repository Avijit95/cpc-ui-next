"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { products } from "@/data/products";
import { Trash2, Tag, Truck, ShieldCheck, ChevronRight } from "lucide-react";

type CartItem = {
  product: typeof products[0];
  qty: number;
};

const initialCart: CartItem[] = [
  { product: products[0], qty: 1 },
  { product: products[1], qty: 2 },
  { product: products[3], qty: 1 },
];

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>(initialCart);
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);

  const updateQty = (id: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.product.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item
        )
    );
  };

  const removeItem = (id: number) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== id));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const discount = 5000;
  const shipping = 0;
  const grandTotal = subtotal - discount + shipping;

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Shopping Cart</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">
            Shopping Cart{" "}
            <span className="text-base font-normal text-gray-500">({cartItems.length} items)</span>
          </h1>

          {cartItems.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
              <div className="text-6xl mb-4">🛒</div>
              <h2 className="text-xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
              <p className="text-gray-500 mb-6">Add some products to get started.</p>
              <Link href="/products" className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors">
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Cart Items */}
              <div className="flex-1 space-y-4">
                {cartItems.map((item) => {
                  const itemTotal = item.product.price * item.qty;
                  return (
                    <div key={item.product.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                      {/* Image */}
                      <div className="w-24 h-24 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#129cd3] font-semibold uppercase mb-0.5">{item.product.category}</p>
                        <h3 className="text-sm font-semibold text-gray-800 mb-1 line-clamp-2">{item.product.name}</h3>
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-base font-bold text-[#129cd3]">{formatPrice(item.product.price)}</span>
                          {item.product.originalPrice && (
                            <span className="text-sm text-gray-400 line-through">{formatPrice(item.product.originalPrice)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Qty */}
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                            <button
                              onClick={() => updateQty(item.product.id, -1)}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-semibold text-gray-800">{item.qty}</span>
                            <button
                              onClick={() => updateQty(item.product.id, 1)}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => removeItem(item.product.id)}
                            className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-xs font-medium transition-colors"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      </div>

                      {/* Item total */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-gray-400 mb-1">Total</p>
                        <p className="text-base font-bold text-gray-800">{formatPrice(itemTotal)}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Coupon */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Tag size={16} className="text-[#129cd3]" /> Apply Coupon
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] text-gray-800"
                    />
                    <button
                      onClick={() => coupon.length > 0 && setCouponApplied(true)}
                      className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                  {couponApplied && (
                    <p className="text-green-600 text-xs mt-2 font-medium">
                      Coupon &quot;{coupon}&quot; applied successfully! You save ₹5,000
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Order Summary */}
              <div className="lg:w-80 flex-shrink-0">
                <div className="bg-white rounded-xl border border-gray-200 p-5 lg:sticky lg:top-24">
                  <h2 className="text-base font-bold text-gray-800 mb-4 pb-3 border-b border-gray-100">
                    Order Summary
                  </h2>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal ({cartItems.length} items)</span>
                      <span className="font-semibold text-gray-800">{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Discount</span>
                      <span className="font-semibold text-green-600">−{formatPrice(discount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Shipping</span>
                      <span className="font-semibold text-green-600 flex items-center gap-1">
                        <Truck size={13} /> Free
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 mb-4">
                    <div className="flex justify-between">
                      <span className="font-bold text-gray-800">Grand Total</span>
                      <span className="font-bold text-lg text-[#129cd3]">{formatPrice(grandTotal)}</span>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
                    <span className="text-green-600 text-sm">🎉</span>
                    <span className="text-green-700 text-xs font-semibold">You save {formatPrice(discount)} on this order!</span>
                  </div>

                  <div className="bg-[#e8f7fc] rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-xs text-[#129cd3]">
                    <Truck size={14} />
                    <span>Estimated delivery: <strong>3–5 business days</strong></span>
                  </div>

                  <a
                    href="/invoice"
                    className="w-full flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors"
                  >
                    Proceed to Invoice <ChevronRight size={16} />
                  </a>

                  <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-400">
                    <ShieldCheck size={13} /> Secure Checkout — SSL Encrypted
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
