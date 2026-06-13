"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { adminApi, isApiError, s3Put } from "@/lib/api";
import { imageUrlForKey } from "@/lib/image-url";
import ProductVariantsEditor, {
  type ProductVariantsHandle,
} from "./ProductVariantsEditor";
import type {
  AdminCategoryListItem,
  AdminProduct,
  AdminProductDetail,
  CreateProductBody,
  ProductImageContentType,
  ProductStatus,
  UpdateProductBody,
} from "@/lib/api";

type Mode =
  | { kind: "create" }
  | { kind: "edit"; productId: string; initial: AdminProductDetail };

type FormState = {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  brand: string;
  hsnCode: string;
  basePrice: string;
  priceOverride: string;
  stock: string;
  status: ProductStatus;
};

// Per §7.6: contentType ∈ {jpeg, png, webp}, max 5 MB, max 20 keys per confirm.
const ALLOWED_TYPES: ProductImageContentType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 20;

// One ordered list of product images — `existing` items carry the saved S3 key,
// `pending` items carry a local File not yet uploaded. List order = display rank.
type ProductImageItem =
  | { id: string; kind: "existing"; key: string; url: string | null }
  | { id: string; kind: "pending"; file: File; previewUrl: string };

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Build the editor's image list from a product, ordered by the saved sortOrder
// (falling back to raw order when the two arrays don't line up).
function initProductImages(
  initial?: AdminProductDetail | AdminProduct,
): ProductImageItem[] {
  if (!initial || initial.images.length === 0) return [];
  const order = initial.images.map((_, i) => i);
  const sort = initial.imagesSortOrder;
  if (sort && sort.length === initial.images.length) {
    order.sort((a, b) => sort[a] - sort[b]);
  }
  return order.map((i) => {
    const key = initial.images[i];
    return { id: uid(), kind: "existing" as const, key, url: imageUrlForKey(key) };
  });
}

type SpecRow = { id: string; key: string; value: string };

// RAM/ROM/Color now live on variants, not specs — hide the legacy option arrays.
const HIDDEN_SPEC_KEYS = new Set([
  "ramOptions",
  "storageOptions",
  "colorOptions",
]);

function initSpecRows(specs?: Record<string, unknown> | null): SpecRow[] {
  if (!specs) return [];
  return Object.entries(specs)
    .filter(([k]) => !HIDDEN_SPEC_KEYS.has(k))
    .map(([k, v]) => ({
      id: uid(),
      key: k,
      value: Array.isArray(v)
        ? v.map(String).join(", ")
        : v && typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
    }));
}

