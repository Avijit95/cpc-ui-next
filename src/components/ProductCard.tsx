"use client";

import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cartApi, catalogApi, isApiError } from "@/lib/api";
import type { ListCard, Variant } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { useStock } from "@/lib/stock/StockProvider";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

// Module-level detail cache: avoids duplicate fetches in StrictMode / re-mounts.
// Exported so that the product list page can read variant attributes for filtering.
export type CachedDetail = { stock: number; variants: Variant[]; specs: Record<string, unknown> };
export const detailCache = new Map<string, CachedDetail>();

// Build a short human-readable label for a variant chip.
function variantLabel(v: Variant): string {
  const attrs = v.attributes;
  // Camera subtitle: show color + body/lens info
  if ("lensIncluded" in attrs) {
    const color = attrs.color ? String(attrs.color) : "";
    const lens = String(attrs.lensIncluded) === "Yes" && attrs.lens
      ? `Body with ${attrs.lens}`
      : "Body Only";
    return color ? `${color} · ${lens}` : lens;
  }
  const parts: string[] = [];
  for (const key of ["color", "ram", "storage", "rom"]) {
    if (attrs[key] != null) parts.push(String(attrs[key]));
  }
  return parts.join(" / ") || v.sku;
}

function cameraLensKey(v: Variant): string {
  if (String(v.attributes.lensIncluded) === "Yes") {
    return `lens:${String(v.attributes.lens ?? "")}`.toLowerCase();
  }
  // Body-only: one card per color so White and Black body variants both show
  const color = String(v.attributes.color ?? "").toLowerCase().trim();
  return color ? `body-only:${color}` : "body-only";
}

// Returns the suffix to append to the product name in the card title.
function variantTitleSuffix(v: Variant): string | null {
  const attrs = v.attributes;
  // Camera: body/lens info
  if ("lensIncluded" in attrs) {
    if (String(attrs.lensIncluded) === "Yes" && attrs.lens) return `Body with ${attrs.lens}`;
    return "Body Only";
  }
  // TV: screen size
  if (attrs.size) return String(attrs.size);
  return null;
}

// From a group of same-lens-type variants, pick the best representative:
// prefer in-stock + has image, then in-stock, then has image, then first.
function pickBestCameraVariant(group: Variant[]): Variant {
  return (
    group.find((v) => v.stock > 0 && v.images.length > 0) ??
    group.find((v) => v.stock > 0) ??
    group.find((v) => v.images.length > 0) ??
    group[0]
  );
}

type AddState = "idle" | "busy" | "added" | "error";

