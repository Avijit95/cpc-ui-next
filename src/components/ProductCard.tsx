"use client";

import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cartApi, isApiError } from "@/lib/api";
import type { ListCard } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";

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
  const { setCart: syncHeaderCart } = useCart();
  const wishlisted = isWishlisted(product.id);
  const hasDiscount = product.basePrice > product.finalPrice;
  const discount = hasDiscount
    ? Math.round(
        ((product.basePrice - product.finalPrice) / product.basePrice) * 100,
      )
    : 0;
  const badge = product.badges[0];

  return (
    <div className="product-home-card group bg-white border border-gray-200 hover:border-[#8dd4ee] hover:shadow-md transition-all overflow-hidden flex flex-col max-[499px]:rounded-xl">
      {/* Image */}
      <Link
        href={`/products/${product.slug}`}
        className="bg-gray-50 overflow-hidden block shrink-0"
      >
        <div className="grid h-44 max-[499px]:h-32">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              width={400}
              height={400}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="w-full h-44 max-[499px]:h-32 object-contain p-[10px] group-hover:scale-105 transition-transform duration-400 col-start-1 row-start-1"
            />
          ) : (
            <div className="w-full h-44 max-[499px]:h-32 bg-gray-100 col-start-1 row-start-1" />
          )}
          {badge && (
            <span
              className={`col-start-1 row-start-1 self-start justify-self-start m-2 text-white text-[10px] font-bold px-2 py-0.5 rounded ${
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
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className="col-start-1 row-start-1 self-start justify-self-end m-2 w-7 h-7 bg-white shadow rounded-full flex items-center justify-center transition-colors hover:bg-[#e8f7fc] disabled:opacity-50 z-[999]"
            disabled={wishlistBusy}
          >
            <Heart
              size={14}
              className={
                wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"
              }
            />
          </button>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3 max-[499px]:p-[10px] flex flex-col flex-1 min-h-0 justify-end">
        {product.brand && (
          <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">
            {product.brand}
          </p>
        )}
        <Link href={`/products/${product.slug}`}>
          <h3 className="text-xs max-[499px]:text-[13px] max-[499px]:leading-normal font-semibold text-gray-800 mb-2 max-[499px]:mb-[5px] line-clamp-2 leading-snug hover:text-[#129cd3] transition-colors cursor-pointer">
            {product.name}
          </h3>
        </Link>

        {/* Rating — live from catalog aggregate (Gap #12) */}
        {product.ratingAverage !== null && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex">
              {[...Array(5)].map((_, i) => {
                const filled = i < Math.round(product.ratingAverage ?? 0);
                return (
                  <Star
                    key={i}
                    size={11}
                    className={
                      filled
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200 fill-gray-200"
                    }
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-gray-500">
              ({product.reviewCount})
            </span>
          </div>
        )}

        {/* Price */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3 max-[499px]:mb-[5px]">
          <span className="text-sm max-[499px]:text-[14px] max-[499px]:leading-normal font-bold text-[#129cd3]">
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
              syncHeaderCart(await cartApi.addItem({ productId: product.id, qty: 1 }));
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
              : "bg-white border border-[#129cd3] text-[#129cd3] hover:bg-[#129cd3] hover:text-white max-[499px]:bg-[#129cd3] max-[499px]:text-white max-[499px]:border-transparent max-[499px]:hover:bg-[#0e87b5]"
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
      <div className="bg-gray-100 w-full h-44 max-[499px]:h-32 animate-pulse" />
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
