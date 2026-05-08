"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cartApi, catalogApi, isApiError } from "@/lib/api";
import type { ProductDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import {
  Star,
  Heart,
  ShoppingCart,
  Truck,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  Check,
} from "lucide-react";

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

const tabs = ["Description", "Specifications", "Reviews"] as const;
type TabType = (typeof tabs)[number];

const mockReviews = [
  { name: "Rahul S.", rating: 5, comment: "Absolutely love this product! Build quality is top-notch.", date: "12 Mar 2024" },
  { name: "Priya M.", rating: 4, comment: "Great value for money. Delivery was fast too.", date: "28 Feb 2024" },
  { name: "Aakash T.", rating: 5, comment: "Best purchase this year. Highly recommend!", date: "14 Jan 2024" },
];

type AddState = "idle" | "busy" | "added" | "error";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useAuth();
  const slug =
    typeof params?.slug === "string"
      ? params.slug
      : Array.isArray(params?.slug)
      ? params.slug[0]
      : "";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("Description");
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [addState, setAddState] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const wishlisted = product ? isWishlisted(product.id) : false;

  useEffect(() => {
    if (!slug) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    catalogApi
      .getProduct(slug, ac.signal)
      .then((p) => {
        setProduct(p);
        setActiveImageIdx(0);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (isApiError(err) && err.statusCode === 404) {
          setNotFound(true);
        } else {
          setError(
            isApiError(err) ? err.displayMessage : "Failed to load product",
          );
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [slug]);

  if (loading) {
    return <PdpSkeleton />;
  }

  if (notFound) {
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

  if (error || !product) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Could not load product</h2>
            <p className="text-gray-500 mb-6">{error ?? "Please try again."}</p>
            <Link href="/products" className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              Browse Products
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const { basePrice, finalPrice } = product.pricing;
  const hasDiscount = basePrice > finalPrice;
  const discount = hasDiscount
    ? Math.round(((basePrice - finalPrice) / basePrice) * 100)
    : 0;
  const immediateCategory = product.breadcrumbs[product.breadcrumbs.length - 1];
  const sortedImages = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeImage = sortedImages[activeImageIdx] ?? sortedImages[0];
  const inStock = product.stock > 0;

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
                {activeImage?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeImage.url}
                    alt={product.name}
                    className="w-full h-full object-contain p-8"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
              {sortedImages.length > 1 && (
                <div className="flex gap-2 mt-3">
                  {sortedImages.slice(0, 4).map((img, i) => (
                    <button
                      key={img.objectKey}
                      onClick={() => setActiveImageIdx(i)}
                      className={`w-16 h-16 bg-gray-50 rounded-lg border-2 overflow-hidden cursor-pointer ${
                        i === activeImageIdx ? "border-[#129cd3]" : "border-gray-200 hover:border-[#8dd4ee]"
                      }`}
                    >
                      {img.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.url} alt={product.name} className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Details */}
            <div className="flex-1">
              {/* Category badge */}
              {immediateCategory && (
                <span className="inline-block bg-[#e8f7fc] text-[#129cd3] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                  {immediateCategory.name}
                </span>
              )}

              <h1 className="text-2xl font-bold text-gray-900 mb-3 leading-snug">{product.name}</h1>

              {/* Rating (placeholder until reviews API ships) */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={16} className="fill-gray-200 text-gray-200" />
                  ))}
                </div>
                <span className="text-sm font-semibold text-gray-700">0</span>
                <span className="text-sm text-gray-500">(0 reviews)</span>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl font-bold text-[#129cd3]">{formatPrice(finalPrice)}</span>
                {hasDiscount && (
                  <>
                    <span className="text-lg text-gray-400 line-through">{formatPrice(basePrice)}</span>
                    <span className="bg-green-100 text-green-700 text-sm font-bold px-2 py-0.5 rounded">{discount}% OFF</span>
                  </>
                )}
              </div>
              {hasDiscount && (
                <p className="text-sm text-green-600 font-medium mb-4">
                  You save {formatPrice(basePrice - finalPrice)}
                </p>
              )}

              {/* Stock */}
              <div className="flex items-center gap-2 mb-5">
                <span className={`w-2 h-2 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`}></span>
                <span className={`text-sm font-semibold ${inStock ? "text-green-600" : "text-red-600"}`}>
                  {inStock ? "In Stock" : "Out of Stock"}
                </span>
                {inStock && (
                  <span className="text-sm text-gray-400">· Usually dispatched in 24 hours</span>
                )}
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
                <button
                  onClick={async () => {
                    if (status === "unauthenticated") {
                      const path = `/products/${slug}`;
                      router.push(`/login?next=${encodeURIComponent(path)}`);
                      return;
                    }
                    if (!product) return;
                    setAddState("busy");
                    setAddError(null);
                    try {
                      await cartApi.addItem({ productId: product.id, qty });
                      setAddState("added");
                      window.setTimeout(() => setAddState("idle"), 1500);
                    } catch (err) {
                      setAddState("error");
                      setAddError(
                        isApiError(err)
                          ? err.displayMessage
                          : "Could not add to cart",
                      );
                      window.setTimeout(() => setAddState("idle"), 2500);
                    }
                  }}
                  disabled={!inStock || addState === "busy"}
                  className={`flex-1 flex items-center justify-center gap-2 font-semibold py-3 rounded-lg transition-colors ${
                    addState === "added"
                      ? "bg-green-500 text-white"
                      : addState === "error"
                      ? "bg-red-500 text-white"
                      : "bg-[#129cd3] hover:bg-[#0e87b5] text-white"
                  } ${(!inStock || addState === "busy") ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {addState === "added" ? (
                    <>
                      <Check size={18} /> Added to Cart
                    </>
                  ) : addState === "error" ? (
                    <>Could not add</>
                  ) : (
                    <>
                      <ShoppingCart size={18} /> Add to Cart
                    </>
                  )}
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors">
                  Buy Now
                </button>
                <button
                  onClick={async () => {
                    if (wishlistBusy || !product) return;
                    if (status === "unauthenticated") {
                      const path = `/products/${slug}`;
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
                      // Silent on wishlist toggle.
                    } finally {
                      setWishlistBusy(false);
                    }
                  }}
                  disabled={wishlistBusy}
                  className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-lg font-semibold transition-colors ${
                    wishlisted
                      ? "border-red-400 bg-red-50 text-red-500"
                      : "border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
                  } ${wishlistBusy ? "opacity-60 cursor-wait" : ""}`}
                >
                  <Heart size={18} className={wishlisted ? "fill-red-400" : ""} />
                  <span className="hidden sm:inline">{wishlisted ? "Wishlisted" : "Wishlist"}</span>
                </button>
              </div>
              {addError && (
                <p className="text-xs text-red-600 -mt-4 mb-4">{addError}</p>
              )}

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
                <div className="prose max-w-none text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                  {product.description || "No description available."}
                </div>
              )}

              {activeTab === "Specifications" && (
                <SpecsTable specs={product.specs} />
              )}

              {activeTab === "Reviews" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                    <div className="text-5xl font-bold text-[#129cd3]">0</div>
                    <div>
                      <div className="flex mb-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={18} className="fill-gray-200 text-gray-200" />
                        ))}
                      </div>
                      <p className="text-sm text-gray-500">0 verified reviews</p>
                    </div>
                  </div>
                  {mockReviews.map((review, i) => (
                    <div key={i} className="pb-4 border-b border-gray-100 last:border-0">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <span className="font-semibold text-sm text-gray-800">{review.name}</span>
                          <div className="flex mt-0.5">
                            {[...Array(5)].map((_, j) => (
                              <Star
                                key={j}
                                size={12}
                                className={j < review.rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}
                              />
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

function SpecsTable({ specs }: { specs: Record<string, unknown> }) {
  const entries = Object.entries(specs);
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No specifications listed.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([key, value], i) => (
            <tr key={key} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
              <td className="py-3 px-4 font-semibold text-gray-700 w-48">{key}</td>
              <td className="py-3 px-4 text-gray-600">
                {typeof value === "object" ? JSON.stringify(value) : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PdpSkeleton() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 h-6" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:p-8 flex flex-col lg:flex-row gap-8 mb-8">
            <div className="lg:w-2/5 flex-shrink-0">
              <div className="bg-gray-100 rounded-xl aspect-square animate-pulse" />
              <div className="flex gap-2 mt-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="w-16 h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="h-5 w-24 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-7 w-3/4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-9 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="flex gap-3 pt-2">
                <div className="h-12 flex-1 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-12 flex-1 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-12 w-32 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