export default function ProductCard({
  product,
  variantOverride,
}: {
  product: ListCard;
  variantOverride?: Variant;
}) {
  const [addState, setAddState] = useState<AddState>("idle");
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const router = useRouter();
  const { status } = useAuth();
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const { setCart: syncHeaderCart } = useCart();
  const { stocks, setStock, adjustStock } = useStock();
  const wishlisted = isWishlisted(product.id, variantOverride?.id);
  const badge = product.badges[0];

  // Stock key: per-variant or per-product
  const stockKey = variantOverride ? `v:${variantOverride.id}` : `p:${product.slug}`;

  // Seed the global store with this variant's stock — only if not already tracked,
  // to preserve any live adjustments made from the detail page or cart.
  useEffect(() => {
    if (!variantOverride) return;
    if (stocks[`v:${variantOverride.id}`] === undefined) {
      setStock(`v:${variantOverride.id}`, variantOverride.stock);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantOverride?.id]);

  // Fetch product detail for non-variant cards; populate global stock store.
  // Only seeds keys not already in the store to avoid overwriting live adjustments.
  useEffect(() => {
    if (variantOverride) return;
    const effectiveProductStock = (stock: number, variants: Variant[]) =>
      variants.length > 0 ? Math.max(stock, ...variants.map((v) => v.stock)) : stock;

    const cached = detailCache.get(product.slug);
    if (cached) {
      if (stocks[`p:${product.slug}`] === undefined) {
        setStock(`p:${product.slug}`, effectiveProductStock(cached.stock, cached.variants));
      }
      cached.variants.forEach((v) => {
        if (stocks[`v:${v.id}`] === undefined) setStock(`v:${v.id}`, v.stock);
      });
      return;
    }
    catalogApi.getProduct(product.slug)
      .then((d) => {
        const entry: CachedDetail = { stock: d.stock, variants: d.variants, specs: d.specs ?? {} };
        detailCache.set(product.slug, entry);
        if (stocks[`p:${product.slug}`] === undefined) {
          setStock(`p:${product.slug}`, effectiveProductStock(d.stock, d.variants));
        }
        d.variants.forEach((v) => {
          if (stocks[`v:${v.id}`] === undefined) setStock(`v:${v.id}`, v.stock);
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Displayed values: variant override → product-level data
  const displayImage =
    variantOverride?.images[0]?.url ??
    product.primaryImageUrl ??
    detailCache.get(product.slug)?.variants?.[0]?.images?.[0]?.url ??
    null;
  const displayFinalPrice = variantOverride
    ? variantOverride.pricing.finalPrice
    : product.finalPrice;
  const displayBasePrice = variantOverride
    ? variantOverride.pricing.basePrice
    : product.basePrice;

  // Read stock from global store, falling back to static data before fetch completes.
  const stockValue: number | null =
    stocks[stockKey] !== undefined
      ? stocks[stockKey]
      : (variantOverride?.stock ?? detailCache.get(product.slug)?.stock ?? product.stock ?? null);

  const hasDiscount2 = displayBasePrice > displayFinalPrice;
  const discount2 = hasDiscount2
    ? Math.round(((displayBasePrice - displayFinalPrice) / displayBasePrice) * 100)
    : 0;

  const productLink = variantOverride
    ? `/products/${product.slug}?variant=${variantOverride.id}`
    : `/products/${product.slug}`;

  const variantAttrLabel = variantOverride ? variantLabel(variantOverride) : null;
  const cameraTitleSuffix = variantOverride ? variantTitleSuffix(variantOverride) : null;

  const isOutOfStock = stockValue !== null && stockValue === 0;
  const isCriticalStock = stockValue !== null && stockValue > 0 && stockValue < 5;
  const isLowStock = stockValue !== null && stockValue >= 5 && stockValue < 10;

  return (
    <div className="product-home-card group bg-white border border-gray-200 hover:border-[#8dd4ee] hover:shadow-md transition-all overflow-hidden flex flex-col max-[499px]:rounded-xl">
      {/* Image */}
      <Link
        href={productLink}
        className="bg-gray-50 overflow-hidden block shrink-0"
      >
        <div className="grid h-44 max-[499px]:h-32 bg-black">
          {displayImage ? (
            <Image
              src={displayImage}
              alt={product.name}
              width={400}
              height={400}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className={`w-full h-44 max-[499px]:h-32 object-contain p-[10px] transition-transform duration-400 col-start-1 row-start-1 ${
                isOutOfStock
                  ? "opacity-40 grayscale"
                  : "group-hover:scale-105"
              }`}
            />
          ) : (
            <div className="w-full h-44 max-[499px]:h-32 bg-gray-100 col-start-1 row-start-1 " />
          )}
          {badge && !isOutOfStock && (
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
                  await removeByProductId(product.id, variantOverride?.id);
                } else {
                  await addToWishlist(product.id, variantOverride?.id);
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
        {isOutOfStock && (
          <p className="text-[11px] font-semibold text-red-500 mb-1">
            Currently unavailable
          </p>
        )}
        {product.brand && (
          <p className="text-[10px] text-[#129cd3] font-semibold uppercase mb-1">
            {product.brand}
          </p>
        )}
        <Link href={productLink}>
          <h3 className="text-xs max-[499px]:text-[13px] max-[499px]:leading-normal font-semibold text-gray-800 mb-1 max-[499px]:mb-[5px] line-clamp-2 leading-snug hover:text-[#129cd3] transition-colors cursor-pointer">
            {product.name}{cameraTitleSuffix ? ` ${cameraTitleSuffix}` : ""}
          </h3>
        </Link>
        {variantAttrLabel && (
          <p className="text-[10px] text-gray-500 mb-1 truncate">{variantAttrLabel}</p>
        )}

        {/* Rating */}
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

        {/* Stock status */}
        {isCriticalStock && (
          <p className="text-[10px] font-semibold text-red-500 mb-1">
            Only {stockValue} left!
          </p>
        )}
        {isLowStock && (
          <p className="text-[10px] font-semibold text-orange-500 mb-1">
            Few left
          </p>
        )}

        {/* Price */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3 max-[499px]:mb-[5px]">
          <span className="text-sm max-[499px]:text-[14px] max-[499px]:leading-normal font-bold text-[#129cd3]">
            {formatPrice(displayFinalPrice)}
          </span>
          {hasDiscount2 && (
            <>
              <span className="text-xs text-gray-400 line-through">
                {formatPrice(displayBasePrice)}
              </span>
              <span className="text-[10px] text-green-600 font-semibold">
                {discount2}% off
              </span>
            </>
          )}
        </div>

        {/* Add to Cart */}
        <button
          onClick={async () => {
            if (isOutOfStock) return;
            if (status === "unauthenticated") {
              const path = window.location.pathname + window.location.search;
              router.push(`/login?next=${encodeURIComponent(path)}`);
              return;
            }
            setAddState("busy");
            try {
              syncHeaderCart(await cartApi.addItem({
                productId: product.id,
                variantId: variantOverride?.id,
                qty: 1,
              }));
              adjustStock(stockKey, -1);
              setAddState("added");
              window.setTimeout(() => setAddState("idle"), 1500);
            } catch (err) {
              setAddState("error");
              window.setTimeout(() => setAddState("idle"), 2000);
              if (!isApiError(err)) console.error(err);
            }
          }}
          disabled={addState === "busy" || isOutOfStock}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 transition-colors rounded ${
            isOutOfStock
              ? "bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed"
              : addState === "added"
              ? "bg-green-50 border border-green-500 text-green-600"
              : addState === "error"
              ? "bg-red-50 border border-red-300 text-red-600"
              : "bg-white border border-[#129cd3] text-[#129cd3] hover:bg-[#129cd3] hover:text-white max-[499px]:bg-[#129cd3] max-[499px]:text-white max-[499px]:border-transparent max-[499px]:hover:bg-[#0e87b5]"
          } ${addState === "busy" ? "opacity-60 cursor-wait" : ""}`}
        >
          {isOutOfStock ? (
            <>Add to Cart</>
          ) : addState === "added" ? (
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

/**
 * Fetches the product detail and renders one card per variant (if the product
 * has variants), or a single card if it does not.
 */
export function ProductCardExpander({
  product,
  priceSortDir,
  priceMin,
  priceMax,
  variantFilter,
}: {
  product: ListCard;
  priceSortDir?: "asc" | "desc";
  priceMin?: number;
  priceMax?: number;
  variantFilter?: (v: Variant) => boolean;
}) {
  const { stocks, setStock } = useStock();
  const [variants, setVariants] = useState<Variant[]>(
    () => detailCache.get(product.slug)?.variants ?? []
  );

  useEffect(() => {
    const cached = detailCache.get(product.slug);
    if (cached) {
      // Only seed keys not already in the live store.
      if (stocks[`p:${product.slug}`] === undefined) {
        setStock(`p:${product.slug}`, cached.stock);
      }
      cached.variants.forEach((v) => {
        if (stocks[`v:${v.id}`] === undefined) setStock(`v:${v.id}`, v.stock);
      });
      return;
    }
    catalogApi.getProduct(product.slug)
      .then((d) => {
        const entry: CachedDetail = { stock: d.stock, variants: d.variants, specs: d.specs ?? {} };
        detailCache.set(product.slug, entry);
        if (stocks[`p:${product.slug}`] === undefined) {
          setStock(`p:${product.slug}`, d.stock);
        }
        d.variants.forEach((v) => {
          if (stocks[`v:${v.id}`] === undefined) setStock(`v:${v.id}`, v.stock);
        });
        setVariants(d.variants);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (variants.length === 0) {
    return <ProductCard product={product} />;
  }

  // Camera: one card per lens type (Body Only, Body with each lens).
  // Colors are selected on the detail page.
  const isCamera = variants.some((v) => "lensIncluded" in v.attributes);
  if (isCamera) {
    const groups = new Map<string, Variant[]>();
    for (const v of variants) {
      const key = cameraLensKey(v);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    const cameraVariants = [...groups.values()].map(pickBestCameraVariant);
    return (
      <>
        {cameraVariants.map((v) => (
          <ProductCard key={v.id} product={product} variantOverride={v} />
        ))}
      </>
    );
  }

  const sortedVariants = priceSortDir
    ? [...variants].sort((a, b) =>
        priceSortDir === "asc"
          ? a.pricing.finalPrice - b.pricing.finalPrice
          : b.pricing.finalPrice - a.pricing.finalPrice
      )
    : variants;

  // Filter variants by price range and/or any additional caller-supplied filter
  const visibleVariants = sortedVariants.filter((v) => {
    const p = v.pricing.finalPrice;
    if (priceMin && priceMin > 0 && p < priceMin) return false;
    if (priceMax && p > priceMax) return false;
    if (variantFilter && !variantFilter(v)) return false;
    return true;
  });

  if (visibleVariants.length === 0) return null;

  return (
    <>
      {visibleVariants.map((v) => (
        <ProductCard key={v.id} product={product} variantOverride={v} />
      ))}
    </>
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
