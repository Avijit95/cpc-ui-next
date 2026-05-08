"use client";

import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cartApi, isApiError } from "@/lib/api";
import type { ListCard } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

type AddState = "idle" | "busy" | "added" | "error";

export default function ProductCard({ product }: { product: ListCard }) {
  const [addState, setAddState] = useState<AddState>("idle");
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const router = useRouter();
  const { status } = useAuth();
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const hasDiscount = product.basePrice > product.finalPrice;
  const discount = hasDiscount
    ? Math.round(
        ((product.basePrice - product.finalPrice) / product.basePrice) * 100,
      )
    : 0;
  const badge = product.badges[0];

  return (
    <div className="group bg-white border border-gray-200 hover:border-[#8dd4ee] hover:shadow-md transition-all overflow-hidden flex flex-col">
      {/* Image */}
      <Link
        href={`/products/${product.slug}`}
        className="relative bg-gray-50 overflow-hidden block"
      >
        {product.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            className="w-full h-44 object-contain p-3 group-hover:scale-105 transition-transform duration-400"
          />
        ) : (
          <div className="w-full h-44" />
        )}
        {badge && (
          <span
            className={`absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded ${
              badge === "NEW"
                ? "bg-green-500"
                : badge === "HOT"
                ? "bg-red-500"
                : "bg-[#129cd3]"
            }`}
          >
            {badge}
          </span>
        )}
        <button
          onClick={async (e) => {
            e.preventDefault();
            if (wishlistBusy) return;
            if (status === "unauthenticated") {
              const path = window.location.pathname + window.location.search;
              router.push(`/login?next=${encodeURIComponent(path)}`);
              return;
            }
            setWishlistBusy(true);
            try {
              if (wishlisted) {
                await removeByProductId(product.id);
              } else {
                await addToWishlist(product.id);
              }
            } catch {
              // Silent fail on heart toggle — full-page error UX would be intrusive.
            } finally {
              setWishlistBusy(false);
            }
          }}
          className={`absolute top-2 right-2 w-7 h-7 bg-white shadow rounded-full flex items-center justify-center transition-opacity hover:bg-[#e8f7fc] disabled:opacity-50 ${
            wishlisted ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          disabled={wishlistBusy}
        >
          <Heart
            size={14}
            className={
              wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"
            }
          />
        </button>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        {product.brand && (
          <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">
            {product.brand}
          </p>
        )}
        <Link href={`/products/${product.slug}`}>
          <h3 className="text-xs font-semibold text-gray-800 mb-2 line-clamp-2 leading-snug hover:text-[#129cd3] transition-colors cursor-pointer">
            {product.name}
          </h3>
        </Link>

        {/* Rating (placeholder until reviews API ships) */}
        <div className="flex items-center gap-1 mb-2">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={11}
                className="text-gray-200 fill-gray-200"
              />
            ))}
          </div>
          <span className="text-[10px] text-gray-500">(0)</span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-3 mt-auto">
          <span className="text-sm font-bold text-[#129cd3]">
            {formatPrice(product.finalPrice)}
          </span>
          {hasDiscount && (
            <>
              <span className="text-xs text-gray-400 line-through">
                {formatPrice(product.basePrice)}
              </span>
              <span className="text-[10px] text-green-600 font-semibold">
                {discount}% off
              </span>
            </>
          )}
        </div>

        {/* Add to Cart */}
        <button
          onClick={async () => {
            if (status === "unauthenticated") {
              const path = window.location.pathname + window.location.search;
              router.push(`/login?next=${encodeURIComponent(path)}`);
              return;
            }
            setAddState("busy");
            try {
              await cartApi.addItem({ productId: product.id, qty: 1 });
              setAddState("added");
              window.setTimeout(() => setAddState("idle"), 1500);
            } catch (err) {
              setAddState("error");
              window.setTimeout(() => setAddState("idle"), 2000);
              if (!isApiError(err)) console.error(err);
            }
          }}
          disabled={addState === "busy"}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 transition-colors rounded ${
            addState === "added"
              ? "bg-green-50 border border-green-500 text-green-600"
              : addState === "error"
              ? "bg-red-50 border border-red-300 text-red-600"
              : "bg-white border border-[#129cd3] text-[#129cd3] hover:bg-[#129cd3] hover:text-white"
          } ${addState === "busy" ? "opacity-60 cursor-wait" : ""}`}
        >
          {addState === "added" ? (
            <>
              <Check size={13} /> Added
            </>
          ) : addState === "error" ? (
            <>Could not add</>
          ) : (
            <>
              <ShoppingCart size={13} /> Add to Cart
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 overflow-hidden flex flex-col">
      <div className="bg-gray-100 w-full h-44 animate-pulse" />
      <div className="p-3 flex flex-col flex-1 gap-2">
        <div className="h-2 w-12 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-gray-100 rounded animate-pulse" />
        <div className="flex gap-1 mt-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-3 w-3 bg-gray-100 rounded-full animate-pulse"
            />
          ))}
        </div>
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse mt-auto" />
        <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}
