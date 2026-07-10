"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cartApi, catalogApi, isApiError, reviewsApi } from "@/lib/api";
import type { ProductDetail, Variant, Review, ReviewListResponse, ListCard } from "@/lib/api";
import { ProductCardExpander, ProductCardSkeleton } from "@/components/ProductCard";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { useCart } from "@/lib/cart/CartProvider";
import { useStock } from "@/lib/stock/StockProvider";
import { useActiveCategory } from "@/lib/nav/ActiveCategoryProvider";
import {
  Star,
  Heart,
  Share2,
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


type AddState = "idle" | "busy" | "added" | "error";

// ── Variant selection helpers ─────────────────────────────────────────────
// Attribute keys match the admin variant editor (ROM is stored as `storage`).
const VARIANT_ATTR_ORDER = ["launchYear", "model", "size", "ram", "storage", "color"];
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
    groups.every((g) => attrValue(v, g.key) === (attrs[g.key] ?? "")),
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

function SimilarProducts({
  breadcrumbs,
  currentSlug,
  brand,
}: {
  breadcrumbs: { id: string }[];
  currentSlug: string;
  brand?: string;
}) {
  const [items, setItems] = useState<ListCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable dep: join breadcrumb IDs into a string
  const crumbIds = breadcrumbs.map((c) => c.id).join(",");

  useEffect(() => {
    const ctrl = new AbortController();
    const filter = (res: { items: ListCard[] }) =>
      res.items.filter((p) => p.slug !== currentSlug);

    async function load() {
      // Try each breadcrumb level from deepest to shallowest
      const levels = [...breadcrumbs].reverse();
      for (const crumb of levels) {
        try {
          const res = await catalogApi.listProducts({ category: crumb.id, limit: 24 }, ctrl.signal);
          const filtered = filter(res);
          if (filtered.length > 0) {
            setItems(filtered);
            return;
          }
        } catch {
          // abort or network error — stop
          return;
        }
      }
      // Final fallback: fetch by brand
      if (brand) {
        try {
          const res = await catalogApi.listProducts({ brand, limit: 24 }, ctrl.signal);
          setItems(filter(res));
        } catch { /* ignore */ }
      }
    }

    load().finally(() => setLoading(false));
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbIds, currentSlug, brand]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 500, behavior: "smooth" });
  };

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -500, behavior: "smooth" });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="border-t border-gray-200 pt-8 pb-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-5">Similar Products</h2>
        <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex flex-nowrap gap-4 overflow-x-auto pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[230px]">
                  <ProductCardSkeleton />
                </div>
              ))
            : items.map((p) => (
                <ProductCardExpander
                  key={p.id}
                  product={p}
                  cardClassName="flex-shrink-0 w-[230px]"
                />
              ))}
        </div>
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-700 transition-colors shadow z-10"
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-700 transition-colors shadow z-10"
            aria-label="Scroll right"
          >
            <ChevronRight size={20} className="text-white" />
          </button>
        )}
        </div>
      </div>
    </section>
  );
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ Description: true });
  const toggleSection = (name: string) => setOpenSections((p) => ({ ...p, [name]: !p[name] }));
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [thumbOffset, setThumbOffset] = useState(0);
  const THUMB_PER_PAGE = 5;
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [addState, setAddState] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const { isWishlisted, add: addToWishlist, removeByProductId } = useWishlist();
  const { setCart: syncHeaderCart, items: cartItems } = useCart();
  const { stocks, setStock, adjustStock } = useStock();
  const { setActiveCategory } = useActiveCategory();
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
        // Set active nav category from breadcrumbs (highlights the correct menu item)
        const catCrumb = p.breadcrumbs.find((b) => b.slug && b.slug !== "products");
        setActiveCategory(catCrumb?.slug ?? null);
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
    return () => { ac.abort(); setActiveCategory(null); };
  // stocks/setStock intentionally omitted — they are used only to seed initial
  // values and must not re-trigger the fetch (which resets selectedAttrs).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, variantParam]);

  // Seed coupons: try embedded → cart line → dedicated public endpoint.
  useEffect(() => {
    if (!product) return;
    let cancelled = false;

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

    // 3. Fetch directly from the dedicated public coupons endpoint (no auth required).
    catalogApi.getProductCoupons(product.slug)
      .then((coupons) => { if (!cancelled) apply(coupons as CouponMap); })
      .catch(() => {});

    return () => { cancelled = true; };
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
  const isLensProduct = product.breadcrumbs.some(
    (b) => b.slug?.toLowerCase().includes("lens") || b.name?.toLowerCase().includes("lens")
  );
  const isSpeakerProduct = product.breadcrumbs.some(
    (b) => b.slug?.toLowerCase().includes("speaker") || b.name?.toLowerCase().includes("speaker")
  );
  const isCameraProduct = !isLensProduct && product.breadcrumbs.some(
    (b) => b.slug?.toLowerCase().includes("camera") || b.name?.toLowerCase().includes("camera")
  );
  const isSmartDeviceProduct = !isTvProduct && !isLensProduct && !isSpeakerProduct && !isCameraProduct && product.breadcrumbs.some(
    (b) => (b.slug?.toLowerCase().includes("smart") || b.name?.toLowerCase().includes("smart"))
  );
  // For lens/speaker: the attribute key used for model (may be "model" for new variants or "ram" for old)
  const lensModelKey = (isLensProduct || isSpeakerProduct)
    ? variantGroups.find((g) => g.key === "model" || g.key === "ram")?.key
    : undefined;
  // For lens/speaker: model index = position of selected model value in the variant group.
  // Position-based is more reliable than text-matching against spec "Model" keys.
  const lensOrSpeakerModelIdx = (() => {
    if ((!isLensProduct && !isSpeakerProduct) || !lensModelKey || !selectedVariant) return 0;
    const modelGroup = variantGroups.find((g) => g.key === lensModelKey);
    if (!modelGroup) return 0;
    const selectedVal = attrValue(selectedVariant, lensModelKey);
    const pos = modelGroup.values.indexOf(selectedVal);
    return pos >= 0 ? pos : 0;
  })();
  const cameraModelIdx = (() => {
    if (!isCameraProduct || !selectedVariant) return 0;
    return getActiveModelIndex(product.specs, selectedVariant);
  })();
  const smartDeviceModelIdx = (() => {
    if (!isSmartDeviceProduct || !selectedVariant) return 0;
    // Always use variant position: the admin adds variants and spec sections in
    // the same order (variant 1 → Model 1 specs, variant 2 → Model 2 specs, …),
    // so every variant switch always shows a different title/description/specs
    // regardless of model no., colour, or any other attribute.
    const variantPos = product.variants.findIndex((v) => v.id === selectedVariant.id);
    return variantPos >= 0 && variantPos < MAX_MULTIMODEL_DISPLAY ? variantPos : 0;
  })();
  const productImages = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const galleryImages = (() => {
    if (selectedVariant && selectedVariant.images.length > 0) {
      return selectedVariant.images.map((im, i) => ({ objectKey: im.objectKey, url: im.url, sortOrder: i }));
    }
    // Fallback: when selected variant has no images, try a variant with the same model+color (lens/speaker) or same color (others)
    if (selectedVariant) {
      const colorKeys = [...new Set(product.variants.flatMap((v) => Object.keys(v.attributes)))].filter((k) => /^colou?r$/i.test(k));
      const selectedColorVal = colorKeys.map((k) => selectedAttrs[k]).find(Boolean);
      // For lens/speaker: also match by model (ram attribute) so we don't pull images from a different model
      const selectedModelVal = (isLensProduct || isSpeakerProduct) && lensModelKey
        ? String(selectedVariant.attributes[lensModelKey] ?? "").trim()
        : null;
      if (selectedColorVal) {
        const colorVariant = product.variants.find((v) => {
          if (!v.images.length) return false;
          const colorMatch = colorKeys.some((k) => String(v.attributes[k] ?? "") === selectedColorVal);
          if (!colorMatch) return false;
          if (selectedModelVal && lensModelKey) {
            return String(v.attributes[lensModelKey] ?? "").trim() === selectedModelVal;
          }
          return true;
        });
        if (colorVariant) {
          return colorVariant.images.map((im, i) => ({ objectKey: im.objectKey, url: im.url, sortOrder: i }));
        }
      }
      // For lens/speaker: fallback to any variant with the same model and images
      if (selectedModelVal && lensModelKey) {
        const modelVariant = product.variants.find(
          (v) => String(v.attributes[lensModelKey] ?? "").trim() === selectedModelVal && v.images.length > 0
        );
        if (modelVariant) {
          return modelVariant.images.map((im, i) => ({ objectKey: im.objectKey, url: im.url, sortOrder: i }));
        }
      }
    }
    return productImages;
  })();
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
  // For lens/speaker: filter color options to only show colors for the selected model
  const colorSourceVariants =
    (isLensProduct || isSpeakerProduct) && lensModelKey && selectedAttrs[lensModelKey]
      ? product.variants.filter((v) => attrValue(v, lensModelKey) === selectedAttrs[lensModelKey])
      : product.variants;
  const colorValues = [
    ...new Set(
      colorSourceVariants.flatMap((v) =>
        colorAttrKeys.map((k) => String(v.attributes[k] ?? "")).filter(Boolean)
      )
    ),
  ];
  // The currently selected color, looked up across all color keys
  const selectedColor = colorAttrKeys.map((k) => selectedAttrs[k]).find(Boolean) ?? null;
  // Informational TV variant attributes — stored per-variant but not selectable UI groups
  const TV_HIDDEN_ATTR_KEYS = new Set(["dimensions", "dimWithStand", "dimWithoutStand", "weight"]);
  const nonColorGroups = variantGroups.filter((g) => {
    if (/^colou?r$/i.test(g.key)) return false;
    if (isTvProduct && TV_HIDDEN_ATTR_KEYS.has(g.key)) return false;
    if (isSpeakerProduct && g.key === "watt") return false;
    return true;
  });
  // Filter to variants whose color (under any color key) matches the selection
  const colorFilteredVariants =
    colorAttrKeys.length > 0 && selectedColor
      ? product.variants.filter((v) =>
          colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === selectedColor)
        )
      : product.variants;
  const selectedVariantLabel = isCameraProduct
    ? selectedAttrs["lensIncluded"] === "Yes"
      ? `Body with ${selectedAttrs["lens"] ?? ""}`.trim()
      : "Body Only"
    : nonColorGroups
        .map((g) => selectedAttrs[g.key])
        .filter(Boolean)
        .join(" + ");

  // For TV: resolve the spec section index for the selected variant.
  // This index is used for title, description, and specifications table.
  // Strategies (in priority order):
  //   1 – Model number: find "Product Name N" whose text contains the variant's model
  //   2 – Variant position: variant at index N → spec section N (most reliable fallback)
  //   3 – Screen Size spec matching (getTvSizeIndex)
  //   4 – Size number word-boundary match in "Product Name N" text
  const tvModelStr = isTvProduct && selectedVariant
    ? String(selectedVariant.attributes?.model ?? "").trim().toLowerCase()
    : "";
  const tvSizeNum = isTvProduct && selectedVariant
    ? String(selectedVariant.attributes?.size ?? "").replace(/[^0-9]/g, "")
    : "";
  const tvSpecIdx = (() => {
    if (!isTvProduct || !selectedVariant) return 0;
    // Strategy 1: match by model number in "Product Name N"
    if (tvModelStr) {
      for (let i = 0; i < MAX_MULTIMODEL_DISPLAY; i++) {
        const n = String(product.specs[multiModelKey("Product Name", i)] ?? "").trim();
        if (n && n.toLowerCase().includes(tvModelStr)) return i;
      }
    }
    // Strategy 2: variant position in product.variants → spec section index
    const variantPos = product.variants.findIndex((v) => v.id === selectedVariant.id);
    if (variantPos >= 0 && variantPos < MAX_MULTIMODEL_DISPLAY) {
      const n = String(product.specs[multiModelKey("Product Name", variantPos)] ?? "").trim();
      if (n) return variantPos;
    }
    // Strategy 3: Screen Size spec matching
    const sizeIdx = getTvSizeIndex(product.specs, selectedVariant);
    if (sizeIdx > 0) return sizeIdx;
    // Strategy 4: size number in "Product Name N" text
    if (tvSizeNum) {
      const re = new RegExp(`(?<![0-9])${tvSizeNum}(?![0-9])`);
      for (let i = 0; i < MAX_MULTIMODEL_DISPLAY; i++) {
        const n = String(product.specs[multiModelKey("Product Name", i)] ?? "").trim();
        if (n && re.test(n)) return i;
      }
    }
    return 0;
  })();
  const tvSpecName = String(product.specs[multiModelKey("Product Name", tvSpecIdx)] ?? "").trim();
  const lensSpecName = isLensProduct
    ? String(product.specs[multiModelKey("Lens Name", lensOrSpeakerModelIdx)] ?? "").trim()
    : "";
  const speakerSpecName = isSpeakerProduct
    ? String(product.specs[multiModelKey("Product Name", lensOrSpeakerModelIdx)] ?? "").trim()
    : "";
  const sdSpecName = isSmartDeviceProduct
    ? String(product.specs[multiModelKey("Product Name", smartDeviceModelIdx)] ?? "").trim()
    : "";
  const cameraSpecName = isCameraProduct
    ? String(product.specs[multiModelKey("Product Name", cameraModelIdx)] ?? "").trim()
    : "";
  const displayTitle = isTvProduct && selectedVariant?.attributes.name
    ? String(selectedVariant.attributes.name)
    : isTvProduct && tvSpecName
    ? tvSpecName
    : isLensProduct && lensSpecName
    ? lensSpecName
    : isSpeakerProduct && speakerSpecName
    ? speakerSpecName
    : isSmartDeviceProduct && sdSpecName
    ? sdSpecName
    : isCameraProduct && cameraSpecName
    ? cameraSpecName
    : product.name;

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
            <span className="text-gray-800 font-medium line-clamp-1">{displayTitle}</span>
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
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start mb-8">
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
                <div className="absolute top-3 right-3 flex flex-col gap-2">
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
                    className="w-9 h-9 bg-white shadow rounded-full flex items-center justify-center transition-colors hover:bg-[#e8f7fc] disabled:opacity-50"
                  >
                    <Heart
                      size={18}
                      className={
                        wishlisted ? "fill-red-500 text-red-500" : "text-gray-400"
                      }
                    />
                  </button>
                  <button
                    onClick={async () => {
                      const url = window.location.origin + `/products/${slug}` +
                        (selectedVariant ? `?variant=${selectedVariant.id}` : "");
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: product?.name ?? "", url });
                        } else {
                          await navigator.clipboard.writeText(url);
                          setShareState("copied");
                          window.setTimeout(() => setShareState("idle"), 2000);
                        }
                      } catch {
                        // User cancelled or clipboard failed
                      }
                    }}
                    aria-label="Share product"
                    className="w-9 h-9 bg-white shadow rounded-full flex items-center justify-center transition-colors hover:bg-[#e8f7fc]"
                  >
                    {shareState === "copied"
                      ? <Check size={16} className="text-green-500" />
                      : <Share2 size={16} className="text-gray-400" />}
                  </button>
                </div>
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
                title={displayTitle}
                className="text-2xl font-bold text-gray-900 mb-3 leading-snug"
              >
                {!titleExpanded && displayTitle.length > 80 ? (
                  <>
                    {displayTitle.slice(0, 80)}
                    <span
                      className="text-[#129cd3] cursor-pointer font-normal text-base ml-0.5"
                      onClick={() => setTitleExpanded(true)}
                    >
                      ...more
                    </span>
                  </>
                ) : (
                  displayTitle
                )}
              </h1>

              {/* Rating (live from reviewsResp.aggregate) */}
              <button
                type="button"
                onClick={() => setOpenSections((p) => ({ ...p, Reviews: true }))}
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
              <ProductHighlights specs={product.specs} isTv={isTvProduct} isCamera={isCameraProduct} isLens={isLensProduct} isSpeaker={isSpeakerProduct} isSmartDevice={isSmartDeviceProduct} selectedVariant={selectedVariant} modelIdx={isTvProduct ? tvSpecIdx : (isLensProduct || isSpeakerProduct) ? lensOrSpeakerModelIdx : isSmartDeviceProduct ? smartDeviceModelIdx : isCameraProduct ? cameraModelIdx : undefined} />

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
                  {/* Color — image thumbnails (phones/cameras first) */}
                  {colorValues.length > 0 && !(isLensProduct || isSpeakerProduct) && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-4">
                        {colorValues.map((color) => {
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
                                const target =
                                  product.variants.find((v) =>
                                    colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color) && v.stock > 0
                                  ) ??
                                  product.variants.find((v) =>
                                    colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color)
                                  );
                                if (target) { setSelectedAttrs(attrsOf(target)); setActiveImageIdx(0); }
                              }}
                              className="flex flex-col items-center gap-1 group focus:outline-none"
                            >
                              <span className={`rounded-lg border-2 transition-colors overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50 ${active ? "border-[#129cd3] shadow-sm" : "border-gray-300 group-hover:border-gray-500"}`} style={{ width: 64, height: 64 }}>
                                {imgUrl ? <img src={imgUrl} alt={color} className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400 p-1 text-center leading-tight">{color}</span>}
                              </span>
                              <span className={`text-xs text-center leading-tight max-w-[72px] truncate transition-colors ${active ? "font-semibold text-[#129cd3]" : "font-medium text-gray-600 group-hover:text-gray-800"}`}>{color}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lens / Speaker: color thumbnails FIRST, model-aware */}
                  {colorValues.length > 0 && (isLensProduct || isSpeakerProduct) && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-4">
                        {colorValues.map((color) => {
                          const currentModelVal = lensModelKey ? selectedAttrs[lensModelKey] : undefined;
                          const colorVariant =
                            (currentModelVal && lensModelKey
                              ? product.variants.find((v) =>
                                  attrValue(v, lensModelKey) === currentModelVal &&
                                  colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color)
                                )
                              : undefined) ??
                            product.variants.find((v) =>
                              colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color)
                            );
                          const imgUrl = colorVariant?.images?.[0]?.url ?? productImages[0]?.url ?? null;
                          const active = selectedColor === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => {
                                const currentModel = lensModelKey ? selectedAttrs[lensModelKey] : undefined;
                                const pool = currentModel && lensModelKey
                                  ? product.variants.filter((v) => attrValue(v, lensModelKey) === currentModel)
                                  : product.variants;
                                const target =
                                  pool.find((v) => colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color) && v.stock > 0) ??
                                  pool.find((v) => colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === color));
                                if (target) { setSelectedAttrs(attrsOf(target)); setActiveImageIdx(0); }
                              }}
                              className="flex flex-col items-center gap-1 group focus:outline-none"
                            >
                              <span className={`rounded-lg border-2 transition-colors overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50 ${active ? "border-[#129cd3] shadow-sm" : "border-gray-300 group-hover:border-gray-500"}`} style={{ width: 64, height: 64 }}>
                                {imgUrl ? <img src={imgUrl} alt={color} className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400 p-1 text-center leading-tight">{color}</span>}
                              </span>
                              <span className={`text-xs text-center leading-tight max-w-[72px] truncate transition-colors ${active ? "font-semibold text-[#129cd3]" : "font-medium text-gray-600 group-hover:text-gray-800"}`}>{color}</span>
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
                        /* TV: per-attribute pill rows */
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
                      ) : (isLensProduct || isSpeakerProduct) ? (
                        /* Lens / Speaker: model variant cards with pricing */
                        <>
                          {selectedVariantLabel && (
                            <p className="text-sm font-bold text-gray-800 mb-3">
                              Variant: <span className="font-semibold">{selectedVariantLabel}</span>
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3">
                            {nonColorGroups.flatMap((g) =>
                              [...g.values].map((val) => {
                                const pool = selectedColor
                                  ? product.variants.filter((v) =>
                                      colorAttrKeys.some((k) => String(v.attributes[k] ?? "") === selectedColor)
                                    )
                                  : product.variants;
                                const cardVariant =
                                  pool.find((v) => attrValue(v, g.key) === val && v.stock > 0) ??
                                  pool.find((v) => attrValue(v, g.key) === val) ??
                                  product.variants.find((v) => attrValue(v, g.key) === val);
                                if (!cardVariant) return null;
                                const isActive = selectedAttrs[g.key] === val;
                                const vBase = cardVariant.deal ? cardVariant.deal.basePrice : cardVariant.pricing.basePrice;
                                const vFinal = cardVariant.deal ? cardVariant.deal.dealPrice : cardVariant.pricing.finalPrice;
                                const vDiscount = vBase > vFinal ? Math.round(((vBase - vFinal) / vBase) * 100) : 0;
                                const vStockKey = `v:${cardVariant.id}`;
                                const vStock = stocks[vStockKey] ?? cardVariant.stock ?? 0;
                                const vOutOfStock = vStock === 0;
                                return (
                                  <div key={val} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                    <button
                                      type="button"
                                      disabled={vOutOfStock}
                                      onClick={() => selectVariantValue(g.key, val)}
                                      className={`flex flex-col items-start text-left px-3 py-2 rounded-lg border-2 transition-colors min-w-[110px] ${
                                        isActive
                                          ? "border-[#129cd3] bg-blue-50"
                                          : vOutOfStock
                                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                                          : "border-gray-200 bg-white hover:border-gray-400"
                                      }`}
                                    >
                                      <span className={`text-sm font-semibold mb-0.5 ${vOutOfStock ? "text-gray-400 line-through" : "text-gray-800"}`}>{val}</span>
                                      {isSpeakerProduct && attrValue(cardVariant, "watt") && (
                                        <span className="text-xs text-gray-500">{attrValue(cardVariant, "watt")}</span>
                                      )}
                                      {vDiscount > 0 && (
                                        <span className="text-xs text-green-600 font-medium">
                                          ↓{vDiscount}%{" "}
                                          <span className="line-through text-gray-400">{formatPrice(vBase)}</span>
                                        </span>
                                      )}
                                      <span className="text-sm font-bold text-gray-900">{formatPrice(vFinal)}</span>
                                    </button>
                                    {vOutOfStock ? (
                                      <span className="text-[10px] font-semibold text-red-400">Out of stock</span>
                                    ) : vStock <= 9 ? (
                                      <span className={`text-[10px] font-semibold ${vStock <= 4 ? "text-red-500" : "text-orange-500"}`}>
                                        {vStock <= 4 ? `${vStock} left` : "Few left"}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      ) : (
                        /* Phone / Camera: combined variant cards with pricing */
                        <>
                          {selectedVariantLabel && (
                            <p className="text-sm font-bold text-gray-800 mb-3">
                              Variant: <span className="font-semibold">{selectedVariantLabel}</span>
                            </p>
                          )}
                          <div className={`flex gap-3 ${isCameraProduct ? "overflow-x-auto pb-2 flex-nowrap" : "flex-wrap"}`}>
                            {colorFilteredVariants.map((v) => {
                              const label = isCameraProduct
                                ? attrValue(v, "lensIncluded") === "Yes"
                                  ? `Body with ${attrValue(v, "lens")}`.trim()
                                  : "Body Only"
                                : nonColorGroups
                                    .map((g) => attrValue(v, g.key))
                                    .filter(Boolean)
                                    .join(" + ");
                              if (!label) return null;
                              const isActive = selectedVariant?.id === v.id;
                              const vBase = v.deal ? v.deal.basePrice : v.pricing.basePrice;
                              const vFinal = v.deal ? v.deal.dealPrice : v.pricing.finalPrice;
                              const vDiscount =
                                vBase > vFinal
                                  ? Math.round(((vBase - vFinal) / vBase) * 100)
                                  : 0;
                              const vStockKey = `v:${v.id}`;
                              const vStock = stocks[vStockKey] ?? v.stock ?? 0;
                              const vOutOfStock = vStock === 0;
                              return (
                                <div key={v.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                  <button
                                    type="button"
                                    disabled={vOutOfStock}
                                    onClick={() => { setSelectedAttrs(attrsOf(v)); setActiveImageIdx(0); }}
                                    className={`flex flex-col items-start text-left px-3 py-2 rounded-lg border-2 transition-colors min-w-[110px] ${
                                      isActive
                                        ? "border-[#129cd3] bg-blue-50"
                                        : vOutOfStock
                                        ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                                        : "border-gray-200 bg-white hover:border-gray-400"
                                    }`}
                                  >
                                    <span className={`text-sm font-semibold mb-0.5 ${vOutOfStock ? "text-gray-400 line-through" : "text-gray-800"}`}>{label}</span>
                                    {vDiscount > 0 && (
                                      <span className="text-xs text-green-600 font-medium">
                                        ↓{vDiscount}%{" "}
                                        <span className="line-through text-gray-400">{formatPrice(vBase)}</span>
                                      </span>
                                    )}
                                    <span className="text-sm font-bold text-gray-900">{formatPrice(vFinal)}</span>
                                  </button>
                                  {vOutOfStock ? (
                                    <span className="text-[10px] font-semibold text-red-400">Out of stock</span>
                                  ) : vStock <= 9 ? (
                                    <span className={`text-[10px] font-semibold ${vStock <= 4 ? "text-red-500" : "text-orange-500"}`}>
                                      {vStock <= 4 ? `${vStock} left` : "Few left"}
                                    </span>
                                  ) : null}
                                </div>
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
                        const msg = isApiError(err) ? err.displayMessage : "";
                        setAddError(
                          (msg.toLowerCase().includes("name must be") || msg.toLowerCase().includes("product name is required"))
                            ? "This product is missing required information. Please contact support."
                            : msg || "Could not add to cart",
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
                        const msg = isApiError(err) ? err.displayMessage : "";
                        setAddError(
                          msg.toLowerCase().includes("name must be")
                            ? "This product is missing required information. Please contact support."
                            : msg || "Could not start checkout",
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
                                className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all duration-200 whitespace-nowrap shadow-sm ${
                                  viewOfferKey === c.key
                                    ? "bg-[#129cd3] text-white border-[#129cd3] shadow-[#129cd3]/30 shadow-md"
                                    : "bg-white text-[#129cd3] border-[#129cd3] hover:bg-[#129cd3] hover:text-white hover:shadow-md hover:shadow-[#129cd3]/25"
                                }`}
                              >
                                View Offer
                                <ChevronDown size={12} className={`transition-transform duration-200 ${viewOfferKey === c.key ? "rotate-180" : ""}`} />
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

          {/* Accordion Section — Description / Specifications / Reviews */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-300 shadow-sm mt-6">

            {/* Description */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("Description")}
                className="w-full flex items-center justify-between px-5 py-4 bg-[#f7f8f8] hover:bg-[#eef0f0] transition-colors text-left"
              >
                <span className="text-[15px] font-bold text-gray-900">Description</span>
                <ChevronDown size={18} className={`text-gray-500 flex-shrink-0 transition-transform duration-200 ${openSections["Description"] ? "rotate-180" : ""}`} />
              </button>
              {openSections["Description"] && (
                <div className="px-5 py-5 prose max-w-none text-gray-600 text-sm leading-relaxed whitespace-pre-line border-t border-gray-100">
                  {(isLensProduct || isSpeakerProduct)
                    ? (String(product.specs[multiModelKey("Description", lensOrSpeakerModelIdx)] ?? "").trim() || product.description || "No description available.")
                    : isTvProduct
                    ? (String(product.specs[multiModelKey("Description", tvSpecIdx)] ?? "").trim() || product.description || "No description available.")
                    : isSmartDeviceProduct
                    ? (String(product.specs[multiModelKey("Description", smartDeviceModelIdx)] ?? "").trim() || product.description || "No description available.")
                    : isCameraProduct
                    ? (String(product.specs[multiModelKey("Description", cameraModelIdx)] ?? "").trim() || product.description || "No description available.")
                    : (product.description || "No description available.")}
                </div>
              )}
            </div>

            {/* Specifications */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("Specifications")}
                className="w-full flex items-center justify-between px-5 py-4 bg-[#f7f8f8] hover:bg-[#eef0f0] transition-colors text-left"
              >
                <span className="text-[15px] font-bold text-gray-900">Specifications</span>
                <ChevronDown size={18} className={`text-gray-500 flex-shrink-0 transition-transform duration-200 ${openSections["Specifications"] ? "rotate-180" : ""}`} />
              </button>
              {openSections["Specifications"] && (
                <div className="px-5 py-5 border-t border-gray-100">
                  {isSmartDeviceProduct ? (
                    <SmartDeviceSpecsTable specs={product.specs} modelIdx={smartDeviceModelIdx} />
                  ) : (
                    <SpecsTable
                      specs={
                        isTvProduct && selectedVariant
                          ? {
                              ...product.specs,
                              ...(selectedVariant.attributes.dimWithoutStand ? { "W×H×D (without stand)": selectedVariant.attributes.dimWithoutStand } : {}),
                              ...(selectedVariant.attributes.dimWithStand ? { "W×H×D (with stand)": selectedVariant.attributes.dimWithStand } : {}),
                              ...(selectedVariant.attributes.weight ? { "Weight": selectedVariant.attributes.weight } : {}),
                            }
                          : product.specs
                      }
                      isLens={isLensProduct}
                      isSpeaker={isSpeakerProduct}
                      isTv={isTvProduct}
                      isCamera={isCameraProduct}
                      modelIdx={
                        isTvProduct
                          ? tvSpecIdx
                          : (isLensProduct || isSpeakerProduct)
                          ? lensOrSpeakerModelIdx
                          : isCameraProduct
                          ? cameraModelIdx
                          : 0
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {/* Reviews */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("Reviews")}
                className="w-full flex items-center justify-between px-5 py-4 bg-[#f7f8f8] hover:bg-[#eef0f0] transition-colors text-left"
              >
                <span className="text-[15px] font-bold text-gray-900">
                  Reviews{reviewsResp?.aggregate.count ? ` (${reviewsResp.aggregate.count})` : ""}
                </span>
                <ChevronDown size={18} className={`text-gray-500 flex-shrink-0 transition-transform duration-200 ${openSections["Reviews"] ? "rotate-180" : ""}`} />
              </button>
              {openSections["Reviews"] && (
              <div className="px-5 py-5 border-t border-gray-100">
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
              </div>
              )}
            </div>

          </div>{/* accordion container */}
        </div>{/* right column flex-1 */}
      </div>{/* flex row */}
      {/* Similar Products */}
      <SimilarProducts
        breadcrumbs={product.breadcrumbs}
        currentSlug={product.slug}
        brand={product.brand ?? undefined}
      />

      </div>{/* max-w-7xl */}

      </main>
      <Footer />
    </>
  );
}

// Legacy keys: RAM/ROM/Color now live on variants, not specs. Hide them so old
// products never render raw arrays like ["8GB","12GB"] in the spec table.
const HIDDEN_SPEC_KEYS = new Set(["ramOptions", "storageOptions", "colorOptions", "Description", "dimensions", "Slug", "Product Name"]);

// ── Multi-model spec helpers (shared by Lens and Speaker) ────────────────────
const MAX_MULTIMODEL_DISPLAY = 5;

function multiModelKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

function getActiveModelIndex(
  specs: Record<string, unknown>,
  selectedVariant?: Variant,
): number {
  if (!selectedVariant) return 0;
  // Try "model" first (new schema), fall back to "ram" (old lens variants stored model under ram)
  const modelNo = selectedVariant.attributes?.model != null
    ? String(selectedVariant.attributes.model).trim().toLowerCase()
    : selectedVariant.attributes?.ram != null
    ? String(selectedVariant.attributes.ram).trim().toLowerCase()
    : "";
  if (!modelNo) return 0;
  for (let i = 0; i < MAX_MULTIMODEL_DISPLAY; i++) {
    const val = specs[multiModelKey("Model", i)];
    if (val && String(val).trim().toLowerCase() === modelNo) return i;
  }
  return 0;
}

// ── Lens per-model keys ───────────────────────────────────────────────────────
const LENS_PER_MODEL_SPEC_BASES = [
  "Model", "Lens Name", "Slug", "Description",
  "Lens Type", "Lens Mount", "Compatible Camera", "Compatible Sensor Format", "Color",
  "Focal Length", "Maximum Aperture", "Minimum Aperture", "Minimum Focus Distance", "Maximum Magnification",
  "Angle of View (Full Frame)", "Optical Construction", "Special Elements", "Aperture Blades",
  "Focus Type", "Focus Motor", "Focus Limiter Switch", "Focus Hold Buttons",
  "Recommended Usage",
];

// ── Camera per-model keys ─────────────────────────────────────────────────────
const CAMERA_PER_MODEL_SPEC_BASES = [
  "Model", "Product Name", "Description", "Slug",
  "Series", "Camera Type", "Launch Year",
  "Sensor Type", "Sensor Size", "Effective Resolution (MP)", "Image Processor", "ISO Range",
  "Lens Mount", "Lens Included", "Lens Name", "Focal Length", "Aperture", "Autofocus",
  "Aspect Ratio", "Screen Size", "Screen Type", "Touchscreen", "Vari-Angle Screen",
  "Built-in Flash", "Hot Shoe",
  "Memory Card Type", "Card Slots",
  "Wi-Fi", "Bluetooth", "NFC", "USB Type", "HDMI",
  "Battery Model", "Battery Life (Shots)",
  "Shutter Speed", "Self-timer",
  "Video Resolution", "Video Quality",
  "Width", "Depth", "Height", "Weight",
];

// ── TV per-size keys ──────────────────────────────────────────────────────────
const TV_PER_SIZE_SPEC_BASES = [
  "Screen Size", "Product Name", "Slug", "Description",
  "Display Technology", "Resolution", "LED Arrangement",
  "Viewing Angle", "Aspect Ratio",
  "Refresh Rate", "Response Time", "Supported Video Formats",
  "Power Supply", "Power Consumption", "BEE Star Rating",
  "Supported Apps", "Other Apps Supported", "Other Convenience Features",
  "Number of Speakers", "Speaker Output RMS", "Sound Mode", "Supported Audio Formats",
  "Battery Requirement",
  "HDMI Ports", "USB Ports", "Wi-Fi", "Wi-Fi Type", "Supported Devices for Casting",
  "RAM Capacity", "Storage Memory",
];

function getTvSizeIndex(specs: Record<string, unknown>, selectedVariant?: Variant): number {
  if (!selectedVariant) return 0;
  const sizeAttr = selectedVariant.attributes?.size;
  if (!sizeAttr) return 0;
  const sizeStr = String(sizeAttr).trim().toLowerCase().replace(/['"]/g, "");
  for (let i = 0; i < MAX_MULTIMODEL_DISPLAY; i++) {
    const val = specs[multiModelKey("Screen Size", i)];
    if (val) {
      const specStr = String(val).trim().toLowerCase().replace(/['"]/g, "");
      if (specStr === sizeStr || specStr.includes(sizeStr) || sizeStr.includes(specStr)) return i;
    }
  }
  return 0;
}

// ── Speaker per-model keys ────────────────────────────────────────────────────
const SPEAKER_PER_MODEL_SPEC_BASES = [
  "Model", "Product Name", "Slug", "Description", "Speaker Type", "Color",
  "Audio Output Power (RMS)", "Frequency Response", "Driver Size",
  "Number of Drivers", "Speaker Configuration", "Impedance", "Sensitivity", "Signal-to-Noise Ratio",
  "Bluetooth", "Bluetooth Version", "Wi-Fi", "AUX Input", "USB Port",
  "HDMI", "Optical Input", "RCA Input", "NFC",
  "Voice Assistant Support", "Multi-Room Audio", "Stereo Pairing", "Party Mode", "Mobile App Support",
  "Battery Capacity", "Battery Life", "Charging Time", "Charging Port",
  "Material", "Water Resistance Rating", "Dust Resistance", "Dimensions", "Weight",
  "Power Source", "Input Voltage",
  "Volume Control", "Playback Controls", "Built-in Microphone", "Hands-Free Calling",
  "Package Contents",
];

// Convenience aliases kept for the lens-specific helpers below
const lensKeyForIdx = multiModelKey;

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
  { label: "Camera Features", patterns: ["camera", "photo", "video", "flash", "aperture", "ois", "zoom", "autofocus", "lens", "megapixel"] },
  { label: "Battery & Power Features", patterns: ["battery", "charging", "power", "mah", "watt", "fast charge", "wireless"] },
  { label: "Memory & Storage", patterns: ["ram", "memory", "storage", "rom", "expandable", "card"] },
  { label: "Connectivity", patterns: ["connectivity", "bluetooth", "wifi", "wi-fi", "nfc", "usb", "hdmi", "ethernet", "gps", "network", "4g", "5g", "lte", "port", "infrared", "ir"] },
  { label: "Audio", patterns: ["audio", "speaker", "sound", "microphone", "headphone", "jack", "dolby", "stereo"] },
  { label: "Sensors", patterns: ["sensor", "fingerprint", "face", "accelero", "gyro", "proximity", "compass", "barometer"] },
  { label: "Dimensions", patterns: ["height", "width", "thickness", "depth", "weight", "dimension", "size", "build", "material"] },
];

function filterMultiModelEntries(
  allEntries: [string, unknown][],
  perModelBases: string[],
  modelIdx: number,
): [string, unknown][] {
  const activeKeys = new Set(perModelBases.map((b) => multiModelKey(b, modelIdx)));
  const otherKeys = new Set<string>();
  for (let i = 0; i < MAX_MULTIMODEL_DISPLAY; i++) {
    if (i === modelIdx) continue;
    for (const base of perModelBases) otherKeys.add(multiModelKey(base, i));
  }
  return allEntries
    .filter(([key]) => !otherKeys.has(key))
    .map(([key, value]) => {
      if (modelIdx > 0 && activeKeys.has(key)) {
        const suffix = ` ${modelIdx + 1}`;
        return [key.endsWith(suffix) ? key.slice(0, -suffix.length) : key, value] as [string, unknown];
      }
      return [key, value] as [string, unknown];
    });
}

function SpecsTable({
  specs,
  isLens = false,
  isSpeaker = false,
  isTv = false,
  isCamera = false,
  modelIdx = 0,
}: {
  specs: Record<string, unknown>;
  isLens?: boolean;
  isSpeaker?: boolean;
  isTv?: boolean;
  isCamera?: boolean;
  modelIdx?: number;
}) {
  let allEntries = Object.entries(specs);

  if (isLens) {
    allEntries = filterMultiModelEntries(allEntries, LENS_PER_MODEL_SPEC_BASES, modelIdx);
  } else if (isSpeaker) {
    allEntries = filterMultiModelEntries(allEntries, SPEAKER_PER_MODEL_SPEC_BASES, modelIdx);
  } else if (isTv) {
    allEntries = filterMultiModelEntries(allEntries, TV_PER_SIZE_SPEC_BASES, modelIdx);
  } else if (isCamera) {
    allEntries = filterMultiModelEntries(allEntries, CAMERA_PER_MODEL_SPEC_BASES, modelIdx);
  }

  allEntries = allEntries.filter(([key]) => !HIDDEN_SPEC_KEYS.has(key));

  const entries = allEntries;
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
    <div className="divide-y divide-gray-200">
      {renderedGroups.map((group) => (
        <div key={group.label}>
          {/* Group heading */}
          <div className="px-4 py-2.5 bg-gradient-to-r from-[#129cd3]/10 via-[#129cd3]/5 to-transparent border-l-4 border-[#129cd3]">
            <h3 className="text-xs font-extrabold text-[#0a6d93] uppercase tracking-widest">{group.label}</h3>
          </div>
          {/* Spec rows */}
          <div className="divide-y divide-gray-100 mb-2">
            {group.items.map(([key, value], idx) => (
              <div
                key={key}
                className={`flex items-start gap-6 px-2 py-3 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-2/5 flex-shrink-0 pt-0.5 leading-relaxed">
                  {humanizeSpecKey(key)}
                </span>
                <span className="text-sm font-medium text-gray-800 flex-1 leading-snug">
                  {formatSpecValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Smart Device Specs Table ──────────────────────────────────────────────────

const SD_RESERVED_DISPLAY_KEYS = new Set([
  "Product Name", "Product Type", "Slug", "Description", "Color", "Model",
]);

function SmartDeviceSpecsTable({
  specs,
  modelIdx = 0,
}: {
  specs: Record<string, unknown>;
  modelIdx?: number;
}) {
  const suffix = modelIdx > 0 ? ` ${modelIdx + 1}` : "";
  const numericSuffixRe = / \d+$/;

  // Collect entries belonging to this model
  const modelEntries: [string, string][] = [];
  for (const [key, value] of Object.entries(specs)) {
    if (modelIdx === 0) {
      if (numericSuffixRe.test(key)) continue;
      modelEntries.push([key, String(value ?? "")]);
    } else {
      if (!key.endsWith(suffix)) continue;
      modelEntries.push([key.slice(0, -suffix.length), String(value ?? "")]);
    }
  }

  type Section = { heading: string; fields: [string, string][] };
  let visibleSections: Section[] = [];

  // New format: fields stored as __hN:fieldKey — order-independent
  const hasNewFormat = modelEntries.some(([k]) => /^__h\d+:/.test(k));
  if (hasNewFormat) {
    const headings = new Map<number, string>();
    const fieldsBySection = new Map<number, [string, string][]>();
    for (const [key, value] of modelEntries) {
      const hm = key.match(/^__h(\d+)$/);
      if (hm) { headings.set(+hm[1], value); continue; }
      const fm = key.match(/^__h(\d+):(.+)$/);
      if (fm) {
        const si = +fm[1];
        const fieldKey = fm[2];
        if (SD_RESERVED_DISPLAY_KEYS.has(fieldKey) || HIDDEN_SPEC_KEYS.has(fieldKey)) continue;
        if (!fieldKey.trim() || !value.trim()) continue;
        if (!fieldsBySection.has(si)) fieldsBySection.set(si, []);
        fieldsBySection.get(si)!.push([fieldKey, value]);
      }
    }
    const maxSi = Math.max(-1, ...headings.keys(), ...fieldsBySection.keys());
    if (maxSi >= 0) {
      const sections = Array.from({ length: maxSi + 1 }, (_, si) => ({
        heading: headings.get(si) ?? "",
        fields: fieldsBySection.get(si) ?? [] as [string, string][],
      }));
      visibleSections = sections.filter((s) => s.fields.length > 0);
    }
  } else {
    // Legacy format: order-dependent __hN markers
    const sections: Section[] = [];
    let cur: Section = { heading: "", fields: [] };
    for (const [key, value] of modelEntries) {
      if (/^__h\d+$/.test(key)) {
        if (cur.heading || cur.fields.length > 0) sections.push(cur);
        cur = { heading: value, fields: [] };
      } else {
        if (SD_RESERVED_DISPLAY_KEYS.has(key) || HIDDEN_SPEC_KEYS.has(key)) continue;
        if (!key.trim() || !value.trim()) continue;
        cur.fields.push([key, value]);
      }
    }
    if (cur.heading || cur.fields.length > 0) sections.push(cur);
    visibleSections = sections.filter((s) => s.fields.length > 0);
  }

  if (visibleSections.length === 0) {
    return <p className="text-sm text-gray-500">No specifications listed.</p>;
  }

  return (
    <div className="divide-y divide-gray-200">
      {visibleSections.map((section, si) => (
        <div key={si}>
          {section.heading && (
            <div className="px-4 py-2.5 bg-gradient-to-r from-[#129cd3]/10 via-[#129cd3]/5 to-transparent border-l-4 border-[#129cd3]">
              <h3 className="text-xs font-extrabold text-[#0a6d93] uppercase tracking-widest">{section.heading}</h3>
            </div>
          )}
          <div className="divide-y divide-gray-100 mb-2">
            {section.fields.map(([key, value], idx) => (
              <div
                key={key}
                className={`flex items-start gap-6 px-2 py-3 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-2/5 flex-shrink-0 pt-0.5 leading-relaxed">
                  {humanizeSpecKey(key)}
                </span>
                <span className="text-sm font-medium text-gray-800 flex-1 leading-snug">
                  {formatSpecValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Smart Device Highlights ───────────────────────────────────────────────────

function buildSmartDeviceHighlights(
  specs: Record<string, unknown>,
  modelIdx = 0,
): HighlightRow[] {
  const suffix = modelIdx > 0 ? ` ${modelIdx + 1}` : "";
  const numericSuffixRe = / \d+$/;

  const modelEntries: [string, string][] = [];
  for (const [key, value] of Object.entries(specs)) {
    if (modelIdx === 0) {
      if (numericSuffixRe.test(key)) continue;
      modelEntries.push([key, String(value ?? "")]);
    } else {
      if (!key.endsWith(suffix)) continue;
      modelEntries.push([key.slice(0, -suffix.length), String(value ?? "")]);
    }
  }

  type Section = { heading: string; fields: [string, string][] };
  let sections: Section[] = [];

  const hasNewFormat = modelEntries.some(([k]) => /^__h\d+:/.test(k));
  if (hasNewFormat) {
    const headings = new Map<number, string>();
    const fieldsBySection = new Map<number, [string, string][]>();
    for (const [key, value] of modelEntries) {
      const hm = key.match(/^__h(\d+)$/);
      if (hm) { headings.set(+hm[1], value); continue; }
      const fm = key.match(/^__h(\d+):(.+)$/);
      if (fm) {
        const si = +fm[1];
        const fieldKey = fm[2];
        if (SD_RESERVED_DISPLAY_KEYS.has(fieldKey) || HIDDEN_SPEC_KEYS.has(fieldKey)) continue;
        if (!fieldKey.trim() || !value.trim()) continue;
        if (!fieldsBySection.has(si)) fieldsBySection.set(si, []);
        fieldsBySection.get(si)!.push([fieldKey, value]);
      }
    }
    const maxSi = Math.max(-1, ...headings.keys(), ...fieldsBySection.keys());
    if (maxSi >= 0) {
      sections = Array.from({ length: maxSi + 1 }, (_, si) => ({
        heading: headings.get(si) ?? "",
        fields: fieldsBySection.get(si) ?? [],
      })).filter((s) => s.fields.length > 0);
    }
  } else {
    let cur: Section = { heading: "", fields: [] };
    for (const [key, value] of modelEntries) {
      if (/^__h\d+$/.test(key)) {
        if (cur.heading || cur.fields.length > 0) sections.push(cur);
        cur = { heading: value, fields: [] };
      } else {
        if (SD_RESERVED_DISPLAY_KEYS.has(key) || HIDDEN_SPEC_KEYS.has(key)) continue;
        if (!key.trim() || !value.trim()) continue;
        cur.fields.push([key, value]);
      }
    }
    if (cur.heading || cur.fields.length > 0) sections.push(cur);
    sections = sections.filter((s) => s.fields.length > 0);
  }

  const ICONS = [
    <Zap key="z" size={16} className="text-yellow-600" />,
    <Wifi key="w" size={16} className="text-blue-600" />,
    <BatteryMedium key="b" size={16} className="text-green-600" />,
    <HardDrive key="h" size={16} className="text-purple-600" />,
    <Cpu key="c" size={16} className="text-orange-600" />,
    <Monitor key="m" size={16} className="text-[#129cd3]" />,
    <Ruler key="r" size={16} className="text-gray-600" />,
    <Hash key="hash" size={16} className="text-pink-600" />,
  ];
  const ACCENTS = [
    "bg-yellow-100",
    "bg-blue-100",
    "bg-green-100",
    "bg-purple-100",
    "bg-orange-100",
    "bg-[#e8f7fc]",
    "bg-gray-100",
    "bg-pink-100",
  ];

  const rows: HighlightRow[] = [];
  let iconIdx = 0;
  for (const s of sections) {
    for (const [fieldKey, fieldValue] of s.fields.slice(0, 2)) {
      rows.push({
        icon: ICONS[iconIdx % ICONS.length],
        label: humanizeSpecKey(fieldKey),
        text: fieldValue,
        accent: ACCENTS[iconIdx % ACCENTS.length],
      });
      iconIdx++;
    }
  }
  return rows;
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

function buildTvHighlights(specs: Record<string, unknown>, sizeIdx: number, selectedVariant?: Variant): HighlightRow[] {
  const s = (base: string) => {
    const v = specs[multiModelKey(base, sizeIdx)];
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

  const dimWithout = selectedVariant?.attributes?.dimWithoutStand
    ? String(selectedVariant.attributes.dimWithoutStand)
    : selectedVariant?.attributes?.dimensions
    ? String(selectedVariant.attributes.dimensions)
    : s("Product Dimensions");
  if (dimWithout) rows.push({ icon: <Ruler size={18} />, label: "Dimensions (without stand)", text: dimWithout, accent: "bg-gray-100 text-gray-500" });

  const tvWeight = selectedVariant?.attributes?.weight
    ? String(selectedVariant.attributes.weight)
    : s("Weight");
  if (tvWeight) rows.push({ icon: <HardDrive size={18} />, label: "Weight", text: tvWeight, accent: "bg-gray-100 text-gray-500" });

  const power = s("Power Consumption");
  if (power) rows.push({ icon: <Zap size={18} />, label: "Power Consumption", text: power, accent: "bg-orange-100 text-orange-500" });

  const modelNo = selectedVariant?.attributes?.model
    ? String(selectedVariant.attributes.model)
    : "";
  if (modelNo) rows.push({ icon: <Hash size={18} />, label: "Model No.", text: modelNo, accent: "bg-[#e8f7fc] text-[#129cd3]" });

  return rows;
}

function buildCameraHighlights(specs: Record<string, unknown>, modelIdx = 0): HighlightRow[] {
  const s = (key: string) => {
    const v = specs[multiModelKey(key, modelIdx)];
    return v ? String(v).trim() : "";
  };
  const rows: HighlightRow[] = [];

  const lensMount = s("Lens Mount");
  if (lensMount) rows.push({ icon: <Camera size={18} />, label: "Lens Mount", text: lensMount, accent: "bg-blue-100 text-blue-600" });

  const aspectRatio = s("Aspect Ratio");
  if (aspectRatio) rows.push({ icon: <Monitor size={18} />, label: "Aspect Ratio", text: aspectRatio, accent: "bg-cyan-100 text-cyan-600" });

  const memCard = s("Memory Card Type");
  if (memCard) rows.push({ icon: <HardDrive size={18} />, label: "Memory Card", text: memCard, accent: "bg-purple-100 text-purple-600" });

  const connParts: string[] = [];
  if (s("Wi-Fi") === "Yes") connParts.push("Wi-Fi");
  if (s("Bluetooth") === "Yes") connParts.push("Bluetooth");
  if (s("NFC") === "Yes") connParts.push("NFC");
  const usbType = s("USB Type");
  if (usbType) connParts.push(`USB ${usbType}`);
  if (s("HDMI") === "Yes") connParts.push("HDMI");
  if (connParts.length > 0) rows.push({ icon: <Wifi size={18} />, label: "Connectivity", text: connParts.join(", "), accent: "bg-green-100 text-green-600" });

  const shutterSpeed = s("Shutter Speed");
  if (shutterSpeed) rows.push({ icon: <Zap size={18} />, label: "Shutter Speed", text: shutterSpeed, accent: "bg-yellow-100 text-yellow-600" });

  const dimParts: string[] = [];
  const w = s("Width"), d = s("Depth"), h = s("Height");
  if (w && d && h) dimParts.push(`${w} × ${d} × ${h}`);
  const wt = s("Weight");
  if (wt) dimParts.push(wt);
  if (dimParts.length > 0) rows.push({ icon: <Ruler size={18} />, label: "Dimensions", text: dimParts.join(" · "), accent: "bg-gray-100 text-gray-500" });

  return rows;
}

function buildLensHighlights(specs: Record<string, unknown>, modelIdx = 0): HighlightRow[] {
  const s = (base: string) => {
    const v = specs[lensKeyForIdx(base, modelIdx)];
    return v ? String(v).trim() : "";
  };
  const rows: HighlightRow[] = [];

  const mount = s("Lens Mount");
  if (mount) rows.push({ icon: <Camera size={18} />, label: "Compatible Mountings", text: mount, accent: "bg-blue-100 text-blue-600" });

  const focal = s("Focal Length");
  if (focal) rows.push({ icon: <Zap size={18} />, label: "Focal Length", text: focal, accent: "bg-purple-100 text-purple-600" });

  const lensType = s("Lens Type");
  if (lensType) rows.push({ icon: <Monitor size={18} />, label: "Lens Type", text: lensType, accent: "bg-cyan-100 text-cyan-600" });

  const focusType = s("Focus Type");
  if (focusType) rows.push({ icon: <Wifi size={18} />, label: "Autofocus", text: focusType, accent: "bg-green-100 text-green-600" });

  const aperture = s("Maximum Aperture");
  if (aperture) rows.push({ icon: <HardDrive size={18} />, label: "Maximum Aperture", text: aperture, accent: "bg-orange-100 text-orange-600" });

  return rows;
}

function buildSpeakerHighlights(specs: Record<string, unknown>, modelIdx = 0): HighlightRow[] {
  const s = (base: string) => {
    const v = specs[multiModelKey(base, modelIdx)];
    return v ? String(v).trim() : "";
  };
  const rows: HighlightRow[] = [];

  const bt = s("Bluetooth");
  const btVer = s("Bluetooth Version");
  const connectivity = bt === "Yes" && btVer ? `Bluetooth ${btVer}` : bt === "Yes" ? "Bluetooth" : btVer ? `Bluetooth ${btVer}` : "";
  if (connectivity) rows.push({ icon: <Wifi size={18} />, label: "Connectivity", text: connectivity, accent: "bg-blue-100 text-blue-600" });

  const power = s("Audio Output Power (RMS)");
  if (power) rows.push({ icon: <Zap size={18} />, label: "Audio Output", text: power, accent: "bg-orange-100 text-orange-600" });

  const battery = s("Battery Life");
  if (battery) rows.push({ icon: <BatteryMedium size={18} />, label: "Battery Life", text: battery, accent: "bg-green-100 text-green-600" });

  const water = s("Water Resistance Rating");
  if (water) rows.push({ icon: <HardDrive size={18} />, label: "Water Resistance", text: water, accent: "bg-cyan-100 text-cyan-600" });

  const assistant = s("Voice Assistant Support");
  if (assistant) rows.push({ icon: <Smartphone size={18} />, label: "Voice Assistant", text: assistant, accent: "bg-purple-100 text-purple-600" });

  const type = s("Speaker Type");
  if (type) rows.push({ icon: <Monitor size={18} />, label: "Speaker Type", text: type, accent: "bg-indigo-100 text-indigo-600" });

  return rows;
}

function ProductHighlights({ specs, isTv, isCamera, isLens, isSpeaker, isSmartDevice, selectedVariant, modelIdx: modelIdxProp }: { specs: Record<string, unknown>; isTv?: boolean; isCamera?: boolean; isLens?: boolean; isSpeaker?: boolean; isSmartDevice?: boolean; selectedVariant?: Variant; modelIdx?: number }) {
  const [expanded, setExpanded] = useState(true);
  const activeModelIdx = modelIdxProp !== undefined ? modelIdxProp : (isLens || isSpeaker || isCamera) ? getActiveModelIndex(specs, selectedVariant) : 0;
  const highlights = isSmartDevice
    ? buildSmartDeviceHighlights(specs, activeModelIdx)
    : isLens
    ? buildLensHighlights(specs, activeModelIdx)
    : isSpeaker
    ? buildSpeakerHighlights(specs, activeModelIdx)
    : isCamera
    ? buildCameraHighlights(specs, activeModelIdx)
    : isTv
    ? buildTvHighlights(specs, activeModelIdx, selectedVariant)
    : buildHighlights(specs);

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
