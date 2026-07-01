"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { adminApi, cartApi, catalogApi, isApiError, reviewsApi } from "@/lib/api";
import type { ProductDetail, Variant, Review, ReviewListResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { useStock } from "@/lib/stock/StockProvider";
import {
  Star,
  Heart,
  ShoppingCart,
  Truck,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Trash2,
  Edit2,
  ImagePlus,
  X,
  ArrowLeft,
  Tag,
  Cpu,
  Camera,
  Smartphone,
  BatteryMedium,
  HardDrive,
  ChevronDown,
  ChevronUp,
  Monitor,
  Wifi,
  Ruler,
  Zap,
  Hash,
  Info,
  Volume2,
  Activity,
  LayoutGrid,
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
  // Past 24h, lead with days (D : H : M) instead of a huge hour count.
  const units =
    remainingMs >= 86400000
      ? [
          { v: Math.floor(remainingMs / 86400000), label: "d" },
          { v: Math.floor((remainingMs % 86400000) / 3600000), label: "h" },
          { v: Math.floor((remainingMs % 3600000) / 60000), label: "m" },
        ]
      : [
          { v: Math.floor(remainingMs / 3600000), label: "h" },
          { v: Math.floor((remainingMs % 3600000) / 60000), label: "m" },
          { v: Math.floor((remainingMs % 60000) / 1000), label: "s" },
        ];
  return (
    <div className="inline-flex items-start gap-2 mb-4 text-xs text-gray-600">
      <span className="font-semibold text-[#129cd3] uppercase tracking-wide leading-6">
        Deal ends in
      </span>
      <span className="inline-flex items-start gap-0.5 tabular-nums">
        {units.map((u, i) => (
          <span key={i} className="inline-flex items-start gap-0.5">
            <span className="inline-flex flex-col items-center">
              <span className="bg-[#129cd3] text-white font-bold px-1.5 py-0.5 rounded">
                {pad(u.v)}
              </span>
              <span className="text-[9px] font-semibold text-[#129cd3] uppercase mt-0.5">
                {u.label}
              </span>
            </span>
            {i < 2 && (
              <span className="text-[#129cd3] font-bold leading-6">:</span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

const tabs = ["Description", "Specifications", "Reviews"] as const;
type TabType = (typeof tabs)[number];

type AddState = "idle" | "busy" | "added" | "error";

// ── Variant selection helpers ─────────────────────────────────────────────
// Attribute keys match the admin variant editor (ROM is stored as `storage`).
const VARIANT_ATTR_ORDER = ["size", "launchYear", "model", "ram", "storage", "color"];
const VARIANT_ATTR_LABELS: Record<string, string> = {
  ram: "RAM",
  storage: "ROM",
  color: "Color",
  size: "Display Size",
  model: "Model No.",
  launchYear: "Launch Year",
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
  const searchParams = useSearchParams();
  // Deep-link from a Today Deals card preselects the deal's variant.
  const variantParam = searchParams?.get("variant") ?? null;
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
  const [productCoupons, setProductCoupons] = useState<{ customer?: { id: string; name: string; value: number }; retail?: { id: string; name: string; value: number } } | null>(null);
  const [customerCouponSelected, setCustomerCouponSelected] = useState(false);
  const [retailCouponSelected, setRetailCouponSelected] = useState(false);
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [viewOfferKey, setViewOfferKey] = useState<"customer" | "retail" | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("Description");
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [thumbOffset, setThumbOffset] = useState(0);
  const THUMB_PER_PAGE = 5;
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [addState, setAddState] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const { setCart: syncHeaderCart, items: cartItems } = useCart();
  const { stocks, setStock, adjustStock } = useStock();
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
        // Seed global stock store. If the store already has a lower value from a
        // cart-add adjustment, keep it — the API doesn't deduct cart reservations.
        // Only update if not yet tracked, or if the API reports even less stock.
        const curP = stocks[`p:${p.slug}`];
        if (curP === undefined || p.stock < curP) setStock(`p:${p.slug}`, p.stock);
        p.variants.forEach((v) => {
          const curV = stocks[`v:${v.id}`];
          if (curV === undefined || v.stock < curV) setStock(`v:${v.id}`, v.stock);
        });
        setActiveImageIdx(0);
        const preselect =
          (variantParam &&
            p.variants.find((v) => v.id === variantParam)) ||
          pickDefaultVariant(p.variants);
        setSelectedAttrs(preselect ? attrsOf(preselect) : {});
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
  // stocks/setStock intentionally omitted — they are used only to seed initial
  // values and must not re-trigger the fetch (which resets selectedAttrs).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, variantParam]);

  // Seed coupons from the product detail response (availableCoupons field).
  // If the product already has coupons embedded, use them immediately.
  // Otherwise try a silent add→peek→remove for authenticated users.
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    let tempCartItemId: string | null = null;

    type CouponMap = { customer?: { id: string; name: string; value: number }; retail?: { id: string; name: string; value: number } };

    const apply = (ac: CouponMap) => {
      if (!cancelled && (ac.customer || ac.retail)) setProductCoupons(ac);
    };

    // 1. Use coupons already embedded in the product detail response.
    const embedded = product.availableCoupons;
    if (embedded?.customer || embedded?.retail) {
      apply(embedded as CouponMap);
      return;
    }

    // 2. Check if product is already in the cart — use its availableCoupons.
    const existingLine = cartItems.find((l) => l.slug === product.slug);
    if (existingLine?.availableCoupons?.customer || existingLine?.availableCoupons?.retail) {
      apply(existingLine.availableCoupons as CouponMap);
      return;
    }

    // 3. Silent add→peek→remove (authenticated only).
    if (status !== "authenticated") return;
    const variantId = product.variants.length > 0
      ? (product.variants.find((v) => v.stock > 0) ?? product.variants[0])?.id ?? null
      : null;

    cartApi
      .addItem({ productId: product.id, variantId: variantId ?? undefined, qty: 1 })
      .then((cartView) => {
        const line = cartView.items.find(
          (l) => l.slug === product.slug && l.variantId === variantId,
        );
        if (!line) return null;
        tempCartItemId = line.cartItemId;
        if (!cancelled) apply(line.availableCoupons as CouponMap);
        return cartApi.removeItem(line.cartItemId);
      })
      .then((updated) => {
        tempCartItemId = null;
        if (updated && !cancelled) syncHeaderCart(updated);
      })
      .catch(() => { /* OOS or other error — ignore */ });

    return () => {
      cancelled = true;
      if (tempCartItemId) {
        cartApi.removeItem(tempCartItemId).then((v) => syncHeaderCart(v)).catch(() => {});
        tempCartItemId = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

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

useEffect(() => {
  if (!product) return;
  const variantGroups = buildVariantGroups(product.variants);
  const sv = product.variants.length > 0
    ? findVariant(product.variants, selectedAttrs, variantGroups)
    : undefined;
  const key = sv ? `v:${sv.id}` : `p:${product.slug}`;
  const live = stocks[key] !== undefined ? stocks[key] : (sv ? sv.stock : product.stock);
  const capQty = () => setQty(live);
  if (live > 0 && qty > live) capQty();  // ✅
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [stocks]);

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
  const isTvProduct = product.breadcrumbs.some(
    (b) => b.slug?.toLowerCase().includes("tv") || b.name?.toLowerCase().includes("tv") || b.name?.toLowerCase().includes("television")
  );
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
  const stockKey = selectedVariant ? `v:${selectedVariant.id}` : `p:${product.slug}`;
  const liveStock = stocks[stockKey] !== undefined
    ? stocks[stockKey]
    : (selectedVariant ? selectedVariant.stock : product.stock);
  const inStock = liveStock > 0;

  // Flipkart-style variant selector derived values.
  // Collect ALL color-like keys across all variants (handles "color", "Color", "colour" etc.
  // even when different variants use different casings).
  const allAttrKeys = [...new Set(product.variants.flatMap((v) => Object.keys(v.attributes)))];
  const colorAttrKeys = allAttrKeys.filter((k) => /^colou?r$/i.test(k));
  // All unique color values from every color-like key
  const colorValues = [
    ...new Set(
      product.variants.flatMap((v) =>
        colorAttrKeys.map((k) => String(v.attributes[k] ?? "")).filter(Boolean)
      )
    ),
  ];
  // The currently selected color, looked up across all color keys
  const selectedColor = colorAttrKeys.map((k) => selectedAttrs[k]).find(Boolean) ?? null;
  const nonColorGroups = variantGroups.filter((g) => {
    if (/^colou?r$/i.test(g.key)) return false;
    // For TV: hide model (shown in highlights), keep size and launchYear
    if (isTvProduct && g.key === "model") return false;
    return true;
  });
  // Filter to variants whose color (under any color key) matches the selection
  const colorFilteredVariants =
    colorAttrKeys.length > 0 && selectedColor
      ? product.variants.filter((v) =>
          colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === selectedColor)
        )
      : product.variants;
  const selectedVariantLabel = nonColorGroups
    .map((g) => selectedAttrs[g.key])
    .filter(Boolean)
    .join(" + ");

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
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3] transition-colors shadow-sm mb-4"
            aria-label="Go back"
          >
            <ArrowLeft size={17} />
          </button>

          {/* Product Section — sticky-left / scrollable-right */}
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
            {/* Left: Image — sticky */}
            <div className="lg:w-2/5 flex-shrink-0 lg:sticky lg:top-20 lg:self-start">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
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
                <div className="flex items-center gap-2 mt-3">
                  {/* Prev */}
                  <button
                    onClick={() => setThumbOffset((o) => Math.max(0, o - 1))}
                    disabled={thumbOffset === 0}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    aria-label="Previous images"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {/* Visible thumbnails */}
                  <div className="flex gap-2 flex-1">
                    {galleryImages.slice(thumbOffset, thumbOffset + THUMB_PER_PAGE).map((img, rel) => {
                      const i = thumbOffset + rel;
                      return (
                        <button
                          key={img.objectKey}
                          onClick={() => setActiveImageIdx(i)}
                          className={`flex-1 h-16 bg-gray-50 rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                            i === activeImageIdx
                              ? "border-[#129cd3] shadow-sm shadow-[#129cd3]/20"
                              : "border-gray-200 hover:border-[#8dd4ee]"
                          }`}
                        >
                          {img.url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.url} alt={product.name} className="w-full h-full object-cover" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next */}
                  <button
                    onClick={() => setThumbOffset((o) => Math.min(galleryImages.length - THUMB_PER_PAGE, o + 1))}
                    disabled={thumbOffset + THUMB_PER_PAGE >= galleryImages.length}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-[#129cd3] hover:text-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    aria-label="Next images"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              </div>{/* end left image card */}
            </div>{/* end left sticky column */}

            {/* Right: Details — scrollable, contains product info + tabs */}
            <div className="flex-1 min-w-0 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 lg:p-8">
              {/* Category badge */}
              {immediateCategory && (
                <span className="inline-block bg-[#e8f7fc] text-[#129cd3] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                  {immediateCategory.name}
                </span>
              )}

              <h1
                title={product.name}
                className="text-2xl font-bold text-gray-900 mb-3 leading-snug line-clamp-2"
              >
                {product.name}
              </h1>

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

              {/* Product Highlights */}
              <ProductHighlights specs={product.specs} isTv={isTvProduct} selectedVariant={selectedVariant} />

              {/* Stock */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inStock ? "bg-green-500" : "bg-red-500"}`}></span>
                <span className={`text-sm font-semibold ${inStock ? "text-green-600" : "text-red-600"}`}>
                  {inStock ? "In Stock" : "Out of Stock"}
                </span>
                {inStock && liveStock < 10 && liveStock >= 5 && (
                  <span className="text-sm font-semibold text-orange-500">· Few left</span>
                )}
                {inStock && liveStock < 5 && (
                  <span className="text-sm font-semibold text-red-500">· Only {liveStock} left!</span>
                )}
                {inStock && liveStock >= 10 && (
                  <span className="text-sm text-gray-400">· Usually dispatched in 24 hours</span>
                )}
              </div>

{/* Flipkart-style variant selectors */}
              {hasVariants && (
                <div className="mb-5">
                  {/* Color — image thumbnails with name label */}
                  {colorValues.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-4">
                        {colorValues.map((color) => {
                          // Find a variant with this color under any color key
                          const colorVariant = product.variants.find((v) =>
                            colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color)
                          );
                          const imgUrl =
                            colorVariant?.images?.[0]?.url ??
                            productImages[0]?.url ??
                            null;
                          const active = selectedColor === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => {
                                // Find the variant for this color and snap to it
                                const target =
                                  product.variants.find((v) =>
                                    colorAttrKeys.some(
                                      (k) => String(v.attributes[k] ?? "") === color
                                    ) && v.stock > 0
                                  ) ??
                                  product.variants.find((v) =>
                                    colorAttrKeys.some(
                                      (k) => String(v.attributes[k] ?? "") === color
                                    )
                                  );
                                if (target) {
                                  setSelectedAttrs(attrsOf(target));
                                  setActiveImageIdx(0);
                                }
                              }}
                              className="flex flex-col items-center gap-1 group focus:outline-none"
                            >
                              <span
                                className={`rounded-lg border-2 transition-colors overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50 ${
                                  active
                                    ? "border-[#129cd3] shadow-sm"
                                    : "border-gray-300 group-hover:border-gray-500"
                                }`}
                                style={{ width: 64, height: 64 }}
                              >
                                {imgUrl ? (
                                  <img src={imgUrl} alt={color} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs text-gray-400 p-1 text-center leading-tight">
                                    {color}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`text-xs text-center leading-tight max-w-[72px] truncate transition-colors ${
                                  active
                                    ? "font-semibold text-[#129cd3]"
                                    : "font-medium text-gray-600 group-hover:text-gray-800"
                                }`}
                              >
                                {color}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Non-color variant selectors */}
                  {nonColorGroups.length > 0 && (
                    <div className="mb-4 space-y-4">
                      {isTvProduct ? (
                        /* TV: per-attribute pill rows (size, model, etc.) */
                        nonColorGroups.map((g) => {
                          const selectedVal = selectedAttrs[g.key] ?? "";
                          return (
                            <div key={g.key}>
                              <p className="text-sm font-bold text-gray-800 mb-2">
                                {g.label}:{" "}
                                <span className="font-semibold">{selectedVal}</span>
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {[...g.values].sort((a, b) => {
                                  const na = parseFloat(a), nb = parseFloat(b);
                                  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
                                }).map((val) => {
                                  const isActive = selectedVal === val;
                                  // Find the variant that would be selected
                                  const pillVariant =
                                    findVariant(product.variants, { ...selectedAttrs, [g.key]: val }, variantGroups) ??
                                    colorFilteredVariants.find((v) => attrValue(v, g.key) === val);
                                  const pillStockKey = pillVariant ? `v:${pillVariant.id}` : null;
                                  const pillStock = pillStockKey
                                    ? (stocks[pillStockKey] ?? pillVariant?.stock ?? 0)
                                    : 0;
                                  const outOfStock = pillStock === 0;
                                  return (
                                    <div key={val} className="flex flex-col items-center gap-0.5">
                                      <button
                                        type="button"
                                        disabled={outOfStock}
                                        onClick={() => selectVariantValue(g.key, val)}
                                        className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                                          isActive
                                            ? "border-[#129cd3] bg-blue-50 text-[#129cd3]"
                                            : outOfStock
                                            ? "border-gray-100 text-gray-300 cursor-not-allowed line-through"
                                            : "border-gray-200 bg-white text-gray-800 hover:border-gray-400"
                                        }`}
                                      >
                                        {val}
                                      </button>
                                      {!outOfStock && pillStock <= 9 && (
                                        <span className={`text-[10px] font-semibold ${pillStock <= 4 ? "text-red-500" : "text-orange-500"}`}>
                                          {pillStock <= 4 ? `${pillStock} left` : "Few left"}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        /* Non-TV: combined variant cards with pricing */
                        <>
                          {selectedVariantLabel && (
                            <p className="text-sm font-bold text-gray-800 mb-3">
                              Variant: <span className="font-semibold">{selectedVariantLabel}</span>
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3">
                            {colorFilteredVariants.map((v) => {
                              const label = nonColorGroups
                                .map((g) => attrValue(v, g.key))
                                .filter(Boolean)
                                .join(" + ");
                              if (!label) return null;
                              const isActive = nonColorGroups.every(
                                (g) => selectedAttrs[g.key] === attrValue(v, g.key)
                              );
                              const vBase = v.deal ? v.deal.basePrice : v.pricing.basePrice;
                              const vFinal = v.deal ? v.deal.dealPrice : v.pricing.finalPrice;
                              const vDiscount =
                                vBase > vFinal
                                  ? Math.round(((vBase - vFinal) / vBase) * 100)
                                  : 0;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => { setSelectedAttrs(attrsOf(v)); setActiveImageIdx(0); }}
                                  className={`flex flex-col items-start text-left px-3 py-2 rounded-lg border-2 transition-colors min-w-[110px] ${
                                    isActive
                                      ? "border-[#129cd3] bg-blue-50"
                                      : "border-gray-200 bg-white hover:border-gray-400"
                                  }`}
                                >
                                  <span className="text-sm font-semibold text-gray-800 mb-0.5">{label}</span>
                                  {vDiscount > 0 && (
                                    <span className="text-xs text-green-600 font-medium">
                                      ↓{vDiscount}%{" "}
                                      <span className="line-through text-gray-400">{formatPrice(vBase)}</span>
                                    </span>
                                  )}
                                  <span className="text-sm font-bold text-gray-900">{formatPrice(vFinal)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Color-only product: show selected color label */}
                  {colorValues.length > 0 && nonColorGroups.length === 0 && selectedColor && (
                    <p className="text-sm font-bold text-gray-800 mb-3">
                      Color: <span className="font-semibold">{selectedColor}</span>
                    </p>
                  )}

                  {/* Quantity */}
                  {inStock && (
                    <div className="flex items-center gap-4">
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
                          onClick={() => setQty((q) => Math.min(q + 1, liveStock))}
                          disabled={qty >= liveStock}
                          className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {!inStock ? (
                <div className="mb-6">
                  <p className="w-full text-center font-semibold text-red-600 bg-red-50 border border-red-300 py-3 rounded-lg">
                    Currently unavailable
                  </p>
                </div>
              ) : (
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
                        let cartView = await cartApi.addItem({
                          productId: product.id,
                          variantId: selectedVariant?.id,
                          qty,
                        });
                        // Apply selected coupons to the newly added line.
                        const newLine = cartView.items.find(
                          (it) => it.productId === product.id && it.variantId === (selectedVariant?.id ?? null),
                        );
                        if (newLine && (customerCouponSelected || retailCouponSelected)) {
                          cartView = await cartApi.updateItem(newLine.cartItemId, {
                            ...(customerCouponSelected ? { customerCouponApplied: true } : {}),
                            ...(retailCouponSelected ? { retailCouponApplied: true } : {}),
                          });
                        }
                        syncHeaderCart(cartView);
                        adjustStock(stockKey, -qty);
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
                    disabled={addState === "busy"}
                    className={`flex-1 flex items-center justify-center gap-2 font-semibold py-3 rounded-lg transition-colors ${
                      addState === "added"
                        ? "bg-green-500 text-white"
                        : addState === "error"
                        ? "bg-red-500 text-white"
                        : "bg-[#129cd3] hover:bg-[#0e87b5] text-white"
                    } ${addState === "busy" ? "opacity-60 cursor-not-allowed" : ""}`}
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
                        let cart = await cartApi.addItem({
                          productId: product.id,
                          variantId: selectedVariant?.id,
                          qty,
                        });
                        // Apply selected coupons to the newly added line.
                        const addedLine = cart.items.find(
                          (it) => it.productId === product.id && it.variantId === (selectedVariant?.id ?? null),
                        );
                        if (addedLine && (customerCouponSelected || retailCouponSelected)) {
                          cart = await cartApi.updateItem(addedLine.cartItemId, {
                            ...(customerCouponSelected ? { customerCouponApplied: true } : {}),
                            ...(retailCouponSelected ? { retailCouponApplied: true } : {}),
                          });
                        }
                        syncHeaderCart(cart);
                        adjustStock(stockKey, -qty);
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
                    disabled={buying}
                    className={`flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors ${buying ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {buying ? "Starting…" : "Buy Now"}
                  </button>
                </div>
              )}
              {addError && (
                <p className="text-xs text-red-600 -mt-4 mb-4">{addError}</p>
              )}

              {/* Coupon Section — always visible */}
              {(() => {
                const cartLineCoupons = cartItems.find((l) => l.slug === product.slug)?.availableCoupons ?? null;
                const coupons = productCoupons ?? cartLineCoupons ?? product.availableCoupons ?? null;
                const hasCoupons = !!(coupons?.customer || coupons?.retail);

                const couponList: { key: "customer" | "retail"; name: string; label: string; isSelected: boolean; setSelected: () => void }[] = [];
                if (coupons?.customer) couponList.push({
                  key: "customer",
                  name: coupons.customer.name,
                  label: `₹${coupons.customer.value.toLocaleString("en-IN")} OFF`,
                  isSelected: customerCouponSelected,
                  setSelected: () => setCustomerCouponSelected((v) => !v),
                });
                if (coupons?.retail) couponList.push({
                  key: "retail",
                  name: coupons.retail.name,
                  label: `${coupons.retail.value}% OFF`,
                  isSelected: retailCouponSelected,
                  setSelected: () => setRetailCouponSelected((v) => !v),
                });

                const selectedCount = [customerCouponSelected, retailCouponSelected].filter(Boolean).length;

                return (
                  <div className="mb-6 rounded-xl border border-dashed border-green-400 overflow-hidden bg-green-50/40">
                    {/* Header row: Available Coupons | dropdown toggle */}
                    <button
                      type="button"
                      onClick={() => { if (hasCoupons) { setCouponPanelOpen((v) => !v); setViewOfferKey(null); } }}
                      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${hasCoupons ? "hover:bg-green-50 cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Tag size={15} className="text-green-600 flex-shrink-0" />
                        <span className="text-sm font-bold text-gray-800">Available Coupons</span>
                        {hasCoupons ? (
                          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200">
                            {couponList.length}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">No offers available</span>
                        )}
                        {selectedCount > 0 && (
                          <span className="text-xs bg-green-500 text-white font-semibold px-2 py-0.5 rounded-full">
                            {selectedCount} applied
                          </span>
                        )}
                      </div>
                      {hasCoupons && (
                        <ChevronDown
                          size={16}
                          className={`text-gray-500 transition-transform duration-200 ${couponPanelOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {/* Dropdown panel */}
                    {couponPanelOpen && (
                      <div className="border-t border-green-200 divide-y divide-green-100 bg-white">
                        {couponList.map((c) => (
                          <div key={c.key}>
                            {/* Coupon row */}
                            <div className="flex items-center justify-between px-4 py-3 gap-3">
                              {/* Left: name + discount badge */}
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="inline-flex items-center gap-1.5 bg-white border border-dashed border-green-400 rounded-lg px-3 py-1.5">
                                  <span className="text-[11px] font-black tracking-widest text-green-700 uppercase">{c.name}</span>
                                </span>
                                {c.isSelected && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600">
                                    <Check size={11} strokeWidth={3} /> Applied
                                  </span>
                                )}
                              </div>
                              {/* Right: View Offer */}
                              <button
                                type="button"
                                onClick={() => setViewOfferKey((k) => k === c.key ? null : c.key)}
                                className="flex-shrink-0 text-xs font-semibold text-[#129cd3] hover:text-[#0e87b5] underline underline-offset-2 whitespace-nowrap flex items-center gap-1 transition-colors"
                              >
                                View Offer
                                <ChevronDown size={12} className={`transition-transform duration-150 ${viewOfferKey === c.key ? "rotate-180" : ""}`} />
                              </button>
                            </div>

                            {/* Offer detail panel */}
                            {viewOfferKey === c.key && (
                              <div className="mx-4 mb-3 rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 overflow-hidden shadow-sm">
                                {/* Offer header */}
                                <div className="flex items-center justify-between px-4 py-2.5 bg-green-600 text-white">
                                  <div className="flex items-center gap-2">
                                    <Tag size={13} />
                                    <span className="text-xs font-black uppercase tracking-widest">{c.name}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setViewOfferKey(null)}
                                    className="text-white/80 hover:text-white transition-colors"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                                {/* Offer body */}
                                <div className="px-4 py-3">
                                  <p className="text-2xl font-black text-green-700 mb-1">{c.label}</p>
                                  <p className="text-xs text-gray-600 mb-3">
                                    {c.key === "customer"
                                      ? `Flat ${c.label} discount on this product. Applied automatically on checkout.`
                                      : `${c.label} off for verified retail partners. Applied automatically on checkout.`}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 bg-white border border-dashed border-green-400 rounded-lg px-3 py-2 flex-1">
                                      <span className="text-sm font-black text-green-700 tracking-widest">{c.name}</span>
                                      <span className="ml-auto text-[10px] text-gray-400 font-medium">Coupon Code</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => { c.setSelected(); setViewOfferKey(null); setCouponPanelOpen(false); }}
                                      className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors ${
                                        c.isSelected
                                          ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                                          : "bg-green-600 text-white hover:bg-green-700"
                                      }`}
                                    >
                                      {c.isSelected ? (<><X size={11} /> Remove</>) : (<><Check size={11} /> Apply Coupon</>)}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-5 border-t border-gray-100">
                {[
                  { icon: <Truck size={18} className="text-[#129cd3]" />, label: "Free Delivery", sub: "On orders above ₹1,999" },
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
              </div>{/* end product info card */}

          {/* Tabs Section — inside right column */}
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

// Flipkart-style spec groups — matched by substring on the normalised (lowercase) key.
const SPEC_GROUP_DEFS: { label: string; patterns: string[] }[] = [
  { label: "General", patterns: ["brand", "model", "sim", "warranty", "colour", "color", "form", "launch", "series"] },
  { label: "Display Features", patterns: ["display", "screen", "resolution", "refresh", "pixel", "brightness", "hdr", "amoled", "oled", "lcd", "nits", "panel"] },
  { label: "OS & Processor Features", patterns: ["os", "operating", "processor", "chipset", "cpu", "core", "clock", "snapdragon", "mediatek", "exynos", "helio", "dimensity", "bionic", "a1", "a2"] },
  { label: "Camera Features", patterns: ["camera", "photo", "video", "flash", "aperture", "ois", "zoom", "autofocus", "lens", "megapixel", "mp"] },
  { label: "Battery & Power Features", patterns: ["battery", "charging", "power", "mah", "watt", "fast charge", "wireless"] },
  { label: "Memory & Storage", patterns: ["ram", "memory", "storage", "rom", "expandable", "card"] },
  { label: "Connectivity", patterns: ["bluetooth", "wifi", "wi-fi", "nfc", "usb", "gps", "network", "4g", "5g", "lte", "port", "infrared", "ir"] },
  { label: "Audio", patterns: ["audio", "speaker", "sound", "microphone", "headphone", "jack", "dolby", "stereo"] },
  { label: "Sensors", patterns: ["sensor", "fingerprint", "face", "accelero", "gyro", "proximity", "compass", "barometer"] },
  { label: "Dimensions", patterns: ["height", "width", "thickness", "depth", "weight", "dimension", "size", "build", "material"] },
];

type SpecGroupMeta = {
  icon: React.ReactNode;
  iconBg: string;   // icon bubble colours
  headerBg: string; // header strip background
  accentBorder: string; // left-border colour on the card
};

const SPEC_GROUP_META: Record<string, SpecGroupMeta> = {
  "General":                 { icon: <Info size={16} />,      iconBg: "bg-slate-200 text-slate-700",    headerBg: "bg-gradient-to-r from-slate-100 to-slate-50",   accentBorder: "border-l-slate-500" },
  "Display Features":        { icon: <Monitor size={16} />,   iconBg: "bg-blue-100 text-blue-700",      headerBg: "bg-gradient-to-r from-blue-100 to-blue-50",     accentBorder: "border-l-blue-500" },
  "OS & Processor Features": { icon: <Cpu size={16} />,       iconBg: "bg-purple-100 text-purple-700",  headerBg: "bg-gradient-to-r from-purple-100 to-purple-50", accentBorder: "border-l-purple-500" },
  "Camera Features":         { icon: <Camera size={16} />,    iconBg: "bg-pink-100 text-pink-700",      headerBg: "bg-gradient-to-r from-pink-100 to-pink-50",     accentBorder: "border-l-pink-500" },
  "Battery & Power Features":{ icon: <Zap size={16} />,       iconBg: "bg-orange-100 text-orange-700",  headerBg: "bg-gradient-to-r from-orange-100 to-orange-50", accentBorder: "border-l-orange-500" },
  "Memory & Storage":        { icon: <HardDrive size={16} />, iconBg: "bg-emerald-100 text-emerald-700",headerBg: "bg-gradient-to-r from-emerald-100 to-emerald-50",accentBorder: "border-l-emerald-500" },
  "Connectivity":            { icon: <Wifi size={16} />,      iconBg: "bg-cyan-100 text-cyan-700",      headerBg: "bg-gradient-to-r from-cyan-100 to-cyan-50",     accentBorder: "border-l-cyan-500" },
  "Audio":                   { icon: <Volume2 size={16} />,   iconBg: "bg-yellow-100 text-yellow-700",  headerBg: "bg-gradient-to-r from-yellow-100 to-yellow-50", accentBorder: "border-l-yellow-500" },
  "Sensors":                 { icon: <Activity size={16} />,  iconBg: "bg-teal-100 text-teal-700",      headerBg: "bg-gradient-to-r from-teal-100 to-teal-50",     accentBorder: "border-l-teal-500" },
  "Dimensions":              { icon: <Ruler size={16} />,     iconBg: "bg-rose-100 text-rose-700",      headerBg: "bg-gradient-to-r from-rose-100 to-rose-50",     accentBorder: "border-l-rose-500" },
  "Other Details":           { icon: <LayoutGrid size={16} />,iconBg: "bg-gray-100 text-gray-700",      headerBg: "bg-gradient-to-r from-gray-100 to-gray-50",     accentBorder: "border-l-gray-500" },
};

function SpecsTable({ specs }: { specs: Record<string, unknown> }) {
  const entries = Object.entries(specs).filter(([key]) => !HIDDEN_SPEC_KEYS.has(key));
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No specifications listed.</p>;
  }

  const buckets = new Map<string, [string, unknown][]>(
    SPEC_GROUP_DEFS.map((g) => [g.label, []])
  );
  const other: [string, unknown][] = [];

  for (const entry of entries) {
    const norm = entry[0].toLowerCase();
    const matched = SPEC_GROUP_DEFS.find((g) => g.patterns.some((p) => norm.includes(p)));
    if (matched) buckets.get(matched.label)!.push(entry);
    else other.push(entry);
  }

  const renderedGroups = [
    ...SPEC_GROUP_DEFS.map((g) => ({ label: g.label, items: buckets.get(g.label)! })).filter((g) => g.items.length > 0),
    ...(other.length > 0 ? [{ label: "Other Details", items: other }] : []),
  ];

  return (
    <div className="space-y-2">
      {renderedGroups.map((group) => {
        const meta = SPEC_GROUP_META[group.label] ?? SPEC_GROUP_META["Other Details"];
        return (
          <div
            key={group.label}
            className={`rounded-2xl border border-gray-200 overflow-hidden shadow-md border-l-[5px] ${meta.accentBorder}`}
          >
            {/* Group header */}
            <div className={`flex items-center gap-3 px-5 py-3.5 ${meta.headerBg} border-b border-gray-200`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${meta.iconBg}`}>
                {meta.icon}
              </span>
              <h3 className="text-sm font-extrabold text-gray-800 tracking-wide">{group.label}</h3>
              <span className="ml-auto text-[10px] font-bold text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200 shadow-sm">
                {group.items.length}
              </span>
            </div>

            {/* Spec rows — one per row, label left · value right */}
            <div className="divide-y divide-gray-100">
              {group.items.map(([key, value], idx) => (
                <div
                  key={key}
                  className={`flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-[#f0faff] ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-2/5 flex-shrink-0 pt-0.5 leading-relaxed">
                    {humanizeSpecKey(key)}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 flex-1 leading-snug">
                    {formatSpecValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Product Highlights ────────────────────────────────────────────────────────

type HighlightRow = {
  icon: React.ReactNode;
  label: string;
  text: string;
  accent: string;  // tailwind bg color for icon bubble
};

function buildHighlights(specs: Record<string, unknown>): HighlightRow[] {
  const s = (key: string) => {
    const v = specs[key];
    return v ? String(v).trim() : "";
  };

  const rows: HighlightRow[] = [];

  // RAM + ROM combined
  const ram = s("RAM");
  const rom = s("ROM");
  if (ram || rom) {
    rows.push({
      icon: <Cpu size={18} />,
      label: "Memory",
      text: [ram && `${ram} RAM`, rom && `${rom} ROM`].filter(Boolean).join(" | "),
      accent: "bg-blue-100 text-blue-600",
    });
  }

  // Processor
  const proc = s("Processor");
  if (proc) rows.push({ icon: <Cpu size={18} />, label: "Processor", text: proc, accent: "bg-purple-100 text-purple-600" });

  // Rear camera
  const rear = s("Rear Camera");
  if (rear) rows.push({ icon: <Camera size={18} />, label: "Rear Camera", text: `${rear} Rear Camera`, accent: "bg-[#e8f7fc] text-[#129cd3]" });

  // Front camera
  const front = s("Front Camera");
  if (front) rows.push({ icon: <Camera size={18} />, label: "Front Camera", text: `${front} Front Camera`, accent: "bg-pink-100 text-pink-500" });

  // Display — combine available display fields
  const parts: string[] = [];
  if (s("Display Size")) parts.push(s("Display Size"));
  if (s("Resolution")) parts.push(s("Resolution"));
  if (s("Screen Type")) parts.push(s("Screen Type"));
  if (parts.length) rows.push({ icon: <Smartphone size={18} />, label: "Display", text: `${parts.join(" · ")} Display`, accent: "bg-cyan-100 text-cyan-600" });

  // Battery
  const bat = s("Battery");
  if (bat) rows.push({ icon: <BatteryMedium size={18} />, label: "Battery", text: bat, accent: "bg-green-100 text-green-600" });

  // Weight
  const weight = s("Weight");
  if (weight) rows.push({ icon: <HardDrive size={18} />, label: "Weight", text: weight, accent: "bg-gray-100 text-gray-500" });

  // Fallback for non-phone products
  if (rows.length === 0) {
    Object.entries(specs).forEach(([key, val]) => {
      if (val && typeof val !== "object") {
        rows.push({ icon: <ChevronRight size={16} />, label: key, text: String(val), accent: "bg-[#e8f7fc] text-[#129cd3]" });
      }
    });
  }

  return rows;
}

function buildTvHighlights(specs: Record<string, unknown>, selectedVariant?: Variant): HighlightRow[] {
  const s = (key: string) => {
    const v = specs[key];
    return v ? String(v).trim() : "";
  };
  const rows: HighlightRow[] = [];

  const displayTech = s("Display Technology");
  if (displayTech) rows.push({ icon: <Monitor size={18} />, label: "Display Technology", text: displayTech, accent: "bg-cyan-100 text-cyan-600" });

  const resolution = s("Resolution");
  if (resolution) rows.push({ icon: <Smartphone size={18} />, label: "Resolution", text: resolution, accent: "bg-blue-100 text-blue-600" });

  const refreshRate = s("Refresh Rate");
  if (refreshRate) rows.push({ icon: <Zap size={18} />, label: "Refresh Rate", text: refreshRate, accent: "bg-yellow-100 text-yellow-600" });

  const connectivity = s("Connectivity Technology");
  if (connectivity) rows.push({ icon: <Wifi size={18} />, label: "Connectivity", text: connectivity, accent: "bg-purple-100 text-purple-600" });

  const dimensions = s("Product Dimensions");
  if (dimensions) rows.push({ icon: <Ruler size={18} />, label: "Dimensions", text: dimensions, accent: "bg-gray-100 text-gray-500" });

  const power = s("Power Consumption");
  if (power) rows.push({ icon: <Zap size={18} />, label: "Power Consumption", text: power, accent: "bg-orange-100 text-orange-500" });

  const modelNo = selectedVariant?.attributes?.model
    ? String(selectedVariant.attributes.model)
    : "";
  if (modelNo) rows.push({ icon: <Hash size={18} />, label: "Model No.", text: modelNo, accent: "bg-[#e8f7fc] text-[#129cd3]" });

  return rows;
}

function ProductHighlights({ specs, isTv, selectedVariant }: { specs: Record<string, unknown>; isTv?: boolean; selectedVariant?: Variant }) {
  const [expanded, setExpanded] = useState(true);
  const highlights = isTv ? buildTvHighlights(specs, selectedVariant) : buildHighlights(specs);

  if (highlights.length === 0) return null;

  const visible = expanded ? highlights : highlights.slice(0, 4);

  return (
    <div className="mb-5 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#129cd3] to-[#0e87b5]"
      >
        <div className="flex items-center gap-2">
          <span className="text-white text-base">⚡</span>
          <span className="text-sm font-bold text-white tracking-wide">Product Highlights</span>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-white/80" />
          : <ChevronDown size={16} className="text-white/80" />}
      </button>

      {/* Grid of highlight cards */}
      <div className="bg-gray-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((row, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md hover:border-[#129cd3]/30 transition-all"
          >
            {/* Icon bubble */}
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${row.accent}`}>
              {row.icon}
            </span>
            {/* Text */}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
                {row.label}
              </p>
              <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                {row.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {highlights.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-xs font-semibold text-[#129cd3] py-2.5 bg-white hover:bg-[#e8f7fc] border-t border-gray-100 transition-colors"
        >
          {expanded ? "▲ Show less" : `▼ Show all ${highlights.length} highlights`}
        </button>
      )}
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