// Heuristic: does this category look like phones? Walks parents too so
// "Electronics › Smartphones › Apple" still triggers.
function isPhoneCategory(
  categoryId: string,
  categories: AdminCategoryListItem[],
): boolean {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let cur = byId.get(categoryId);
  while (cur) {
    const haystack = `${cur.name} ${cur.slug}`.toLowerCase();
    if (
      haystack.includes("phone") ||
      haystack.includes("mobile") ||
      haystack.includes("smartphone")
    ) {
      return true;
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

function buildInitialForm(initial?: AdminProductDetail | AdminProduct): FormState {
  return {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    categoryId: initial?.categoryId ?? "",
    description: initial?.description ?? "",
    brand: initial?.brand ?? "",
    // Per api-integration §7.4: phones today use HSN 8517. Default for new products.
    hsnCode: initial?.hsnCode ?? (initial ? "" : "8517"),
    basePrice: initial?.basePrice != null ? String(initial.basePrice) : "",
    priceOverride:
      initial?.priceOverride != null ? String(initial.priceOverride) : "",
    stock: initial?.stock != null ? String(initial.stock) : "0",
    status: initial?.status ?? "DRAFT",
  };
}

function readableError(err: unknown): string {
  if (!isApiError(err)) return "Couldn't save the product. Please try again.";
  switch (err.code) {
    case "CATEGORY_NOT_FOUND":
      return "The selected category no longer exists. Refresh the list and pick another.";
    case "PRODUCT_SLUG_TAKEN":
      return "That slug is already used by another product. Pick a different one or leave it blank to auto-generate.";
    case "HSN_REQUIRED_FOR_ACTIVE":
      return "HSN code is required when publishing. Add it before clicking Publish.";
    case "INVALID_OBJECT_KEY":
      return "An uploaded image's key didn't match this product. Retry from the product editor.";
    case "SORT_ORDER_LENGTH_MISMATCH":
      return "Image sort order doesn't match the upload list. Try again.";
    default:
      return err.displayMessage || "Couldn't save the product.";
  }
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProductForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : undefined;

  const [form, setForm] = useState<FormState>(buildInitialForm(initial));
  const [categories, setCategories] = useState<AdminCategoryListItem[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catsError, setCatsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<null | ProductStatus>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Image state (existing + pending, one ordered list = display rank) ────
  const [images, setImages] = useState<ProductImageItem[]>(() =>
    initProductImages(initial),
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Scrape-from-URL state (create mode) ─────────────────────────────────
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeNote, setScrapeNote] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);
  const [scrapedImages, setScrapedImages] = useState<
    { url: string; selected: boolean }[]
  >([]);

  // Free-form specifications (key/value) → product.specs.
  const [specRows, setSpecRows] = useState<SpecRow[]>(() =>
    initSpecRows(initial?.specs),
  );
  const variantsRef = useRef<ProductVariantsHandle | null>(null);

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      setImages((curr) => {
        for (const it of curr) {
          if (it.kind === "pending") URL.revokeObjectURL(it.previewUrl);
        }
        return curr;
      });
    };
  }, []);

  // Fetch the live category list for the dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      setCatsError(null);
      try {
        const list = await adminApi.listCategories();
        if (cancelled) return;
        setCategories(list);
        if (mode.kind === "create" && list.length > 0) {
          setForm((f) => (f.categoryId ? f : { ...f, categoryId: list[0].id }));
        }
      } catch (err) {
        if (cancelled) return;
        setCatsError(
          isApiError(err)
            ? err.displayMessage
            : "Couldn't load categories. Refresh and try again.",
        );
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode.kind]);

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const noCategories = !loadingCats && categories.length === 0;

  const categoryLabel = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (c: AdminCategoryListItem): string => {
      const chain: string[] = [c.name];
      let cur: AdminCategoryListItem | undefined = c;
      while (cur?.parentId) {
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        chain.unshift(parent.name);
        cur = parent;
      }
      return chain.join(" › ");
    };
  }, [categories]);

  const selectedScrapedCount = scrapedImages.filter((i) => i.selected).length;
  const totalImageCount = images.length + selectedScrapedCount;
  const remainingSlots = Math.max(0, MAX_IMAGES - totalImageCount);

  const onPickFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImageError(null);

      const accepted: ProductImageItem[] = [];
      const rejections: string[] = [];

      let slotsLeft = remainingSlots;
      for (const file of Array.from(files)) {
        if (slotsLeft <= 0) {
          rejections.push(`Skipped "${file.name}" — limit is ${MAX_IMAGES} images per product.`);
          continue;
        }
        if (!ALLOWED_TYPES.includes(file.type as ProductImageContentType)) {
          rejections.push(`"${file.name}" is not a JPEG, PNG, or WEBP.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          rejections.push(`"${file.name}" is ${fileSizeLabel(file.size)} (max 5 MB).`);
          continue;
        }
        accepted.push({
          id: uid(),
          kind: "pending",
          file,
          previewUrl: URL.createObjectURL(file),
        });
        slotsLeft -= 1;
      }

      if (accepted.length > 0) {
        setImages((curr) => [...curr, ...accepted]);
      }
      if (rejections.length > 0) {
        setImageError(rejections.join("\n"));
      }
      // Reset the file input so picking the same file twice still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [remainingSlots],
  );

  const removeImage = (id: string) => {
    setImages((curr) => {
      const removed = curr.find((it) => it.id === id);
      if (removed?.kind === "pending") URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((it) => it.id !== id);
    });
  };

  // Move an image one slot earlier (dir -1) or later (dir +1) — its display rank.
  const moveImage = (id: string, dir: -1 | 1) => {
    setImages((curr) => {
      const i = curr.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= curr.length) return curr;
      const next = [...curr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toggleScraped = (url: string) => {
    setImageError(null);
    const target = scrapedImages.find((i) => i.url === url);
    if (!target) return;
    if (!target.selected && totalImageCount >= MAX_IMAGES) {
      setImageError(`Limit is ${MAX_IMAGES} images per product.`);
      return;
    }
    setScrapedImages((curr) =>
      curr.map((i) => (i.url === url ? { ...i, selected: !i.selected } : i)),
    );
  };

  // Scrape a product page and pre-fill the form. Best-effort: fills only the
  // fields the page actually exposed; the admin reviews everything before save.
  const runScrape = async () => {
    const url = scrapeUrl.trim();
    if (!url) return;
    setScrapeNote(null);
    setScraping(true);
    try {
      const data = await adminApi.scrapeProduct({ url });
      const filled: string[] = [];

      const patch: Partial<FormState> = {};
      if (data.name) {
        patch.name = data.name;
        filled.push("name");
      }
      if (data.description) {
        patch.description = data.description.slice(0, 10_000);
        filled.push("description");
      }
      if (data.brand) {
        patch.brand = data.brand;
        filled.push("brand");
      }
      if (data.basePrice != null) {
        patch.basePrice = String(data.basePrice);
        filled.push("price");
      }
      if (Object.keys(patch).length > 0) setForm((f) => ({ ...f, ...patch }));

      const specEntries = Object.entries(data.specs ?? {});
      if (specEntries.length > 0) {
        setSpecRows(
          specEntries.map(([k, v]) => ({ id: uid(), key: k, value: v })),
        );
        filled.push(
          `${specEntries.length} spec${specEntries.length === 1 ? "" : "s"}`,
        );
      }

      // Default-select images only up to the remaining slot budget.
      const free = Math.max(0, MAX_IMAGES - images.length);
      setScrapedImages(
        data.imageUrls.map((u, idx) => ({ url: u, selected: idx < free })),
      );
      if (data.imageUrls.length > 0) {
        filled.push(
          `${data.imageUrls.length} image${data.imageUrls.length === 1 ? "" : "s"}`,
        );
      }

      setScrapeNote(
        filled.length === 0
          ? {
              kind: "error",
              text: "Couldn't extract anything from that page — it may block bots or load content dynamically. Fill the form manually.",
            }
          : {
              kind: "info",
              text: `Imported ${filled.join(", ")}. Review and edit before saving.`,
            },
      );
    } catch (err) {
      setScrapeNote({
        kind: "error",
        text: isApiError(err)
          ? err.displayMessage
          : "Couldn't scrape that URL. Fill the form manually.",
      });
    } finally {
      setScraping(false);
    }
  };

  const buildBody = (
    status: ProductStatus,
  ): CreateProductBody | { error: string } => {
    const name = form.name.trim();
    if (!name) return { error: "Product name is required." };
    if (!form.categoryId) return { error: "Pick a category." };

    const description = form.description;
    if (description.length > 10_000) {
      return { error: "Description must be 10,000 characters or fewer." };
    }

    const basePriceNum = Number(form.basePrice);
    if (
      form.basePrice.trim() === "" ||
      Number.isNaN(basePriceNum) ||
      basePriceNum < 0
    ) {
      return { error: "Base price must be a number ≥ 0 (in rupees)." };
    }

    // Optional selling price for products with no variants; null clears it.
    let priceOverride: number | null = null;
    if (form.priceOverride.trim() !== "") {
      const n = Number(form.priceOverride);
      if (Number.isNaN(n) || n < 0) {
        return { error: "Selling price must be a number ≥ 0 (in rupees)." };
      }
      if (n > basePriceNum) {
        return { error: "Selling price can't be more than the base price (MRP)." };
      }
      priceOverride = n;
    }

    const stockNum = form.stock.trim() === "" ? 0 : Number(form.stock);
    if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
      return { error: "Stock must be a whole number ≥ 0." };
    }

    // Free-form specs from the editor (authoritative — empty clears existing).
    const specs: Record<string, unknown> = {};
    for (const r of specRows) {
      const key = r.key.trim();
      if (key) specs[key] = r.value;
    }

    if (status === "ACTIVE" && !form.hsnCode.trim()) {
      return {
        error:
          "HSN code is required when publishing. Add it before clicking Publish.",
      };
    }

    const body: CreateProductBody = {
      name,
      categoryId: form.categoryId,
      description,
      basePrice: basePriceNum,
      priceOverride,
      stock: stockNum,
      status,
    };
    if (form.slug.trim()) body.slug = form.slug.trim();
    if (form.brand.trim()) body.brand = form.brand.trim();
    if (form.hsnCode.trim()) body.hsnCode = form.hsnCode.trim();
    body.specs = specs;
    return body;
  };

  // Persist the product image list: upload any pending files in order, then
  // confirm the full ordered key list (replace=true) so removals and ranking
  // stick. Returns true on success.
  const commitProductImages = async (productId: string): Promise<boolean> => {
    if (images.length === 0) return true; // nothing to persist
    const total = images.filter((it) => it.kind === "pending").length;
    let uploaded = 0;
    if (total > 0) setUploadProgress({ current: 0, total });
    const orderedKeys: string[] = [];
    try {
      for (const item of images) {
        if (item.kind === "existing") {
          orderedKeys.push(item.key);
          continue;
        }
        uploaded += 1;
        setUploadProgress({ current: uploaded, total });
        const presigned = await adminApi.presignProductImage(productId, {
          contentType: item.file.type as ProductImageContentType,
          contentLength: item.file.size,
        });
        await s3Put(presigned.uploadUrl, item.file);
        orderedKeys.push(presigned.objectKey);
      }
      // Replace the whole list so reorders and removals are saved, not just appends.
      await adminApi.confirmProductImages(productId, {
        objectKeys: orderedKeys,
        sortOrder: orderedKeys.map((_, i) => i),
        replace: true,
      });
      return true;
    } catch (err) {
      setErrorMsg(readableError(err));
      return false;
    } finally {
      setUploadProgress(null);
    }
  };

  // Re-host selected scraped image URLs server-side. Returns true on success.
  const importScrapedImages = async (productId: string): Promise<boolean> => {
    const urls = scrapedImages.filter((i) => i.selected).map((i) => i.url);
    if (urls.length === 0) return true;
    try {
      await adminApi.importProductImages(productId, { imageUrls: urls });
      return true;
    } catch (err) {
      setErrorMsg(readableError(err));
      return false;
    }
  };

  const submit = async (status: ProductStatus) => {
    setErrorMsg(null);
    const built = buildBody(status);
    if ("error" in built) {
      setErrorMsg(built.error);
      return;
    }
    const variantError = variantsRef.current?.validate();
    if (variantError) {
      setErrorMsg(variantError);
      return;
    }
    setSubmitting(status);
    try {
      let productId: string;
      if (mode.kind === "create") {
        const created = await adminApi.createProduct(built);
        productId = created.id;
      } else {
        await adminApi.updateProduct(mode.productId, built as UpdateProductBody);
        productId = mode.productId;
      }

      const imagesOk = await commitProductImages(productId);
      const scrapedOk = imagesOk && (await importScrapedImages(productId));
      if (!imagesOk || !scrapedOk) {
        // The product itself saved fine — keep the image list on screen so the
        // admin can fix it and click Save again (a retry is safe/idempotent).
        setErrorMsg(
          (errorMsg ?? "") +
            "\nThe product was saved, but the images failed. Adjust them and click Save again.",
        );
        // Clear scraped picks so a retry doesn't re-import duplicates.
        setScrapedImages([]);
        return;
      }

      // Sync variants (phone categories / products that already have variants).
      if (variantsRef.current) {
        try {
          await variantsRef.current.commit(productId);
        } catch (err) {
          setErrorMsg(
            readableError(err) +
              "\nThe product saved, but variants failed to save. Edit the product to retry.",
          );
          return;
        }
      }

      router.replace("/admin/products");
      router.refresh();
    } catch (err) {
      setErrorMsg(readableError(err));
    } finally {
      setSubmitting(null);
    }
  };

  const busy = submitting !== null;
  const isEdit = mode.kind === "edit";
  const currentStatus = isEdit ? mode.initial.status : "DRAFT";
  const atImageLimit = totalImageCount >= MAX_IMAGES;

  // Show the variant editor for phone-like categories, or whenever an existing
  // product already has variants (so they stay editable regardless of category).
  const showVariants = useMemo(
    () =>
      isPhoneCategory(form.categoryId, categories) ||
      (mode.kind === "edit" && mode.initial.variants.length > 0),
    [form.categoryId, categories, mode],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#129cd3]"
        >
          <ChevronLeft size={14} /> Back to products
        </Link>

        <div className="flex items-center gap-2">
          {uploadProgress && (
            <span className="text-xs text-gray-500">
              Uploading image {uploadProgress.current}/{uploadProgress.total}…
            </span>
          )}
          <button
            type="button"
            onClick={() => submit("DRAFT")}
            disabled={busy}
            className="inline-flex items-center gap-2 text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-60"
          >
            {submitting === "DRAFT" && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {isEdit && currentStatus === "ACTIVE" ? "Unpublish to draft" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => submit("ACTIVE")}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {submitting === "ACTIVE" && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {isEdit && currentStatus === "ACTIVE" ? "Save changes" : "Publish"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4 whitespace-pre-line">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {mode.kind === "create" && (
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">
                  Import from URL
                </h3>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Paste a product page link to auto-fill details and images.
                  Always review before saving — retail sites may block scraping.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runScrape();
                    }
                  }}
                  placeholder="https://www.example.com/product/…"
                  disabled={scraping || busy}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => void runScrape()}
                  disabled={scraping || busy || !scrapeUrl.trim()}
                  className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
                >
                  {scraping ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  Import
                </button>
              </div>
              {scrapeNote && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-line ${
                    scrapeNote.kind === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-gray-100 bg-gray-50 text-gray-600"
                  }`}
                >
                  {scrapeNote.text}
                </div>
              )}
            </section>
          )}

          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm">Basic Information</h3>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Product name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="e.g. iPhone 15 Pro Max"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Slug
              </label>
              <input
                value={form.slug}
                onChange={(e) => onChange("slug", e.target.value)}
                placeholder="auto-generated from name if empty (kebab-case, globally unique)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Description
              </label>
              <textarea
                rows={6}
                value={form.description}
                onChange={(e) =>
                  onChange("description", e.target.value.slice(0, 10_000))
                }
                placeholder="Describe key features, specs and what makes this product great…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Up to 10,000 characters. (
                {form.description.length.toLocaleString("en-IN")}/10,000)
              </p>
            </div>
          </section>

          {/* ── Images ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Product Images</h3>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  JPEG, PNG, or WEBP. Up to 5&nbsp;MB each, max {MAX_IMAGES}{" "}
                  images per product.
                </p>
              </div>
              <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {totalImageCount}/{MAX_IMAGES}
              </span>
            </div>

            {imageError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-line">
                {imageError}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label
                className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  atImageLimit
                    ? "border-gray-100 text-gray-300 cursor-not-allowed"
                    : "border-gray-200 text-gray-400 hover:border-[#129cd3] hover:text-[#129cd3]"
                }`}
              >
                <ImagePlus size={20} />
                <span className="text-[11px] mt-1.5 font-semibold">
                  {atImageLimit ? "Limit reached" : "Add images"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  multiple
                  className="hidden"
                  disabled={atImageLimit || busy}
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </label>

              {images.map((it, idx) => {
                const src = it.kind === "existing" ? it.url : it.previewUrl;
                // Backend can't store an empty image list, so block removing the
                // last one when editing an existing product.
                const canRemove = mode.kind === "create" || images.length > 1;
                return (
                  <div
                    key={it.id}
                    className="aspect-square relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100 group"
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={it.kind === "pending" ? it.file.name : `Image ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-400">
                        saved
                      </div>
                    )}
                    <span className="absolute top-1.5 left-1.5 min-w-[22px] h-6 px-1.5 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeImage(it.id)}
                      disabled={busy || !canRemove}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-gray-600 hover:text-red-500 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                      aria-label="Remove image"
                      title={canRemove ? "Remove image" : "At least one image is required"}
                    >
                      <X size={14} />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => moveImage(it.id, -1)}
                        disabled={busy || idx === 0}
                        className="w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-[#129cd3] shadow flex items-center justify-center disabled:opacity-30"
                        aria-label="Move earlier"
                        title="Move earlier"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(it.id, 1)}
                        disabled={busy || idx === images.length - 1}
                        className="w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-[#129cd3] shadow flex items-center justify-center disabled:opacity-30"
                        aria-label="Move later"
                        title="Move later"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {scrapedImages.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[12px] font-semibold text-gray-600">
                  From URL — tap to include or exclude ({selectedScrapedCount}{" "}
                  selected)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {scrapedImages.map((img) => (
                    <button
                      type="button"
                      key={img.url}
                      onClick={() => toggleScraped(img.url)}
                      disabled={busy}
                      title={img.selected ? "Click to exclude" : "Click to include"}
                      className={`aspect-square relative rounded-lg overflow-hidden bg-gray-50 border transition-all disabled:cursor-not-allowed ${
                        img.selected
                          ? "border-[#129cd3] ring-2 ring-[#129cd3]/30"
                          : "border-gray-200 opacity-50 hover:opacity-80"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow ${
                          img.selected
                            ? "bg-[#129cd3] text-white"
                            : "bg-white/90 text-transparent"
                        }`}
                      >
                        <Check size={13} />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">
                  Selected images are downloaded and re-hosted to S3 when you save.
                </p>
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Image #1 is the main photo. Use the arrows to reorder and ✕ to
              remove — changes save when you click Save.
            </p>
          </section>

          {/* ── Specifications (free-form key/value) ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Specifications</h3>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Key/value details shown on the product page (e.g. Display, Battery,
                Processor). RAM, ROM and Color are set per variant below.
              </p>
            </div>
            <SpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm">Pricing &amp; Inventory</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  Base price (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.basePrice}
                  onChange={(e) => onChange("basePrice", e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  MRP, shown struck-through. Up to 2 decimals.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  Selling price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.priceOverride}
                  onChange={(e) => onChange("priceOverride", e.target.value)}
                  placeholder="Same as base"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Optional. Blank = sell at base price. Variants set their own.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  Stock
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.stock}
                  onChange={(e) => onChange("stock", e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
                />
              </div>
            </div>
          </section>

          {showVariants && (
            <ProductVariantsEditor
              ref={variantsRef}
              productName={form.name}
              initialVariants={isEdit ? mode.initial.variants : []}
              disabled={busy}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm">Organization</h3>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.categoryId}
                onChange={(e) => onChange("categoryId", e.target.value)}
                disabled={loadingCats || noCategories}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {loadingCats && <option>Loading…</option>}
                {!loadingCats && noCategories && (
                  <option value="">No categories yet</option>
                )}
                {!loadingCats &&
                  !noCategories &&
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(c)}
                    </option>
                  ))}
              </select>
              {catsError && (
                <p className="text-[11px] text-red-600 mt-1">{catsError}</p>
              )}
              {noCategories && (
                <p className="text-[11px] text-gray-500 mt-1">
                  <Link
                    href="/admin/categories/add"
                    className="text-[#129cd3] hover:underline font-semibold"
                  >
                    Create a category
                  </Link>{" "}
                  first.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Brand
              </label>
              <input
                value={form.brand}
                onChange={(e) => onChange("brand", e.target.value)}
                placeholder="e.g. Apple"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                HSN code
              </label>
              <input
                value={form.hsnCode}
                onChange={(e) => onChange("hsnCode", e.target.value)}
                placeholder="e.g. 8517"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Required when publishing (status = ACTIVE).
              </p>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">Status</h3>
            {isEdit ? (
              <p className="text-[12px] text-gray-500">
                Currently:{" "}
                <span className="font-semibold text-gray-700">
                  {currentStatus}
                </span>
                . Use the buttons above to switch between draft and active.
                Archive from the products listing.
              </p>
            ) : (
              <p className="text-[12px] text-gray-500">
                Use <span className="font-semibold">Save draft</span> to keep
                this product hidden, or{" "}
                <span className="font-semibold">Publish</span> to make it
                ACTIVE.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const update = (id: string, patch: Partial<SpecRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { id: uid(), key: "", value: "" }]);
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-[12px] text-gray-400">No specifications yet.</p>
      )}
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center"
        >
          <input
            value={r.key}
            onChange={(e) => update(r.id, { key: e.target.value })}
            placeholder="e.g. Display"
            disabled={disabled}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
          />
          <input
            value={r.value}
            onChange={(e) => update(r.id, { value: e.target.value })}
            placeholder="e.g. 6.8-inch AMOLED, 120Hz"
            disabled={disabled}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
          />
          <button
            type="button"
            onClick={() => remove(r.id)}
            disabled={disabled}
            className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-40"
            aria-label="Remove specification"
            title="Remove specification"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
      >
        <Plus size={14} /> Add specification
      </button>
    </div>
  );
}
