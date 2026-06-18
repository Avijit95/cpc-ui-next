"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cartApi, catalogApi, isApiError, reviewsApi } from "@/lib/api";
import type { ProductDetail, Variant, Review, ReviewListResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import {
  Star,
  Heart,
  ShoppingCart,
  Truck,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  Check,
  Loader2,
  Trash2,
  Edit2,
  ImagePlus,
  X,
} from "lucide-react";

const MAX_REVIEW_PHOTOS = 5;
const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type ReviewFormPhoto = {
  key: string;
  previewUrl: string;
  isBlob: boolean; // true when previewUrl is a URL.createObjectURL we own
};

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

function DealCountdown({ endsAt }: { endsAt: string }) {
  const target = new Date(endsAt).getTime();
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, target - Date.now()),
  );
  useEffect(() => {
    const t = setInterval(() => {
      setRemainingMs(Math.max(0, target - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [target]);
  if (remainingMs <= 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(remainingMs / 3600000);
  const m = Math.floor((remainingMs % 3600000) / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  return (
    <div className="inline-flex items-center gap-2 mb-4 text-xs text-gray-600">
      <span className="font-semibold text-[#129cd3] uppercase tracking-wide">
        Deal ends in
      </span>
      <span className="inline-flex items-center gap-0.5 tabular-nums">
        <span className="bg-[#129cd3] text-white font-bold px-1.5 py-0.5 rounded">
          {pad(h)}
        </span>
        <span className="text-[#129cd3] font-bold">:</span>
        <span className="bg-[#129cd3] text-white font-bold px-1.5 py-0.5 rounded">
          {pad(m)}
        </span>
        <span className="text-[#129cd3] font-bold">:</span>
        <span className="bg-[#129cd3] text-white font-bold px-1.5 py-0.5 rounded">
          {pad(s)}
        </span>
      </span>
    </div>
  );
}

const tabs = ["Description", "Specifications", "Reviews"] as const;
type TabType = (typeof tabs)[number];

type AddState = "idle" | "busy" | "added" | "error";

// ── Variant selection helpers ─────────────────────────────────────────────
// Attribute keys match the admin variant editor (ROM is stored as `storage`).
const VARIANT_ATTR_ORDER = ["ram", "storage", "color"];
const VARIANT_ATTR_LABELS: Record<string, string> = {
  ram: "RAM",
  storage: "ROM",
  color: "Color",
};

type VariantGroup = { key: string; label: string; values: string[] };

function attrValue(v: Variant, key: string): string {
  const raw = v.attributes[key];
  return raw == null ? "" : String(raw);
}

function attrsOf(v: Variant): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(v.attributes)) out[k] = attrValue(v, k);
  return out;
}

// Build the ordered list of selectable attribute groups from the variant set.
function buildVariantGroups(variants: Variant[]): VariantGroup[] {
  const keys: string[] = [];
  for (const v of variants) {
    for (const k of Object.keys(v.attributes)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  keys.sort((a, b) => {
    const ia = VARIANT_ATTR_ORDER.indexOf(a);
    const ib = VARIANT_ATTR_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return keys.map((key) => {
    const values: string[] = [];
    for (const v of variants) {
      const val = attrValue(v, key);
      if (val && !values.includes(val)) values.push(val);
    }
    return { key, label: VARIANT_ATTR_LABELS[key] ?? key, values };
  });
}

function findVariant(
  variants: Variant[],
  attrs: Record<string, string>,
  groups: VariantGroup[],
): Variant | undefined {
  return variants.find((v) =>
    groups.every((g) => attrValue(v, g.key) === attrs[g.key]),
  );
}

function pickDefaultVariant(variants: Variant[]): Variant | undefined {
  return variants.find((v) => v.stock > 0) ?? variants[0];
}

function formatReviewDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, status } = useAuth();
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
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [addState, setAddState] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const { setCart: syncHeaderCart } = useCart();
  const wishlisted = product ? isWishlisted(product.id) : false;

  // Reviews state.
  const [reviewsResp, setReviewsResp] = useState<ReviewListResponse | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [formRating, setFormRating] = useState(5);
  const [formText, setFormText] = useState("");
  const [formPhotos, setFormPhotos] = useState<ReviewFormPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke any blob: URLs we still own when the page unmounts.
  useEffect(() => {
    return () => {
      formPhotos.forEach((p) => {
        if (p.isBlob) URL.revokeObjectURL(p.previewUrl);
      });
    };
    // formPhotos intentionally omitted — we only want unmount cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myReview = reviewsResp?.items.find((r) => r.userId === user?.id) ?? null;

  useEffect(() => {
    if (!slug) return;
    const ac = new AbortController();
    catalogApi
      .getProduct(slug, ac.signal)
      .then((p) => {
        if (ac.signal.aborted) return;
        setProduct(p);
        setActiveImageIdx(0);
        const def = pickDefaultVariant(p.variants);
        setSelectedAttrs(def ? attrsOf(def) : {});
        setError(null);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (isApiError(err) && err.statusCode === 404) {
          setNotFound(true);
          setError(null);
        } else {
          setError(
            isApiError(err) ? err.displayMessage : "Failed to load product",
          );
          setNotFound(false);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [slug]);

  // Fetch reviews when slug resolves (public endpoint, doesn't depend on auth).
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    reviewsApi
      .listForProduct(slug, { limit: 50 })
      .then((resp) => {
        if (!cancelled) {
          setReviewsResp(resp);
          setReviewsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReviewsError(
            isApiError(err) ? err.displayMessage : "Could not load reviews",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const refreshReviews = useCallback(async () => {
    if (!slug) return;
    try {
      const resp = await reviewsApi.listForProduct(slug, { limit: 50 });
      setReviewsResp(resp);
    } catch {
      // Best-effort refresh — keep prior list on failure.
    }
  }, [slug]);

  const releaseBlobPreviews = (photos: ReviewFormPhoto[]) => {
    photos.forEach((p) => {
      if (p.isBlob) URL.revokeObjectURL(p.previewUrl);
    });
  };

  const openReviewForm = (existing: Review | null) => {
    releaseBlobPreviews(formPhotos);
    if (existing) {
      setEditingReviewId(existing.id);
      setFormRating(existing.rating);
      setFormText(existing.text ?? "");
      setFormPhotos(
        existing.photos.map((key, i) => ({
          key,
          previewUrl: existing.photoUrls[i] ?? "",
          isBlob: false,
        })),
      );
    } else {
      setEditingReviewId(null);
      setFormRating(5);
      setFormText("");
      setFormPhotos([]);
    }
    setFormError(null);
    setShowReviewForm(true);
  };

  const closeReviewForm = () => {
    if (formBusy) return;
    releaseBlobPreviews(formPhotos);
    setFormPhotos([]);
    setShowReviewForm(false);
    setFormText("");
    setEditingReviewId(null);
    setFormError(null);
  };

  const handlePhotoSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (!file) return;
      if (formPhotos.length >= MAX_REVIEW_PHOTOS) {
        setFormError(`You can attach up to ${MAX_REVIEW_PHOTOS} photos.`);
        return;
      }
      if (!REVIEW_PHOTO_TYPES.includes(file.type as (typeof REVIEW_PHOTO_TYPES)[number])) {
        setFormError("Photo must be JPG, PNG, or WebP.");
        return;
      }
      if (file.size > REVIEW_PHOTO_MAX_BYTES) {
        setFormError("Photo must be 5 MB or smaller.");
        return;
      }
      setPhotoBusy(true);
      setFormError(null);
      try {
        const { objectKey } = await reviewsApi.uploadPhoto(file);
        const previewUrl = URL.createObjectURL(file);
        setFormPhotos((prev) => [
          ...prev,
          { key: objectKey, previewUrl, isBlob: true },
        ]);
      } catch (err) {
        setFormError(
          isApiError(err) ? err.displayMessage : "Photo upload failed",
        );
      } finally {
        setPhotoBusy(false);
      }
    },
    [formPhotos.length],
  );

  const handlePhotoRemove = (key: string) => {
    setFormPhotos((prev) => {
      const removed = prev.find((p) => p.key === key);
      if (removed?.isBlob) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const handleReviewSubmit = useCallback(async () => {
    if (!product) return;
    if (formRating < 1 || formRating > 5) {
      setFormError("Please pick a rating from 1 to 5.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      const text = formText.trim() || undefined;
      const photos = formPhotos.map((p) => p.key);
      if (editingReviewId) {
        await reviewsApi.update(editingReviewId, {
          rating: formRating,
          text,
          photos,
        });
      } else {
        await reviewsApi.create({
          productId: product.id,
          rating: formRating,
          text,
          photos,
        });
      }
      await refreshReviews();
      releaseBlobPreviews(formPhotos);
      setFormPhotos([]);
      setShowReviewForm(false);
      setEditingReviewId(null);
      setFormText("");
    } catch (err) {
      setFormError(
        isApiError(err) ? err.displayMessage : "Could not submit review",
      );
    } finally {
      setFormBusy(false);
    }
  }, [product, formRating, formText, formPhotos, editingReviewId, refreshReviews]);

  const handleReviewDelete = useCallback(
    async (id: string) => {
      setDeleteBusyId(id);
      try {
        await reviewsApi.remove(id);
        await refreshReviews();
      } catch {
        // No toast surface — silently ignore for now.
      } finally {
        setDeleteBusyId(null);
      }
    },
    [refreshReviews],
  );

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

  const variantGroups = buildVariantGroups(product.variants);
  const hasVariants = variantGroups.length > 0;
  const selectedVariant = hasVariants
    ? findVariant(product.variants, selectedAttrs, variantGroups)
    : undefined;

  // Picking a value keeps the other selections when a matching variant exists,
  // otherwise snaps to a valid variant (prefers in-stock) so a variant always
  // resolves. Changing color resets the gallery to that color's first image.
  const selectVariantValue = (key: string, value: string) => {
    const next = { ...selectedAttrs, [key]: value };
    let target = findVariant(product.variants, next, variantGroups);
    if (!target) {
      const candidates = product.variants.filter(
        (v) => attrValue(v, key) === value,
      );
      target = candidates.find((v) => v.stock > 0) ?? candidates[0];
    }
    if (target) {
      setSelectedAttrs(attrsOf(target));
      setActiveImageIdx(0);
    }
  };

  const activeDeal = selectedVariant ? selectedVariant.deal : product.deal;
  const activePricing = selectedVariant ? selectedVariant.pricing : product.pricing;
  const displayBase = activeDeal ? activeDeal.basePrice : activePricing.basePrice;
  const displayFinal = activeDeal ? activeDeal.dealPrice : activePricing.finalPrice;
  const hasDiscount = displayBase > displayFinal;
  const discount = hasDiscount
    ? Math.round(((displayBase - displayFinal) / displayBase) * 100)
    : 0;
  const immediateCategory = product.breadcrumbs[product.breadcrumbs.length - 1];
  const productImages = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const galleryImages =
    selectedVariant && selectedVariant.images.length > 0
      ? selectedVariant.images.map((im, i) => ({
          objectKey: im.objectKey,
          url: im.url,
          sortOrder: i,
        }))
      : productImages;
  const activeImage = galleryImages[activeImageIdx] ?? galleryImages[0];
  const inStock = (selectedVariant ? selectedVariant.stock : product.stock) > 0;

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
              <div className="relative bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center aspect-square border border-gray-100">
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
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  className="absolute top-3 right-3 w-9 h-9 bg-white shadow rounded-full flex items-center justify-center transition-colors hover:bg-[#e8f7fc] disabled:opacity-50"
                >
                  <Heart
                    size={18}
                    className={
                      wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"
                    }
                  />
                </button>
              </div>
              {galleryImages.length > 1 && (
                <div className="flex gap-2 mt-3">
                  {galleryImages.slice(0, 4).map((img, i) => (
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

              {/* Rating (live from reviewsResp.aggregate) */}
              <button
                type="button"
                onClick={() => setActiveTab("Reviews")}
                className="flex items-center gap-2 mb-4 group"
              >
                <div className="flex">
                  {[...Array(5)].map((_, i) => {
                    const filled =
                      i < Math.round(reviewsResp?.aggregate.average ?? 0);
                    return (
                      <Star
                        key={i}
                        size={16}
                        className={
                          filled
                            ? "fill-yellow-400 text-yellow-400"
                            : "fill-gray-200 text-gray-200"
                        }
                      />
                    );
                  })}
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {reviewsResp?.aggregate.count
                    ? reviewsResp.aggregate.average.toFixed(1)
                    : "0"}
                </span>
                <span className="text-sm text-gray-500 group-hover:text-[#129cd3] group-hover:underline">
                  ({reviewsResp?.aggregate.count ?? 0} review
                  {reviewsResp?.aggregate.count === 1 ? "" : "s"})
                </span>
              </button>

              {/* Pricing */}
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl font-bold text-[#129cd3]">{formatPrice(displayFinal)}</span>
                {hasDiscount && (
                  <>
                    <span className="text-lg text-gray-400 line-through">{formatPrice(displayBase)}</span>
                    <span className="bg-green-100 text-green-700 text-sm font-bold px-2 py-0.5 rounded">{discount}% OFF</span>
                  </>
                )}
              </div>
              {hasDiscount && (
                <p className="text-sm text-green-600 font-medium mb-2">
                  You save {formatPrice(displayBase - displayFinal)}
                </p>
              )}
              {activeDeal && <DealCountdown endsAt={activeDeal.endsAt} />}

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

              {/* Variant selectors (RAM / ROM / Color) — above Quantity */}
              {hasVariants && (
                <div className="space-y-4 mb-5">
                  {variantGroups.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {group.label}:
                        </span>
                        <span className="text-sm text-gray-500">
                          {selectedAttrs[group.key] ?? "Select"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.values.map((value) => {
                          const active = selectedAttrs[group.key] === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => selectVariantValue(group.key, value)}
                              className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                                active
                                  ? "bg-[#129cd3] text-white border-[#129cd3]"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-[#129cd3] hover:text-[#129cd3]"
                              }`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                      syncHeaderCart(
                        await cartApi.addItem({
                          productId: product.id,
                          variantId: selectedVariant?.id,
                          qty,
                        }),
                      );
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
                <button
                  onClick={async () => {
                    if (status === "unauthenticated") {
                      const path = `/products/${slug}`;
                      router.push(`/login?next=${encodeURIComponent(path)}`);
                      return;
                    }
                    if (!product) return;
                    setBuying(true);
                    setAddError(null);
                    try {
                      const cart = await cartApi.addItem({
                        productId: product.id,
                        variantId: selectedVariant?.id,
                        qty,
                      });
                      syncHeaderCart(cart);
                      // Check out only this product's line, not the whole cart.
                      const line = cart.items.find(
                        (it) =>
                          it.productId === product.id &&
                          it.variantId === (selectedVariant?.id ?? null),
                      );
                      router.push(
                        line
                          ? `/checkout?items=${encodeURIComponent(line.cartItemId)}`
                          : "/checkout",
                      );
                    } catch (err) {
                      setBuying(false);
                      setAddError(
                        isApiError(err)
                          ? err.displayMessage
                          : "Could not start checkout",
                      );
                    }
                  }}
                  disabled={!inStock || buying}
                  className={`flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors ${(!inStock || buying) ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {buying ? "Starting…" : "Buy Now"}
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
                  {/* Aggregate */}
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                    <div className="text-5xl font-bold text-[#129cd3]">
                      {reviewsResp?.aggregate.count
                        ? reviewsResp.aggregate.average.toFixed(1)
                        : "—"}
                    </div>
                    <div>
                      <div className="flex mb-1">
                        {[...Array(5)].map((_, i) => {
                          const filled =
                            i < Math.round(reviewsResp?.aggregate.average ?? 0);
                          return (
                            <Star
                              key={i}
                              size={18}
                              className={
                                filled
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "fill-gray-200 text-gray-200"
                              }
                            />
                          );
                        })}
                      </div>
                      <p className="text-sm text-gray-500">
                        {reviewsResp?.aggregate.count ?? 0} review
                        {reviewsResp?.aggregate.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  {/* CTA / Your review */}
                  {status === "authenticated" ? (
                    myReview ? (
                      <div className="bg-[#e8f7fc] border border-[#129cd3]/30 rounded-lg p-4 flex items-start justify-between gap-3">
                        <div className="text-xs">
                          <p className="font-semibold text-gray-800 mb-0.5">
                            Your review
                          </p>
                          <p className="text-gray-600">
                            Submitted {formatReviewDate(myReview.createdAt)}
                            {myReview.updatedAt !== myReview.createdAt
                              ? " · edited"
                              : ""}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => openReviewForm(myReview)}
                            className="flex items-center gap-1 text-xs text-[#129cd3] border border-[#129cd3] px-2.5 py-1.5 rounded-lg hover:bg-white transition-colors"
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            onClick={() => handleReviewDelete(myReview.id)}
                            disabled={deleteBusyId === myReview.id}
                            className="flex items-center gap-1 text-xs text-red-500 border border-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deleteBusyId === myReview.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}{" "}
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openReviewForm(null)}
                        className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                      >
                        <Star size={14} /> Write a Review
                      </button>
                    )
                  ) : (
                    <div className="text-xs text-gray-500">
                      <Link href="/login" className="text-[#129cd3] hover:underline">
                        Sign in
                      </Link>{" "}
                      to leave a review.
                    </div>
                  )}

                  {/* Inline review form */}
                  {showReviewForm && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="mb-3">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Rating
                        </label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setFormRating(n)}
                              className="p-1"
                            >
                              <Star
                                size={22}
                                className={
                                  n <= formRating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-gray-200 text-gray-300"
                                }
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Comments{" "}
                          <span className="font-normal text-gray-400">
                            (optional)
                          </span>
                        </label>
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={formText}
                          onChange={(e) => setFormText(e.target.value)}
                          placeholder="Share your experience with this product…"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none bg-white"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Photos{" "}
                          <span className="font-normal text-gray-400">
                            (up to {MAX_REVIEW_PHOTOS}, optional)
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {formPhotos.map((p) => (
                            <div key={p.key} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.previewUrl}
                                alt=""
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                              />
                              <button
                                type="button"
                                onClick={() => handlePhotoRemove(p.key)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-300 rounded-full flex items-center justify-center text-gray-600 hover:text-red-500 hover:border-red-300 shadow-sm"
                                aria-label="Remove photo"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                          {formPhotos.length < MAX_REVIEW_PHOTOS && (
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              disabled={photoBusy}
                              className="w-16 h-16 border border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 hover:border-[#129cd3] hover:text-[#129cd3] transition-colors disabled:opacity-50"
                            >
                              {photoBusy ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  <ImagePlus size={16} />
                                  <span className="text-[10px] mt-0.5">Add</span>
                                </>
                              )}
                            </button>
                          )}
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handlePhotoSelect}
                          />
                        </div>
                      </div>
                      {formError && (
                        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {formError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleReviewSubmit}
                          disabled={formBusy}
                          className="flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          {formBusy && (
                            <Loader2 size={14} className="animate-spin" />
                          )}
                          {editingReviewId ? "Save Changes" : "Submit Review"}
                        </button>
                        <button
                          onClick={closeReviewForm}
                          disabled={formBusy}
                          className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List */}
                  {reviewsLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-20 bg-gray-100 rounded-lg animate-pulse"
                        />
                      ))}
                    </div>
                  ) : reviewsError ? (
                    <p className="text-sm text-red-600">{reviewsError}</p>
                  ) : !reviewsResp || reviewsResp.items.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No reviews yet. Be the first to share your thoughts!
                    </p>
                  ) : (
                    reviewsResp.items.map((review) => (
                      <div
                        key={review.id}
                        className="pb-4 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <span className="font-semibold text-sm text-gray-800">
                              {review.user.name}
                            </span>
                            <div className="flex mt-0.5">
                              {[...Array(5)].map((_, j) => (
                                <Star
                                  key={j}
                                  size={12}
                                  className={
                                    j < review.rating
                                      ? "fill-yellow-400 text-yellow-400"
                                      : "fill-gray-200 text-gray-200"
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <span className="text-xs text-gray-400">
                            {formatReviewDate(review.createdAt)}
                          </span>
                        </div>
                        {review.text && (
                          <p className="text-sm text-gray-600 mt-1">
                            {review.text}
                          </p>
                        )}
                        {review.photoUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {review.photoUrls.map((url, idx) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={idx}
                                src={url}
                                alt=""
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
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

// Legacy keys: RAM/ROM/Color now live on variants, not specs. Hide them so old
// products never render raw arrays like ["8GB","12GB"] in the spec table.
const HIDDEN_SPEC_KEYS = new Set(["ramOptions", "storageOptions", "colorOptions"]);

function humanizeSpecKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatSpecValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SpecsTable({ specs }: { specs: Record<string, unknown> }) {
  const entries = Object.entries(specs).filter(
    ([key]) => !HIDDEN_SPEC_KEYS.has(key),
  );
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No specifications listed.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([key, value], i) => (
            <tr key={key} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
              <td className="py-3 px-4 font-semibold text-gray-700 w-48">
                {humanizeSpecKey(key)}
              </td>
              <td className="py-3 px-4 text-gray-600">{formatSpecValue(value)}</td>
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
