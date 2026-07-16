"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { removeBackground } from "@imgly/background-removal";
import ReactCrop, {
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
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
import CouponAttachments from "./CouponAttachments";
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
  | { kind: "create"; initialCategoryId?: string }
  | { kind: "edit"; productId: string; initial: AdminProductDetail };

// ── Draft auto-save (create mode only) ───────────────────────────────────────
const DRAFT_KEY = "cpc-admin-product-draft";

type DraftPayload = {
  form: FormState;
  specRows: { key: string; value: string }[];
  variantRows: unknown[];
  pendingImageNames: string[]; // filenames of pending (not-yet-uploaded) images for reminder
  savedAt: number; // Date.now()
};

function loadDraft(key: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

function saveDraft(key: string, payload: DraftPayload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch { /* storage full or disabled */ }
}

function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Converts any string to a SEO-friendly kebab-case slug. */
function toKebab(s: string) {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function draftAge(savedAt: number): string {
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

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

/** Extracts the cropped area from an img element into a canvas. */
function getCroppedCanvas(
  img: HTMLImageElement,
  crop: PixelCrop,
): HTMLCanvasElement {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    img,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Strips the background from an image using an in-browser AI model. */
async function stripBackground(file: File): Promise<File> {
  // "isnet" is the highest-accuracy model — better at keeping complex subjects
  // (e.g. a TV whose screen shows a realistic scene) intact.
  const blob = await removeBackground(file, { model: "isnet" });
  const name = file.name.replace(/\.[^.]+$/, ".png");
  return new File([blob], name, { type: "image/png" });
}

/** Converts any accepted image to PNG via an offscreen canvas. */
function convertToPng(file: File): Promise<File> {
  if (file.type === "image/png") return Promise.resolve(file);
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("PNG conversion failed")); return; }
        const name = file.name.replace(/\.[^.]+$/, ".png");
        resolve(new File([blob], name, { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Load failed")); };
    img.src = url;
  });
}

/** Fetches a remote image URL and returns it as a File object. */
async function fetchUrlAsFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const mime = blob.type || "image/jpeg";
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return new File([blob], `scraped.${ext}`, { type: mime });
}

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
// function isPhoneCategory(
//   categoryId: string,
//   categories: AdminCategoryListItem[],
// ): boolean {
//   const byId = new Map(categories.map((c) => [c.id, c]));
//   let cur = byId.get(categoryId);
//   while (cur) {
//     const haystack = `${cur.name} ${cur.slug}`.toLowerCase();
//     if (
//       haystack.includes("phone") ||
//       haystack.includes("mobile") ||
//       haystack.includes("smartphone")
//     ) {
//       return true;
//     }
//     cur = cur.parentId ? byId.get(cur.parentId) : undefined;
//   }
//   return false;
// }

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
  // Per-page draft key: create mode shares one key; edit mode is per product.
  const draftKey = mode.kind === "create" ? DRAFT_KEY : `${DRAFT_KEY}-edit-${mode.productId}`;

  const [form, setForm] = useState<FormState>(buildInitialForm(initial));
  // Track whether the user has manually edited the slug field.
  // In edit mode the product already has a slug, so we lock auto-generation immediately.
  const slugEditedRef = useRef(mode.kind === "edit" && !!initial?.slug);
  const [categories, setCategories] = useState<AdminCategoryListItem[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catsError, setCatsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<null | ProductStatus>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Set after first save in create mode — reveals CouponAttachments inline.
  const [createdId, setCreatedId] = useState<string | null>(null);

  // ── Image state (existing + pending, one ordered list = display rank) ────
  const [images, setImages] = useState<ProductImageItem[]>(() =>
    initProductImages(initial),
  );
  const [, setImageError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | null
  >(null);
  const [processingCount, setProcessingCount] = useState(0);
  const autoRemoveBg = true;
  // Crop-modal queue: files validated but not yet cropped/processed.
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropModal, setCropModal] = useState<{ src: string; file: File } | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
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
  const couponSectionRef = useRef<HTMLDivElement>(null);

  // ── Draft auto-save (create mode only) ────────────────────────────────────
  // Load draft once on mount via lazy initialiser — avoids setState-in-effect lint error.
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(() => {
    const draft = loadDraft(draftKey);
    if (!draft) return null;
    // For create mode, skip truly empty drafts (nothing meaningful entered yet).
    if (mode.kind === "create") {
      const hasContent =
        !!draft.form.name ||
        !!draft.form.description ||
        draft.specRows.some((r) => r.value?.trim()) ||
        draft.variantRows.length > 0;
      if (!hasContent) return null;
    }
    return draft;
  });
  // Draft variant rows passed directly to the editor as an initialisation prop.
  // Set on restore, cleared after 3 s so future category changes start fresh.
  const [draftInitRows, setDraftInitRows] = useState<unknown[] | null>(null);
  // Incremented on each restore to force the editor to remount and pick up draftInitRows.
  const [restoreKey, setRestoreKey] = useState(0);

  // Auto-save whenever form, specRows, or images change (debounced 1 s).
  useEffect(() => {
    const id = setTimeout(() => {
      saveDraft(draftKey, {
        form,
        specRows: specRows.map(({ key, value }) => ({ key, value })),
        variantRows: variantsRef.current?.getRows() ?? [],
        pendingImageNames: images
          .filter((i) => i.kind === "pending")
          .map((i) => (i as Extract<typeof i, { kind: "pending" }>).file.name),
        savedAt: Date.now(),
      });
    }, 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, specRows, images]);

  // Also save variant rows every 5 s (covers variant-only changes between form saves).
  useEffect(() => {
    const id = setInterval(() => {
      saveDraft(draftKey, {
        form,
        specRows: specRows.map(({ key, value }) => ({ key, value })),
        variantRows: variantsRef.current?.getRows() ?? [],
        pendingImageNames: images
          .filter((i) => i.kind === "pending")
          .map((i) => (i as Extract<typeof i, { kind: "pending" }>).file.name),
        savedAt: Date.now(),
      });
    }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, specRows, images]);

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
          const preselect = mode.initialCategoryId ?? list[0].id;
          setForm((f) => (f.categoryId ? f : { ...f, categoryId: preselect }));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind]);

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (key === "slug") {
      // If user clears the slug, resume auto-generation; otherwise lock it.
      slugEditedRef.current = (value as string).length > 0;
      setForm((f) => ({ ...f, slug: value as string }));
    } else if (key === "name" && !slugEditedRef.current) {
      // Auto-generate slug from name while the user hasn't manually set one.
      setForm((f) => ({ ...f, name: value as string, slug: toKebab(value as string) }));
    } else {
      setForm((f) => ({ ...f, [key]: value }));
    }
  };

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

  const catPlaceholders = useMemo(() => {
    const cat = categories.find((c) => c.id === form.categoryId);
    const slug = cat?.slug?.toLowerCase() ?? "";
    const name = cat?.name?.toLowerCase() ?? "";
    const isPhone   = slug.includes("phone")    || name.includes("phone");
    const isTv      = slug.includes("tv")       || name.includes("tv")       || name.includes("television");
    const isLens    = slug.includes("lens")      || name.includes("lens");
    const isCamera  = !isLens && (slug.includes("camera") || name.includes("camera"));
    const isSpeaker      = slug.includes("speaker")  || name.includes("speaker");
    const isSmartDevice  = !isTv && (slug.includes("smart") || name.includes("smart"));
    if (isPhone)        return { productName: "e.g. Samsung Galaxy S24 Ultra", slugHint: "e.g. samsung-galaxy-s24-ultra", brand: "e.g. Apple, Samsung, OnePlus" };
    if (isTv)           return { productName: 'e.g. Samsung 55" 4K QLED Smart TV', slugHint: "e.g. samsung-55-4k-qled-smart-tv", brand: "e.g. Samsung, LG, Sony" };
    if (isLens)         return { productName: "e.g. Sony FE 200-600mm F5.6-6.3 G OSS", slugHint: "e.g. sony-fe-200-600mm-f5-6", brand: "e.g. Sony, Canon, Sigma" };
    if (isCamera)       return { productName: "e.g. Sony Alpha A7 IV Mirrorless Camera", slugHint: "e.g. sony-alpha-a7-iv", brand: "e.g. Sony, Canon, Nikon" };
    if (isSpeaker)      return { productName: "e.g. JBL Charge 5 Portable Bluetooth Speaker", slugHint: "e.g. jbl-charge-5", brand: "e.g. JBL, Sony, Bose" };
    if (isSmartDevice)  return { productName: "e.g. Amazon Echo Dot (5th Gen)", slugHint: "e.g. amazon-echo-dot-5th-gen", brand: "e.g. Amazon, Google, Apple" };
    return { productName: "e.g. Product Name", slugHint: "e.g. product-name", brand: "e.g. Brand Name" };
  }, [categories, form.categoryId]);

  const selectedScrapedCount = scrapedImages.filter((i) => i.selected).length;
  const totalImageCount = images.length + selectedScrapedCount;
  const remainingSlots = Math.max(0, MAX_IMAGES - totalImageCount);

  // Open crop modal for the next file in the queue whenever the modal is idle.
  useEffect(() => {
    if (cropQueue.length === 0 || cropModal) return;
    const file = cropQueue[0];
    const src = URL.createObjectURL(file);
    // Batch all three state updates into a single scheduler tick via a
    // microtask so the linter's set-state-in-effect rule is satisfied.
    Promise.resolve().then(() => {
      setCropModal({ src, file });
      setCrop(undefined);
      setCompletedCrop(null);
    });
  }, [cropQueue, cropModal]);

  // Convert → (optionally) bg-remove → add one file to the images list.
  const processAndAdd = useCallback(async (file: File, removeBg: boolean) => {
    setProcessingCount((c) => c + 1);
    let pngFile = file;
    if (file.type !== "image/png") {
      try { pngFile = await convertToPng(file); } catch { /* keep original */ }
    }
    let finalFile = pngFile;
    if (removeBg) {
      try { finalFile = await stripBackground(pngFile); } catch { /* keep png */ }
    }
    setImages((curr) => [
      ...curr,
      { id: uid(), kind: "pending", file: finalFile, previewUrl: URL.createObjectURL(finalFile) },
    ]);
    setProcessingCount((c) => c - 1);
  }, []);

  // Move the crop queue forward and close the modal.
  const advanceCrop = useCallback(() => {
    setCropModal((m) => { if (m) URL.revokeObjectURL(m.src); return null; });
    setCropQueue((q) => q.slice(1));
  }, []);

  const handleCropApply = useCallback(() => {
    const img = cropImgRef.current;
    if (!img || !completedCrop || completedCrop.width === 0) {
      const file = cropModal!.file;
      advanceCrop();
      processAndAdd(file, autoRemoveBg);
      return;
    }
    const canvas = getCroppedCanvas(img, completedCrop);
    const origName = cropModal!.file.name;
    canvas.toBlob((blob) => {
      if (!blob) { advanceCrop(); processAndAdd(cropModal!.file, autoRemoveBg); return; }
      const cropped = new File([blob], origName.replace(/\.[^.]+$/, ".png"), { type: "image/png" });
      advanceCrop();
      processAndAdd(cropped, autoRemoveBg);
    }, "image/png");
  }, [completedCrop, cropModal, advanceCrop, processAndAdd, autoRemoveBg]);

  const handleCropSkip = useCallback(() => {
    const file = cropModal!.file;
    advanceCrop();
    processAndAdd(file, autoRemoveBg);
  }, [cropModal, advanceCrop, processAndAdd, autoRemoveBg]);

  // Validate files and push them into the crop queue.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _onPickFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImageError(null);
      const valid: File[] = [];
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
        valid.push(file);
        slotsLeft -= 1;
      }
      if (rejections.length > 0) setImageError(rejections.join("\n"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (valid.length > 0) setCropQueue((q) => [...q, ...valid]);
    },
    [remainingSlots],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _removeImage = (id: string) => {
    setImages((curr) => {
      const removed = curr.find((it) => it.id === id);
      if (removed?.kind === "pending") URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((it) => it.id !== id);
    });
  };

  // Move an image one slot earlier (dir -1) or later (dir +1) — its display rank.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _moveImage = (id: string, dir: -1 | 1) => {
    setImages((curr) => {
      const i = curr.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= curr.length) return curr;
      const next = [...curr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // Move any image to position 0 (makes it the main/display photo).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _setAsMain = (id: string) => {
    setImages((curr) => {
      const i = curr.findIndex((it) => it.id === id);
      if (i <= 0) return curr;
      const next = [...curr];
      const [item] = next.splice(i, 1);
      next.unshift(item);
      return next;
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _toggleScraped = (url: string) => {
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
    const _bCatSlug = categories.find((c) => c.id === form.categoryId)?.slug?.toLowerCase() ?? "";
    const _bCatName = categories.find((c) => c.id === form.categoryId)?.name?.toLowerCase() ?? "";
    const _bIsLens    = _bCatSlug.includes("lens") || _bCatName.includes("lens");
    const _bIsSpeaker     = _bCatSlug.includes("speaker") || _bCatName.includes("speaker");
    const _bIsTv          = _bCatSlug.includes("tv") || _bCatName.includes("tv") || _bCatName.includes("television");
    const _bIsSmartDevice = !_bIsTv && (_bCatSlug.includes("smart") || _bCatName.includes("smart"));
    const _bIsCamera      = !_bIsLens && (_bCatSlug.includes("camera") || _bCatName.includes("camera"));
    const _bNameOptional  = _bIsLens || _bIsSpeaker || _bIsTv || _bIsSmartDevice || _bIsCamera;
    // For smart devices, cameras and TVs the name comes from the first model/size "Product Name" spec row.
    const _sdName = (_bIsSmartDevice || _bIsCamera || _bIsTv)
      ? (specRows.find((r) => r.key === "Product Name")?.value ?? "").trim()
      : "";
    // For lens products, derive name from first variant's model (ram field) if product name is blank.
    const _lensName = _bIsLens
      ? ((variantsRef.current?.getRows() as { ram?: string }[])?.[0]?.ram ?? "").trim()
      : "";
    const name = form.name.trim() || _sdName || _lensName;
    if (!name && !_bNameOptional) return { error: "Product name is required." };
    if (_bIsSmartDevice && !name) return { error: "Enter a Product Name for at least the first model in the Specifications section." };
    if (_bIsTv && !name) return { error: "Enter a Product Name for at least the first screen size in the Specifications section." };
    if (!form.categoryId) return { error: "Pick a category." };

    const description = form.description;
    if (description.length > 10_000) {
      return { error: "Description must be 10,000 characters or fewer." };
    }

    const hasVariants = variantsRef.current?.hasRows() ?? false;
    const minVariantPrice = hasVariants ? (variantsRef.current?.getMinSellingPrice() ?? 0) : 0;
    const basePriceNum =
      form.basePrice.trim() === "" && hasVariants
        ? minVariantPrice
        : Number(form.basePrice);
    if (
      (!hasVariants && form.basePrice.trim() === "") ||
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
    // "Slug" / "Slug 2" / "Slug 3" spec keys are per-model slugs.
    // Drop empty ones; convert non-empty ones to kebab to satisfy backend validation.
    const slugKeyRe = /^Slug(\s\d+)?$/;
    const specs: Record<string, unknown> = {};
    for (const r of specRows) {
      const key = r.key.trim();
      if (!key) continue;
      if (slugKeyRe.test(key)) {
        // Always omit if empty; otherwise force to kebab-case.
        const val = r.value.trim();
        if (!val) continue;
        const kebab = toKebab(val);
        if (kebab) specs[key] = kebab;
        // If toKebab produces empty (all special chars), skip entirely.
      } else {
        specs[key] = r.value;
      }
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
    // Always send a pre-computed kebab slug so the backend never tries to
    // auto-generate from a name that may contain special/Unicode chars.
    // Prefer the user's explicit slug; fall back to generating from product name.
    const _computedSlug = toKebab(form.slug.trim()) || toKebab(name);
    if (_computedSlug) body.slug = _computedSlug;
    if (form.brand.trim()) body.brand = form.brand.trim();
    if (form.hsnCode.trim()) body.hsnCode = form.hsnCode.trim();
    body.specs = specs;
    return body;
  };

  // Persist the product image list: upload any pending files in order, then
  // confirm the full ordered key list (replace=true) so removals and ranking
  // stick. `extra` items (processed scraped images) are appended after the
  // manually-picked list. Returns true on success.
  const commitProductImages = async (
    productId: string,
    extra: ProductImageItem[] = [],
  ): Promise<boolean> => {
    const allImages = [...images, ...extra];
    if (allImages.length === 0) return true; // nothing to persist
    const total = allImages.filter((it) => it.kind === "pending").length;
    let uploaded = 0;
    if (total > 0) setUploadProgress({ current: 0, total });
    const orderedKeys: string[] = [];
    try {
      for (const item of allImages) {
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

  // Fetch, convert to PNG, and optionally strip backgrounds from selected
  // scraped image URLs — entirely client-side so the same pipeline as
  // manually-picked files is applied. Returns processed ProductImageItems.
  const processScrapedImages = async (): Promise<ProductImageItem[]> => {
    const selected = scrapedImages.filter((i) => i.selected);
    if (selected.length === 0) return [];
    const results: ProductImageItem[] = [];
    for (const img of selected) {
      try {
        const rawFile = await fetchUrlAsFile(img.url);
        let pngFile: File;
        try { pngFile = await convertToPng(rawFile); } catch { pngFile = rawFile; }
        let finalFile = pngFile;
        if (autoRemoveBg) {
          try { finalFile = await stripBackground(pngFile); } catch { /* keep png */ }
        }
        results.push({
          id: uid(),
          kind: "pending",
          file: finalFile,
          previewUrl: URL.createObjectURL(finalFile),
        });
      } catch {
        // skip URLs that can't be fetched (CORS, 4xx, etc.)
      }
    }
    return results;
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
      if (mode.kind === "create" && !createdId) {
        const created = await adminApi.createProduct(built);
        productId = created.id;
        // Record immediately so any retry (e.g. after image failure) updates instead of re-creating.
        setCreatedId(created.id);
      } else {
        const existingId = mode.kind === "edit" ? mode.productId : createdId!;
        await adminApi.updateProduct(existingId, built as UpdateProductBody);
        productId = existingId;
      }

      // Process scraped images client-side (fetch → PNG → bg removal) so they
      // go through the same S3 upload path as manually-picked files.
      const scrapedItems = await processScrapedImages();
      // Revoke any preview URLs once upload is done.
      const cleanupScrapedPreviews = () => {
        for (const it of scrapedItems) {
          if (it.kind === "pending") URL.revokeObjectURL(it.previewUrl);
        }
      };

      const imagesOk = await commitProductImages(productId, scrapedItems);
      cleanupScrapedPreviews();
      if (!imagesOk) {
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
          const readable = readableError(err);
          // If it's a raw JS error (not from the API), append its message so the admin can diagnose it.
          const rawMsg = !isApiError(err) && err instanceof Error ? ` (${err.message})` : "";
          setErrorMsg(
            "The product saved, but variants failed to save: " + readable + rawMsg +
            "\nEdit the product to retry.",
          );
          return;
        }
      }

      clearDraft(draftKey);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _atImageLimit = totalImageCount >= MAX_IMAGES;

  // Show variants for all products so any category can manage stock via variants.
  const showVariants = true;

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
          {processingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" />
              Processing {processingCount} image{processingCount > 1 ? "s" : ""}…
            </span>
          )}
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

      {/* Draft restore banner — shown only in create mode when an unsaved draft is detected */}
      {pendingDraft && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Unsaved draft found — &ldquo;{pendingDraft.form.name || "Untitled product"}&rdquo;
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Saved {draftAge(pendingDraft.savedAt)}.
              {pendingDraft.pendingImageNames?.length > 0 ? (
                <> <span className="font-medium">Images must be re-uploaded:</span>{" "}
                  {pendingDraft.pendingImageNames.join(", ")}.</>
              ) : " All other fields will be restored."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const d = pendingDraft;
                if (d.form.slug) slugEditedRef.current = true;
                setForm(d.form);
                setSpecRows(d.specRows.map((r) => ({ id: uid(), key: r.key, value: r.value })));
                // Pass draft rows directly to editor via prop (no timing issues).
                // restoreKey forces a remount so the useState initialiser re-runs with draftInitRows.
                if (d.variantRows.length > 0) {
                  setDraftInitRows(d.variantRows);
                  setRestoreKey((k) => k + 1);
                  // Clear after 3 s so future category changes start with empty rows.
                  setTimeout(() => setDraftInitRows(null), 3000);
                }
                setPendingDraft(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={() => { clearDraft(draftKey); setPendingDraft(null); }}
              className="px-3 py-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Main form — scrolls with page */}
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
                  className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-line ${scrapeNote.kind === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-gray-100 bg-gray-50 text-gray-600"
                    }`}
                >
                  {scrapeNote.text}
                </div>
              )}
            </section>
          )}

          {(() => {
            const _siCatSlug = categories.find((c) => c.id === form.categoryId)?.slug?.toLowerCase() ?? "";
            const _siCatName = categories.find((c) => c.id === form.categoryId)?.name?.toLowerCase() ?? "";
            const _siIsLens        = _siCatSlug.includes("lens") || _siCatName.includes("lens");
            const _siIsSpeaker     = _siCatSlug.includes("speaker") || _siCatName.includes("speaker");
            const _siIsTv          = _siCatSlug.includes("tv") || _siCatName.includes("tv") || _siCatName.includes("television");
            const _siIsSmartDevice = !_siIsTv && (_siCatSlug.includes("smart") || _siCatName.includes("smart"));
            const _siIsCamera      = !_siIsLens && (_siCatSlug.includes("camera") || _siCatName.includes("camera"));
            const _siIsPhone       = _siCatSlug.includes("phone") || _siCatName.includes("phone");
            const _siSpecOnly = _siIsLens || _siIsSpeaker || _siIsTv || _siIsSmartDevice || _siIsCamera;
            if (_siSpecOnly) return null;
            return (
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm">Basic Information</h3>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Product name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder={catPlaceholders.productName}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
            </div>
            {_siIsPhone && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-600">Slug</label>
                  {!slugEditedRef.current && form.slug && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#129cd3] bg-blue-50 px-1.5 py-0.5 rounded">
                      Auto
                    </span>
                  )}
                  {slugEditedRef.current && (
                    <button
                      type="button"
                      onClick={() => { slugEditedRef.current = false; onChange("name", form.name); }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
                <input
                  value={form.slug}
                  onChange={(e) => onChange("slug", e.target.value)}
                  placeholder={catPlaceholders.slugHint}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
                />
              </div>
            )}
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] resize-y"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Up to 10,000 characters. (
                {form.description.length.toLocaleString("en-IN")}/10,000)
              </p>
            </div>
          </section>
            );
          })()}

          {/* ── Specifications ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Specifications</h3>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Product details shown on the product page. RAM, ROM and Color are set per variant below.
              </p>
            </div>
            {(() => {
              const catSlug = categories.find((c) => c.id === form.categoryId)?.slug?.toLowerCase() ?? "";
              const catName = categories.find((c) => c.id === form.categoryId)?.name?.toLowerCase() ?? "";
              const isPhone = catSlug.includes("phone") || catName.includes("phone");
              const isTv = catSlug.includes("tv") || catName.includes("tv") || catName.includes("television");
              const isLens = catSlug.includes("lens") || catName.includes("lens");
              const isCamera = !isLens && (catSlug.includes("camera") || catName.includes("camera"));
              const isSpeaker      = catSlug.includes("speaker") || catName.includes("speaker");
              const isSmartDevice  = !isTv && (catSlug.includes("smart") || catName.includes("smart"));
              return isPhone ? (
                <PhoneSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : isTv ? (
                <TvSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : isLens ? (
                <CameraLensSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : isCamera ? (
                <CameraSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : isSpeaker ? (
                <SpeakerSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : isSmartDevice ? (
                <SmartDeviceSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : (
                <SpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              );
            })()}
          </section>


          {showVariants && (() => {
            const catSlug = categories.find((c) => c.id === form.categoryId)?.slug;
            const catName = categories.find((c) => c.id === form.categoryId)?.name?.toLowerCase() ?? "";
            const _cs = catSlug?.toLowerCase() ?? "";
            const _isLensV    = _cs.includes("lens")    || catName.includes("lens");
            const _isSpeakerV = _cs.includes("speaker") || catName.includes("speaker");
            const _isTvV      = _cs.includes("tv")      || catName.includes("tv") || catName.includes("television");
            const _isCameraV   = !_isLensV && (_cs.includes("camera") || catName.includes("camera"));
            const _isSmartDevV = !_isTvV && (_cs.includes("smart") || catName.includes("smart"));
            const _needsModelCheck = _isLensV || _isSpeakerV || _isSmartDevV || _isCameraV;
            // Extract spec screen sizes + per-size product names for TVs (Screen Size, Screen Size 2 …).
            const tvSpecSizes = _isTvV
              ? Array.from({ length: 5 }, (_, i) => {
                  const key = i === 0 ? "Screen Size" : `Screen Size ${i + 1}`;
                  return specRows.find((r) => r.key === key)?.value?.trim() ?? "";
                }).filter(Boolean)
              : [];
            // Per-size data for TV variant auto-fill: productName triggers size auto-fill.
            const tvSpecModels = _isTvV
              ? Array.from({ length: 5 }, (_, i) => {
                  const sizeKey    = i === 0 ? "Screen Size"   : `Screen Size ${i + 1}`;
                  const nameKey    = i === 0 ? "Product Name"  : `Product Name ${i + 1}`;
                  const screenSize = specRows.find((r) => r.key === sizeKey)?.value?.trim() ?? "";
                  const productName = specRows.find((r) => r.key === nameKey)?.value?.trim() ?? "";
                  if (!screenSize && !productName) return null;
                  return { screenSize, productName };
                }).filter(Boolean) as { screenSize: string; productName: string }[]
              : [];
            // Extract spec model nos for multi-model types (Model, Model 2, Model 3 …).
            const specModelNos = _needsModelCheck
              ? Array.from({ length: 5 }, (_, i) => {
                  const key = i === 0 ? "Model" : `Model ${i + 1}`;
                  return specRows.find((r) => r.key === key)?.value?.trim() ?? "";
                }).filter(Boolean)
              : [];
            // For cameras, also pass per-model spec data so variants can auto-fill.
            const cameraSpecModels = _isCameraV
              ? Array.from({ length: 5 }, (_, i) => {
                  const modelKey = i === 0 ? "Model" : `Model ${i + 1}`;
                  const model = specRows.find((r) => r.key === modelKey)?.value?.trim() ?? "";
                  if (!model) return null;
                  const lensIncludedKey = i === 0 ? "Lens Included" : `Lens Included ${i + 1}`;
                  const launchYearKey   = i === 0 ? "Launch Year"   : `Launch Year ${i + 1}`;
                  const lensNameKey     = i === 0 ? "Lens Name"     : `Lens Name ${i + 1}`;
                  return {
                    model,
                    lensIncluded: specRows.find((r) => r.key === lensIncludedKey)?.value?.trim() ?? "",
                    launchYear:   specRows.find((r) => r.key === launchYearKey)?.value?.trim()   ?? "",
                    lensName:     specRows.find((r) => r.key === lensNameKey)?.value?.trim()     ?? "",
                  };
                }).filter(Boolean) as { model: string; lensIncluded: string; launchYear: string; lensName: string }[]
              : [];
            // Key includes catSlug so the editor remounts once categories load,
            // ensuring isTV/isCamera are correct when initRows/initColorImages run.
            // restoreKey forces a remount on draft restore so draftRows are picked up.
            const editorKey = `${isEdit ? mode.productId : "new"}-${catSlug ?? ""}-${restoreKey}`;
            return (
              <ProductVariantsEditor
                key={editorKey}
                ref={variantsRef}
                productName={form.name}
                initialVariants={isEdit ? mode.initial.variants : []}
                disabled={busy}
                categorySlug={catSlug}
                draftRows={draftInitRows ?? undefined}
                specModelNos={specModelNos}
                cameraSpecModels={cameraSpecModels}
                tvSpecSizes={tvSpecSizes}
                tvSpecModels={tvSpecModels}
              />
            );
          })()}

          {/* Coupon attachments — always visible; functional after first save */}
          <div ref={couponSectionRef}>
            {!isEdit && createdId && (
              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 font-medium">
                ✓ Product saved! You can now attach coupons below.
              </div>
            )}
            <CouponAttachments
              productId={isEdit ? mode.productId : (createdId ?? "")}
              initialCoupons={isEdit ? (mode.initial.coupons ?? {}) : {}}
            />
          </div>
        </div>

        {/* Sidebar — sticks while left scrolls */}
        <div className="space-y-5 sticky top-6">
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
                placeholder={catPlaceholders.brand}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                HSN code
              </label>
              <input
                value={form.hsnCode}
                onChange={(e) => onChange("hsnCode", e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 8517"
                inputMode="numeric"
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

      {/* ── Crop modal ─────────────────────────────────────────────────── */}
      {cropModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800">Crop Image</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {cropQueue.length > 1
                    ? `${cropQueue.length} images remaining — `
                    : ""}
                  Drag to select the area you want, then click Apply Crop.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCropSkip}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Skip crop"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-center max-h-[60vh] overflow-auto bg-gray-50 rounded-lg">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={cropImgRef}
                  src={cropModal.src}
                  alt="Crop preview"
                  style={{ maxHeight: "60vh", maxWidth: "100%", objectFit: "contain" }}
                />
              </ReactCrop>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCropSkip}
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-lg"
              >
                Skip crop
              </button>
              <button
                type="button"
                onClick={handleCropApply}
                className="text-sm font-semibold bg-[#129cd3] hover:bg-[#0e87b5] text-white px-5 py-2 rounded-lg"
              >
                Apply crop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phone-specific structured spec editor ────────────────────────────────────

const PHONE_SPEC_KEYS = new Set([
  "Display Size", "Resolution", "Screen Type",
  "Height", "Width", "Depth", "Weight",
  "Battery",
  "Front Camera", "Rear Camera",
  "Processor",
]);

type PhoneSpecGroup = {
  label: string;
  icon: string;
  fields: { key: string; placeholder: string; unit?: string; numeric?: boolean; numericList?: boolean }[];
};

const PHONE_SPEC_GROUPS: PhoneSpecGroup[] = [
  {
    label: "Display",
    icon: "📱",
    fields: [
      { key: "Display Size", placeholder: "e.g. 6.8", unit: "inches", numeric: true },
      { key: "Resolution", placeholder: "e.g. 2400 × 1080 px" },
      { key: "Screen Type", placeholder: "e.g. AMOLED, 120Hz" },
    ],
  },
  {
    label: "Dimensions",
    icon: "📐",
    fields: [
      { key: "Height", placeholder: "e.g. 163.4", unit: "mm", numeric: true },
      { key: "Width", placeholder: "e.g. 77.8", unit: "mm", numeric: true },
      { key: "Depth", placeholder: "e.g. 8.2", unit: "mm", numeric: true },
      { key: "Weight", placeholder: "e.g. 214", unit: "g", numeric: true },
    ],
  },
  {
    label: "Battery",
    icon: "🔋",
    fields: [
      { key: "Battery", placeholder: "e.g. 5000 mAh, 67W fast charging" },
    ],
  },
  {
    label: "Camera",
    icon: "📷",
    fields: [
      { key: "Rear Camera", placeholder: "e.g. 50 + 20 + 8", unit: "MP", numericList: true },
      { key: "Front Camera", placeholder: "e.g. 32", unit: "MP", numeric: true },
    ],
  },
  {
    label: "Processor",
    icon: "⚡",
    fields: [
      { key: "Processor", placeholder: "e.g. Snapdragon 8 Gen 3, 3.3 GHz" },
    ],
  },
];

function PhoneSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {

  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";

  const set = (key: string, value: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      onChange(rows.map((r) => (r.id === existing.id ? { ...r, value } : r)));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  // Extra free-form rows that aren't phone-specific keys
  const extraRows = rows.filter((r) => !PHONE_SPEC_KEYS.has(r.key));
  const setExtraRows = (next: SpecRow[]) => {
    onChange([...rows.filter((r) => PHONE_SPEC_KEYS.has(r.key)), ...next]);
  };

  return (
    <div className="space-y-4">
      {PHONE_SPEC_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Group header */}
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-base leading-none">{group.icon}</span>
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{group.label}</span>
          </div>
          {/* Fields */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {field.key}
                </label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                  <input
                    value={get(field.key)}
                    onChange={(e) => set(field.key, field.numericList
                      ? e.target.value.replace(/[^0-9+. ]/g, "")
                      : e.target.value)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    type={field.numeric ? "number" : "text"}
                    inputMode={field.numeric ? "decimal" : field.numericList ? "decimal" : undefined}
                    min={field.numeric ? "0" : undefined}
                    step={field.numeric ? "any" : undefined}
                    className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {field.unit && (
                    <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">
                      {field.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      ))}

      {/* Additional free-form specs */}
      <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
        <SpecsEditor rows={extraRows} onChange={setExtraRows} disabled={disabled} />
      </div>
    </div>
  );
}

// ── TV-specific structured spec editor ───────────────────────────────────────

const MAX_TV_SIZES = 5;

function tvSizeKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

type TvSpecField = { key: string; placeholder?: string; unit?: string; wide?: boolean; numeric?: boolean; numericRange?: boolean };
type TvSpecGroup = { label: string; icon: string; fields: TvSpecField[] };

// Keys that differ per screen size
const TV_PER_SIZE_BASE_KEYS = [
  "Screen Size", "Product Name", "Slug", "Description",
  // Display
  "Display Technology", "Resolution", "LED Arrangement",
  "Viewing Angle", "Aspect Ratio",
  // Video
  "Refresh Rate", "Response Time", "Supported Video Formats",
  // Power
  "Power Supply", "Power Consumption", "BEE Star Rating",
  // Convenience
  "Supported Apps", "Other Apps Supported", "Other Convenience Features",
  // Audio
  "Number of Speakers", "Speaker Output RMS", "Sound Mode", "Supported Audio Formats",
  // Remote
  "Battery Requirement",
  // Connectivity
  "HDMI Ports", "USB Ports", "Wi-Fi", "Wi-Fi Type", "Supported Devices for Casting",
  // Memory
  "RAM Capacity", "Storage Memory",
];

const TV_SPEC_KEYS = new Set(
  TV_PER_SIZE_BASE_KEYS.flatMap((k) =>
    Array.from({ length: MAX_TV_SIZES }, (_, i) => tvSizeKey(k, i)),
  ),
);

const TV_PER_SIZE_GROUPS: TvSpecGroup[] = [
  {
    label: "Display Features",
    icon: "📺",
    fields: [
      { key: "Display Technology",  placeholder: "e.g. LED, QLED, OLED" },
      { key: "Resolution",          placeholder: "e.g. 3840 × 2160 (4K Ultra HD)" },
      { key: "LED Arrangement",     placeholder: "e.g. Direct Lit" },
      { key: "Viewing Angle",       placeholder: "e.g. 178", unit: "°", numeric: true },
      { key: "Aspect Ratio",        placeholder: "e.g. 16:9", numericRange: true },
    ],
  },
  {
    label: "Video Features",
    icon: "🎬",
    fields: [
      { key: "Refresh Rate",            placeholder: "e.g. 60", unit: "Hz", numeric: true },
      { key: "Response Time",           placeholder: "e.g. 8", unit: "ms", numeric: true },
      { key: "Supported Video Formats", placeholder: "e.g. H.265, H.264, VP9", wide: true },
    ],
  },
  {
    label: "Power Features",
    icon: "⚡",
    fields: [
      { key: "Power Supply",    placeholder: "e.g. AC 100-240V, 50/60Hz" },
      { key: "Power Consumption", placeholder: "e.g. 75", unit: "W", numeric: true },
      { key: "BEE Star Rating", placeholder: "e.g. 3 Star" },
    ],
  },
  {
    label: "Convenience Features",
    icon: "⭐",
    fields: [
      { key: "Supported Apps",             placeholder: "e.g. Netflix, Prime Video, YouTube", wide: true },
      { key: "Other Apps Supported",       placeholder: "e.g. Disney+, SonyLIV, Zee5", wide: true },
      { key: "Other Convenience Features", placeholder: "e.g. Wi-Fi | Bluetooth | 2 HDMI Ports | 1 x USB-A Port", wide: true },
    ],
  },
  {
    label: "Audio Features",
    icon: "🔊",
    fields: [
      { key: "Number of Speakers",     placeholder: "e.g. 2", numeric: true },
      { key: "Speaker Output RMS",     placeholder: "e.g. 20", unit: "W", numeric: true },
      { key: "Sound Mode",             placeholder: "e.g. Dolby Atmos, DTS:X" },
      { key: "Supported Audio Formats", placeholder: "e.g. Dolby Digital, PCM", wide: true },
    ],
  },
  {
    label: "Remote Controller",
    icon: "🎮",
    fields: [
      { key: "Battery Requirement", placeholder: "e.g. 2 × AAA" },
    ],
  },
  {
    label: "Connectivity Features",
    icon: "🔌",
    fields: [
      { key: "HDMI Ports",                  placeholder: "e.g. 2 (HDMI 2.0, eARC)" },
      { key: "USB Ports",                   placeholder: "e.g. 1 × USB-A" },
      { key: "Wi-Fi",                       placeholder: "e.g. Yes" },
      { key: "Wi-Fi Type",                  placeholder: "e.g. 802.11 a/b/g/n/ac (2.4 GHz + 5 GHz)" },
      { key: "Supported Devices for Casting", placeholder: "e.g. Android, iOS, Chromecast", wide: true },
    ],
  },
  {
    label: "Memory",
    icon: "💾",
    fields: [
      { key: "RAM Capacity",   placeholder: "e.g. 1.5", unit: "GB", numeric: true },
      { key: "Storage Memory", placeholder: "e.g. 8", unit: "GB", numeric: true },
    ],
  },
];

function TvSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";

  const set = (key: string, value: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      onChange(rows.map((r) => (r.id === existing.id ? { ...r, value } : r)));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  // Determine how many size sections to show based on existing data
  const [sizeCount, setSizeCount] = useState(() => {
    let count = 1;
    for (let i = 1; i < MAX_TV_SIZES; i++) {
      if (rows.some((r) => r.key === tvSizeKey("Screen Size", i))) count = i + 1;
    }
    return count;
  });

  const removeSize = (i: number) => {
    const keysToRemove = new Set(TV_PER_SIZE_BASE_KEYS.map((k) => tvSizeKey(k, i)));
    onChange(rows.filter((r) => !keysToRemove.has(r.key)));
    setSizeCount((c) => Math.max(1, c - 1));
  };

  // Per-size extra-row helpers (same suffix convention as tvSizeKey: "" for size 0, " 2" for size 1, etc.)
  const tvExtraSuffix = (idx: number) => (idx === 0 ? "" : ` ${idx + 1}`);
  const otherTvSuffixes = Array.from({ length: MAX_TV_SIZES - 1 }, (_, j) => ` ${j + 2}`);

  return (
    <div className="space-y-4">
      {/* Per-size sections */}
      {Array.from({ length: sizeCount }, (_, i) => {
        const sizeVal = get(tvSizeKey("Screen Size", i));
        return (
          <div key={i} className="border border-[#129cd3]/30 rounded-xl overflow-hidden">
            {/* Screen Size header row */}
            <div className="bg-[#e8f7fc] border-b border-[#129cd3]/20 px-4 py-2.5 flex items-center gap-3">
              <span className="text-[11px] font-bold text-[#129cd3] uppercase tracking-wide whitespace-nowrap">
                Screen Size{i > 0 ? ` ${i + 1}` : ""}
              </span>
              <div className="flex-1 flex items-center border border-[#129cd3]/40 rounded-lg overflow-hidden focus-within:border-[#129cd3] bg-white">
                <input
                  value={sizeVal}
                  onChange={(e) => set(tvSizeKey("Screen Size", i), e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 43"
                  disabled={disabled}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  className="flex-1 px-3 py-1.5 text-sm outline-none bg-transparent disabled:text-gray-400"
                />
                <span className="px-2 py-1.5 text-xs text-gray-400 bg-gray-50 border-l border-[#129cd3]/30 font-medium select-none">inch</span>
              </div>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeSize(i)}
                  disabled={disabled}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                  title="Remove this size"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {sizeVal.trim() ? (
              <div className="p-3 space-y-4">
                {/* Product Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product Name</label>
                  <input
                    value={get(tvSizeKey("Product Name", i))}
                    onChange={(e) => {
                      const v = e.target.value;
                      const nameKey = tvSizeKey("Product Name", i);
                      const slugKey = tvSizeKey("Slug", i);
                      const curSlug = get(slugKey);
                      const shouldAutoSlug = !curSlug || curSlug === toKebab(get(nameKey));
                      let next = rows.some(r => r.key === nameKey)
                        ? rows.map(r => r.key === nameKey ? { ...r, value: v } : r)
                        : [...rows, { id: uid(), key: nameKey, value: v }];
                      if (shouldAutoSlug) {
                        const newSlug = toKebab(v);
                        next = next.some(r => r.key === slugKey)
                          ? next.map(r => r.key === slugKey ? { ...r, value: newSlug } : r)
                          : [...next, { id: uid(), key: slugKey, value: newSlug }];
                      }
                      onChange(next);
                    }}
                    placeholder='e.g. Samsung 43" 4K QLED Smart TV'
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Slug */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
                  <input
                    value={get(tvSizeKey("Slug", i))}
                    onChange={(e) => set(tvSizeKey("Slug", i), e.target.value)}
                    placeholder="e.g. samsung-43-4k-qled-smart-tv (auto-generated if empty)"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] font-mono bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                  <textarea
                    rows={4}
                    value={get(tvSizeKey("Description", i))}
                    onChange={(e) => set(tvSizeKey("Description", i), e.target.value)}
                    placeholder="Describe key features and what makes this TV great…"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-y bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {TV_PER_SIZE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm leading-none">{group.icon}</span>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.fields.map((field) => {
                        const k = tvSizeKey(field.key, i);
                        return (
                          <div key={k} className={`flex flex-col gap-1 ${field.wide ? "sm:col-span-2" : ""}`}>
                            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                              {field.key}
                            </label>
                            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                              <input
                                value={get(k)}
                                onChange={(e) => set(k, field.numericRange
                                  ? e.target.value.replace(/[^0-9.:]/g, "")
                                  : e.target.value)}
                                placeholder={field.placeholder}
                                disabled={disabled}
                                type={field.numeric ? "number" : "text"}
                                inputMode={field.numeric || field.numericRange ? "decimal" : undefined}
                                min={field.numeric ? "0" : undefined}
                                step={field.numeric ? "any" : undefined}
                                className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                              />
                              {field.unit && (
                                <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">
                                  {field.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-xs text-gray-400">
                Enter a screen size above to unlock specification fields.
              </p>
            )}
            {/* Additional free-form specs — scoped to this size */}
            {(() => {
              const sfx = tvExtraSuffix(i);
              const sizeExtraRows = rows
                .filter((r) => {
                  if (TV_SPEC_KEYS.has(r.key)) return false;
                  if (i === 0) return !otherTvSuffixes.some((s) => r.key.endsWith(s));
                  return r.key.endsWith(sfx) && !TV_SPEC_KEYS.has(r.key.slice(0, -sfx.length));
                })
                .map((r) => (sfx ? { ...r, key: r.key.slice(0, -sfx.length) } : r));
              const setSizeExtraRows = (next: SpecRow[]) => {
                const withSuffix = next.map((r) => ({ ...r, key: sfx ? `${r.key}${sfx}` : r.key }));
                const kept = rows.filter((r) => {
                  if (TV_SPEC_KEYS.has(r.key)) return true;
                  if (i === 0) return otherTvSuffixes.some((s) => r.key.endsWith(s));
                  return !(r.key.endsWith(sfx) && !TV_SPEC_KEYS.has(r.key.slice(0, -sfx.length)));
                });
                onChange([...kept, ...withSuffix]);
              };
              return (
                <div className="border-t border-gray-100 p-3">
                  <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
                    <SpecsEditor rows={sizeExtraRows} onChange={setSizeExtraRows} disabled={disabled} />
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Add another size */}
      {sizeCount < MAX_TV_SIZES && (
        <button
          type="button"
          onClick={() => setSizeCount((c) => c + 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add Another Size
        </button>
      )}
    </div>
  );
}

// ── Camera-specific structured spec editor ────────────────────────────────────

const MAX_CAMERA_MODELS = 5;

function cameraModelKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

const CAMERA_MODEL_BASE_KEYS = [
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

const CAMERA_MODEL_SPEC_KEYS = new Set(
  CAMERA_MODEL_BASE_KEYS.flatMap((k) =>
    Array.from({ length: MAX_CAMERA_MODELS }, (_, i) => cameraModelKey(k, i)),
  ),
);

const YES_NO_KEYS = new Set([
  "Lens Included", "Touchscreen", "Vari-Angle Screen",
  "Built-in Flash", "Hot Shoe", "Wi-Fi", "Bluetooth", "NFC", "HDMI", "Self-timer",
]);

type CameraSpecGroup = {
  label: string;
  icon: string;
  fields: { key: string; placeholder?: string; unit?: string; numeric?: boolean; wide?: boolean }[];
};

const CAMERA_SPEC_GROUPS: CameraSpecGroup[] = [
  {
    label: "General",
    icon: "📋",
    fields: [
      { key: "Model", placeholder: "e.g. Alpha A7 IV" },
      { key: "Series", placeholder: "e.g. Alpha, EOS, Z" },
      { key: "Camera Type", placeholder: "e.g. Mirrorless, DSLR, Compact, Bridge" },
      { key: "Launch Year", placeholder: "e.g. 2024", numeric: true },
    ],
  },
  {
    label: "Sensor",
    icon: "🔬",
    fields: [
      { key: "Sensor Type", placeholder: "e.g. Full-Frame BSI CMOS" },
      { key: "Sensor Size" },
      { key: "Effective Resolution (MP)", placeholder: "e.g. 33", unit: "MP", numeric: true },
      { key: "Image Processor", placeholder: "e.g. BIONZ XR" },
      { key: "ISO Range", placeholder: "e.g. 100 – 51200 (expandable to 204800)" },
    ],
  },
  {
    label: "Lens",
    icon: "🔭",
    fields: [
      { key: "Lens Mount", placeholder: "e.g. Sony E-Mount, Canon RF" },
      { key: "Lens Included", placeholder: "" },
      { key: "Lens Name", placeholder: "e.g. 28–70 mm F3.5–5.6 OSS" },
      { key: "Focal Length", placeholder: "e.g. 28–70 mm", unit: "mm" },
      { key: "Aperture", placeholder: "e.g. f/1.8 – f/22" },
      { key: "Autofocus", placeholder: "e.g. Phase Detection, Contrast Detection" },
    ],
  },
  {
    label: "Display",
    icon: "🖥️",
    fields: [
      { key: "Screen Size", placeholder: "e.g. 3.0", unit: "inches", numeric: true },
      { key: "Screen Type", placeholder: "e.g. TFT LCD, OLED" },
      { key: "Touchscreen", placeholder: "" },
      { key: "Vari-Angle Screen", placeholder: "" },
    ],
  },
  {
    label: "Flash",
    icon: "⚡",
    fields: [
      { key: "Built-in Flash", placeholder: "" },
      { key: "Hot Shoe", placeholder: "" },
    ],
  },
  {
    label: "Storage",
    icon: "💾",
    fields: [
      { key: "Memory Card Type", placeholder: "e.g. SD / SDHC / SDXC / CFexpress Type A" },
      { key: "Card Slots", placeholder: "e.g. 2 (Dual slot)" },
    ],
  },
  {
    label: "Connectivity",
    icon: "🔌",
    fields: [
      { key: "Wi-Fi", placeholder: "" },
      { key: "Bluetooth", placeholder: "" },
      { key: "NFC", placeholder: "" },
      { key: "USB Type", placeholder: "e.g. USB Type-C 3.2 Gen 2" },
      { key: "HDMI", placeholder: "" },
    ],
  },
  {
    label: "Battery",
    icon: "🔋",
    fields: [
      { key: "Battery Model", placeholder: "e.g. NP-FZ100" },
      { key: "Battery Life (Shots)", placeholder: "e.g. 520", unit: "shots", numeric: true },
    ],
  },
  {
    label: "Shutter",
    icon: "📸",
    fields: [
      { key: "Shutter Speed", placeholder: "e.g. 1/4000 – 30 sec" },
      { key: "Self-timer", placeholder: "" },
    ],
  },
  {
    label: "Video",
    icon: "🎥",
    fields: [
      { key: "Video Resolution", placeholder: "e.g. 3840 × 2160" },
      { key: "Video Quality", placeholder: "e.g. 4K 60fps, Full HD 120fps" },
    ],
  },
  {
    label: "Dimensions",
    icon: "📐",
    fields: [
      { key: "Width", placeholder: "e.g. 131.3", unit: "mm", numeric: true },
      { key: "Depth", placeholder: "e.g. 79.8", unit: "mm", numeric: true },
      { key: "Height", placeholder: "e.g. 96.4", unit: "mm", numeric: true },
      { key: "Weight", placeholder: "e.g. 658", unit: "g", numeric: true },
    ],
  },
];

function CameraSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";

  const set = (key: string, value: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      onChange(rows.map((r) => (r.id === existing.id ? { ...r, value } : r)));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  const [modelCount, setModelCount] = useState(() => {
    let count = 1;
    for (let i = 1; i < MAX_CAMERA_MODELS; i++) {
      if (rows.some((r) => r.key === cameraModelKey("Model", i))) count = i + 1;
    }
    return count;
  });

  const removeModel = (i: number) => {
    const keysToRemove = new Set(CAMERA_MODEL_BASE_KEYS.map((k) => cameraModelKey(k, i)));
    onChange(rows.filter((r) => !keysToRemove.has(r.key)));
    setModelCount((c) => Math.max(1, c - 1));
  };

  const modelExtraSuffix = (idx: number) => (idx === 0 ? "" : ` ${idx + 1}`);
  const otherModelSuffixes = Array.from({ length: MAX_CAMERA_MODELS - 1 }, (_, j) => ` ${j + 2}`);

  return (
    <div className="space-y-4">
      {Array.from({ length: modelCount }, (_, i) => {
        const modelVal = get(cameraModelKey("Model", i));
        return (
          <div key={i} className="border border-[#129cd3]/30 rounded-xl overflow-hidden">
            {/* Model No. header */}
            <div className="bg-[#e8f7fc] border-b border-[#129cd3]/20 px-4 py-2.5 flex items-center gap-3">
              <span className="text-[11px] font-bold text-[#129cd3] uppercase tracking-wide whitespace-nowrap">
                Model{i > 0 ? ` ${i + 1}` : ""}
              </span>
              <input
                value={modelVal}
                onChange={(e) => set(cameraModelKey("Model", i), e.target.value)}
                placeholder="e.g. EOS 1500D"
                disabled={disabled}
                className="flex-1 border border-[#129cd3]/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:text-gray-400"
              />
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeModel(i)}
                  disabled={disabled}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                  title="Remove this model"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {modelVal.trim() ? (
              <div className="p-3 space-y-4">
                {/* Lens Included — shown first, gates lens-specific fields */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lens Included?</label>
                  <select
                    value={get(cameraModelKey("Lens Included", i))}
                    onChange={(e) => set(cameraModelKey("Lens Included", i), e.target.value)}
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">— Select —</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                {/* Product Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product Name</label>
                  <input
                    value={get(cameraModelKey("Product Name", i))}
                    onChange={(e) => {
                      const v = e.target.value;
                      const nameKey = cameraModelKey("Product Name", i);
                      const slugKey = cameraModelKey("Slug", i);
                      const curSlug = get(slugKey);
                      const shouldAutoSlug = !curSlug || curSlug === toKebab(get(nameKey));
                      let next = rows.some(r => r.key === nameKey)
                        ? rows.map(r => r.key === nameKey ? { ...r, value: v } : r)
                        : [...rows, { id: uid(), key: nameKey, value: v }];
                      if (shouldAutoSlug) {
                        const newSlug = toKebab(v);
                        next = next.some(r => r.key === slugKey)
                          ? next.map(r => r.key === slugKey ? { ...r, value: newSlug } : r)
                          : [...next, { id: uid(), key: slugKey, value: newSlug }];
                      }
                      onChange(next);
                    }}
                    placeholder="e.g. Canon EOS 1500D DSLR Camera Body"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Slug */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
                  <input
                    value={get(cameraModelKey("Slug", i))}
                    onChange={(e) => set(cameraModelKey("Slug", i), e.target.value)}
                    placeholder="e.g. canon-eos-1500d (auto-generated if empty)"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] font-mono bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                  <textarea
                    rows={4}
                    value={get(cameraModelKey("Description", i))}
                    onChange={(e) => set(cameraModelKey("Description", i), e.target.value)}
                    placeholder="Describe key features of this camera model…"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-y bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Spec groups */}
                {CAMERA_SPEC_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm leading-none">{group.icon}</span>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.fields.filter((field) => {
                        // "Lens Included" is shown above — skip it here
                        if (field.key === "Lens Included") return false;
                        // Hide lens name/focal length when lens is not included
                        const lensVal = get(cameraModelKey("Lens Included", i));
                        if ((field.key === "Lens Name" || field.key === "Focal Length") && lensVal !== "Yes") return false;
                        return true;
                      }).map((field) => {
                        const k = cameraModelKey(field.key, i);
                        return (
                          <div key={k} className={`flex flex-col gap-1 ${(group.fields.length === 1 || field.wide) ? "sm:col-span-2" : ""}`}>
                            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{field.key}</label>
                            {field.key === "Sensor Size" ? (() => {
                              const raw = get(k);
                              const m = raw.match(/^([\d.]*)\s*[×x]\s*([\d.]*)/);
                              const wVal = m ? m[1] : (raw && !/[×x]/.test(raw) ? raw : "");
                              const hVal = m ? m[2] : "";
                              const compose = (w: string, h: string) => w || h ? `${w} × ${h} mm` : "";
                              return (
                                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                                  <input type="number" inputMode="decimal" min="0" step="any"
                                    value={wVal} onChange={(e) => set(k, compose(e.target.value, hVal))}
                                    placeholder="e.g. 35.9" disabled={disabled}
                                    className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400" />
                                  <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-r border-gray-200 font-medium select-none">×</span>
                                  <input type="number" inputMode="decimal" min="0" step="any"
                                    value={hVal} onChange={(e) => set(k, compose(wVal, e.target.value))}
                                    placeholder="e.g. 23.9" disabled={disabled}
                                    className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400" />
                                  <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">mm</span>
                                </div>
                              );
                            })() : YES_NO_KEYS.has(field.key) ? (
                              <select value={get(k)} onChange={(e) => set(k, e.target.value)} disabled={disabled}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400">
                                <option value="">— Select —</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            ) : (
                              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                                <input value={get(k)} onChange={(e) => set(k, e.target.value)}
                                  placeholder={field.placeholder} disabled={disabled}
                                  type={field.numeric ? "number" : "text"}
                                  inputMode={field.numeric ? "decimal" : undefined}
                                  min={field.numeric ? "0" : undefined}
                                  step={field.numeric ? "any" : undefined}
                                  className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400" />
                                {field.unit && (
                                  <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">{field.unit}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Additional free-form specs — scoped to this model */}
                {(() => {
                  const sfx = modelExtraSuffix(i);
                  const modelExtraRows = rows
                    .filter((r) => {
                      if (CAMERA_MODEL_SPEC_KEYS.has(r.key)) return false;
                      if (i === 0) return !otherModelSuffixes.some((s) => r.key.endsWith(s));
                      return r.key.endsWith(sfx) && !CAMERA_MODEL_SPEC_KEYS.has(r.key.slice(0, -sfx.length));
                    })
                    .map((r) => (sfx ? { ...r, key: r.key.slice(0, -sfx.length) } : r));
                  const setModelExtraRows = (next: SpecRow[]) => {
                    const withSuffix = next.map((r) => ({ ...r, key: sfx ? `${r.key}${sfx}` : r.key }));
                    const kept = rows.filter((r) => {
                      if (CAMERA_MODEL_SPEC_KEYS.has(r.key)) return true;
                      if (i === 0) return otherModelSuffixes.some((s) => r.key.endsWith(s));
                      return !(r.key.endsWith(sfx) && !CAMERA_MODEL_SPEC_KEYS.has(r.key.slice(0, -sfx.length)));
                    });
                    onChange([...kept, ...withSuffix]);
                  };
                  return (
                    <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
                      <SpecsEditor rows={modelExtraRows} onChange={setModelExtraRows} disabled={disabled} />
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-xs text-gray-400">
                Enter a model number above to unlock specification fields.
              </p>
            )}
          </div>
        );
      })}

      {modelCount < MAX_CAMERA_MODELS && (
        <button
          type="button"
          onClick={() => setModelCount((c) => c + 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add Another Model
        </button>
      )}
    </div>
  );
}

// ── Camera Lens–specific structured spec editor ───────────────────────────────

const MAX_LENS_MODELS = 5;

function lensModelKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

// Keys shared across all models of the series
const LENS_GLOBAL_BASE_KEYS = ["Brand", "Lens Series"];

// Keys that are per-model (suffixed with index for model 2+)
const LENS_PER_MODEL_BASE_KEYS = [
  "Model", "Lens Name", "Slug", "Description",
  "Lens Type", "Lens Mount", "Compatible Camera", "Compatible Sensor Format", "Color",
  "Focal Length", "Maximum Aperture", "Minimum Aperture",
  "Minimum Focus Distance", "Maximum Magnification",
  "Angle of View (Full Frame)", "Optical Construction", "Special Elements", "Aperture Blades",
  "Focus Type", "Focus Motor", "Focus Limiter Switch", "Focus Hold Buttons",
  "Recommended Usage",
];

const LENS_SPEC_KEYS = new Set([
  ...LENS_GLOBAL_BASE_KEYS,
  ...LENS_PER_MODEL_BASE_KEYS.flatMap((k) =>
    Array.from({ length: MAX_LENS_MODELS }, (_, i) => lensModelKey(k, i)),
  ),
]);

type LensPerModelField = { key: string; placeholder?: string; unit?: string; numeric?: boolean; numericRange?: boolean };
type LensPerModelGroup = { label: string; icon: string; fields: LensPerModelField[] };

const LENS_PER_MODEL_GROUPS: LensPerModelGroup[] = [
  {
    label: "General",
    icon: "📋",
    fields: [
      { key: "Lens Type",                placeholder: "e.g. Super Telephoto Zoom" },
      { key: "Lens Mount",               placeholder: "e.g. Sony E Mount" },
      { key: "Compatible Camera",        placeholder: "e.g. Sony E-mount Mirrorless Cameras" },
      { key: "Compatible Sensor Format", placeholder: "e.g. Full Frame (APS-C Compatible)" },
    ],
  },
  {
    label: "Optical Specifications",
    icon: "🔭",
    fields: [
      { key: "Focal Length",              placeholder: "e.g. 200-600", unit: "mm", numericRange: true },
      { key: "Maximum Aperture",          placeholder: "e.g. f/5.6-6.3" },
      { key: "Minimum Aperture",          placeholder: "e.g. f/32-36" },
      { key: "Minimum Focus Distance",    placeholder: "e.g. 2.4", unit: "m", numeric: true },
      { key: "Maximum Magnification",     placeholder: "e.g. 0.20", unit: "×", numeric: true },
      { key: "Angle of View (Full Frame)", placeholder: "e.g. 12°30' - 4°10'" },
      { key: "Optical Construction",      placeholder: "e.g. 24 Elements in 17 Groups" },
      { key: "Special Elements",          placeholder: "e.g. 5 ED Elements, 1 Aspherical Element" },
      { key: "Aperture Blades",           placeholder: "e.g. 11", numeric: true },
    ],
  },
  {
    label: "Focus",
    icon: "🎯",
    fields: [
      { key: "Focus Type",           placeholder: "e.g. Autofocus / Manual Focus" },
      { key: "Focus Motor",          placeholder: "e.g. Direct Drive SSM (DDSSM)" },
      { key: "Focus Limiter Switch", placeholder: "" },
      { key: "Focus Hold Buttons",   placeholder: "e.g. Yes (3)" },
    ],
  },
  {
    label: "Recommended Usage",
    icon: "📌",
    fields: [
      { key: "Recommended Usage", placeholder: "e.g. Wildlife Photography, Bird Photography, Sports Photography" },
    ],
  },
];

function CameraLensSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";

  const set = (key: string, value: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      onChange(rows.map((r) => (r.id === existing.id ? { ...r, value } : r)));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  // Determine how many model sections to show based on existing data
  const [modelCount, setModelCount] = useState(() => {
    let count = 1;
    for (let i = 1; i < MAX_LENS_MODELS; i++) {
      if (rows.some((r) => r.key === lensModelKey("Model", i))) count = i + 1;
    }
    return count;
  });

  const removeModel = (i: number) => {
    // Clear all per-model keys for this index
    const keysToRemove = new Set(
      LENS_PER_MODEL_BASE_KEYS.map((k) => lensModelKey(k, i)),
    );
    onChange(rows.filter((r) => !keysToRemove.has(r.key)));
    setModelCount((c) => Math.max(1, c - 1));
  };

  // All per-model extra-row suffixes: "" for model 0, " 2" for model 1, etc.
  const lensExtraSuffix = (idx: number) => (idx === 0 ? "" : ` ${idx + 1}`);
  // Suffixes used by OTHER models (to exclude from model 0's extras)
  const otherLensSuffixes = Array.from({ length: MAX_LENS_MODELS - 1 }, (_, j) => ` ${j + 2}`);

  return (
    <div className="space-y-4">
      {/* Global: Brand + Lens Series */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-2">
          <span className="text-base leading-none">📋</span>
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">General</span>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: "Brand",       placeholder: "e.g. Sony, Canon, Nikon" },
            { key: "Lens Series", placeholder: "e.g. G Lens, L-Mount, Art" },
          ].map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{f.key}</label>
              <input
                value={get(f.key)}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={disabled}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-model sections */}
      {Array.from({ length: modelCount }, (_, i) => {
        const modelVal = get(lensModelKey("Model", i));
        return (
          <div key={i} className="border border-[#129cd3]/30 rounded-xl overflow-hidden">
            {/* Model No. row */}
            <div className="bg-[#e8f7fc] border-b border-[#129cd3]/20 px-4 py-2.5 flex items-center gap-3">
              <span className="text-[11px] font-bold text-[#129cd3] uppercase tracking-wide whitespace-nowrap">
                Model No.{i > 0 ? ` ${i + 1}` : ""}
              </span>
              <input
                value={modelVal}
                onChange={(e) => set(lensModelKey("Model", i), e.target.value)}
                placeholder="Enter model no. to unlock spec fields…"
                disabled={disabled}
                className="flex-1 border border-[#129cd3]/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              />
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeModel(i)}
                  disabled={disabled}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                  title="Remove this model"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {modelVal.trim() ? (
              <div className="p-3 space-y-4">
                {/* Lens Name (Product Name) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lens Name (Product Name)</label>
                  <input
                    value={get(lensModelKey("Lens Name", i))}
                    onChange={(e) => {
                      const v = e.target.value;
                      const nameKey = lensModelKey("Lens Name", i);
                      const slugKey = lensModelKey("Slug", i);
                      const curSlug = get(slugKey);
                      const shouldAutoSlug = !curSlug || curSlug === toKebab(get(nameKey));
                      let next = rows.some(r => r.key === nameKey)
                        ? rows.map(r => r.key === nameKey ? { ...r, value: v } : r)
                        : [...rows, { id: uid(), key: nameKey, value: v }];
                      if (shouldAutoSlug) {
                        const newSlug = toKebab(v);
                        next = next.some(r => r.key === slugKey)
                          ? next.map(r => r.key === slugKey ? { ...r, value: newSlug } : r)
                          : [...next, { id: uid(), key: slugKey, value: newSlug }];
                      }
                      onChange(next);
                    }}
                    placeholder="e.g. FE 200-600mm F5.6-6.3 G OSS"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Slug */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
                  <input
                    value={get(lensModelKey("Slug", i))}
                    onChange={(e) => set(lensModelKey("Slug", i), e.target.value)}
                    placeholder="e.g. sony-fe-200-600mm-f5-6-6-3-g-oss (auto-generated if empty)"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] font-mono bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                  <textarea
                    rows={4}
                    value={get(lensModelKey("Description", i))}
                    onChange={(e) => set(lensModelKey("Description", i), e.target.value)}
                    placeholder="Describe key features and what makes this lens great…"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-y bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {LENS_PER_MODEL_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm leading-none">{group.icon}</span>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.fields.map((field) => {
                        const k = lensModelKey(field.key, i);
                        const isYesNo = field.key === "Focus Limiter Switch";
                        return (
                          <div
                            key={k}
                            className={`flex flex-col gap-1 ${group.fields.length === 1 ? "sm:col-span-2" : ""}`}
                          >
                            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                              {field.key}
                            </label>
                            {isYesNo ? (
                              <select
                                value={get(k)}
                                onChange={(e) => set(k, e.target.value)}
                                disabled={disabled}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                              >
                                <option value="">— Select —</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            ) : (
                              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                                <input
                                  value={get(k)}
                                  onChange={(e) => set(k, field.numericRange
                                    ? e.target.value.replace(/[^0-9.\-–\s]/g, "")
                                    : e.target.value)}
                                  placeholder={field.placeholder}
                                  disabled={disabled}
                                  type={field.numeric ? "number" : "text"}
                                  inputMode={field.numeric || field.numericRange ? "decimal" : undefined}
                                  min={field.numeric ? "0" : undefined}
                                  step={field.numeric ? "any" : undefined}
                                  className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                                {field.unit && (
                                  <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">
                                    {field.unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-xs text-gray-400">
                Enter a Model No. above to unlock specification fields for this model.
              </p>
            )}
            {/* Additional free-form specs — scoped to this model */}
            {(() => {
              const sfx = lensExtraSuffix(i);
              const modelExtraRows = rows
                .filter((r) => {
                  if (LENS_SPEC_KEYS.has(r.key)) return false;
                  if (i === 0) return !otherLensSuffixes.some((s) => r.key.endsWith(s));
                  return r.key.endsWith(sfx) && !LENS_SPEC_KEYS.has(r.key.slice(0, -sfx.length));
                })
                .map((r) => (sfx ? { ...r, key: r.key.slice(0, -sfx.length) } : r));
              const setModelExtraRows = (next: SpecRow[]) => {
                const withSuffix = next.map((r) => ({ ...r, key: sfx ? `${r.key}${sfx}` : r.key }));
                const kept = rows.filter((r) => {
                  if (LENS_SPEC_KEYS.has(r.key)) return true;
                  if (i === 0) return otherLensSuffixes.some((s) => r.key.endsWith(s));
                  return !(r.key.endsWith(sfx) && !LENS_SPEC_KEYS.has(r.key.slice(0, -sfx.length)));
                });
                onChange([...kept, ...withSuffix]);
              };
              return (
                <div className="border-t border-gray-100 p-3">
                  <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
                    <SpecsEditor rows={modelExtraRows} onChange={setModelExtraRows} disabled={disabled} />
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Add another model */}
      {modelCount < MAX_LENS_MODELS && (
        <button
          type="button"
          onClick={() => setModelCount((c) => c + 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add Another Model
        </button>
      )}
    </div>
  );
}

// ── Speaker-specific structured spec editor ───────────────────────────────────

const MAX_SPEAKER_MODELS = 5;

function speakerModelKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

const SPEAKER_GLOBAL_KEYS = ["Brand", "Series"];

const SPEAKER_PER_MODEL_BASE_KEYS = [
  "Model", "Product Name", "Slug", "Description", "Speaker Type", "Color",
  // Audio
  "Audio Output Power (RMS)", "Frequency Response", "Driver Size",
  "Number of Drivers", "Speaker Configuration", "Impedance", "Sensitivity", "Signal-to-Noise Ratio",
  // Connectivity
  "Bluetooth", "Bluetooth Version", "Wi-Fi", "AUX Input", "USB Port",
  "HDMI", "Optical Input", "RCA Input", "NFC",
  // Smart Features
  "Voice Assistant Support", "Multi-Room Audio", "Stereo Pairing", "Party Mode", "Mobile App Support",
  // Battery
  "Battery Capacity", "Battery Life", "Charging Time", "Charging Port",
  // Build
  "Material", "Water Resistance Rating", "Dust Resistance", "Dimensions", "Weight",
  // Power
  "Power Source", "Input Voltage",
  // Controls
  "Volume Control", "Playback Controls", "Built-in Microphone", "Hands-Free Calling",
  // Package
  "Package Contents",
];

const SPEAKER_SPEC_KEYS = new Set([
  ...SPEAKER_GLOBAL_KEYS,
  ...SPEAKER_PER_MODEL_BASE_KEYS.flatMap((k) =>
    Array.from({ length: MAX_SPEAKER_MODELS }, (_, i) => speakerModelKey(k, i)),
  ),
]);

const SPEAKER_YES_NO_BASE_KEYS = new Set([
  "Bluetooth", "Wi-Fi", "AUX Input", "HDMI", "Optical Input", "RCA Input", "NFC",
  "Multi-Room Audio", "Stereo Pairing", "Party Mode", "Dust Resistance",
  "Volume Control", "Playback Controls", "Built-in Microphone", "Hands-Free Calling",
]);

type SpeakerPerModelField = { key: string; placeholder?: string; unit?: string; numeric?: boolean };
type SpeakerPerModelGroup = { label: string; icon: string; fields: SpeakerPerModelField[] };

const SPEAKER_PER_MODEL_GROUPS: SpeakerPerModelGroup[] = [
  {
    label: "General",
    icon: "📋",
    fields: [
      { key: "Speaker Type", placeholder: "e.g. Portable Bluetooth Speaker" },
    ],
  },
  {
    label: "Audio",
    icon: "🔊",
    fields: [
      { key: "Audio Output Power (RMS)", placeholder: "e.g. 40",    unit: "W",  numeric: true },
      { key: "Frequency Response",       placeholder: "e.g. 60 Hz – 20 kHz" },
      { key: "Driver Size",              placeholder: "e.g. 45",    unit: "mm", numeric: true },
      { key: "Number of Drivers",        placeholder: "e.g. 2",                numeric: true },
      { key: "Speaker Configuration",    placeholder: "e.g. Stereo" },
      { key: "Impedance",                placeholder: "e.g. 4",     unit: "Ω",  numeric: true },
      { key: "Sensitivity",              placeholder: "e.g. 85",    unit: "dB", numeric: true },
      { key: "Signal-to-Noise Ratio",    placeholder: "e.g. 80",    unit: "dB", numeric: true },
    ],
  },
  {
    label: "Connectivity",
    icon: "🔌",
    fields: [
      { key: "Bluetooth",         placeholder: "" },
      { key: "Bluetooth Version", placeholder: "e.g. 5.3" },
      { key: "Wi-Fi",             placeholder: "" },
      { key: "AUX Input",         placeholder: "" },
      { key: "USB Port",          placeholder: "e.g. USB Type-C" },
      { key: "HDMI",              placeholder: "" },
      { key: "Optical Input",     placeholder: "" },
      { key: "RCA Input",         placeholder: "" },
      { key: "NFC",               placeholder: "" },
    ],
  },
  {
    label: "Smart Features",
    icon: "🤖",
    fields: [
      { key: "Voice Assistant Support", placeholder: "e.g. Google Assistant, Amazon Alexa" },
      { key: "Multi-Room Audio",        placeholder: "" },
      { key: "Stereo Pairing",          placeholder: "" },
      { key: "Party Mode",              placeholder: "" },
      { key: "Mobile App Support",      placeholder: "e.g. JBL Portable App" },
    ],
  },
  {
    label: "Battery",
    icon: "🔋",
    fields: [
      { key: "Battery Capacity", placeholder: "e.g. 4800", unit: "mAh", numeric: true },
      { key: "Battery Life",     placeholder: "e.g. Up to 20 Hours" },
      { key: "Charging Time",    placeholder: "e.g. 2.5 Hours" },
      { key: "Charging Port",    placeholder: "e.g. USB Type-C" },
    ],
  },
  {
    label: "Build",
    icon: "📐",
    fields: [
      { key: "Material",                placeholder: "e.g. Fabric & Rubber" },
      { key: "Water Resistance Rating", placeholder: "e.g. IP67" },
      { key: "Dust Resistance",         placeholder: "" },
      { key: "Dimensions",              placeholder: "e.g. 182 × 69 × 71 mm" },
      { key: "Weight",                  placeholder: "e.g. 550", unit: "g", numeric: true },
    ],
  },
  {
    label: "Power",
    icon: "⚡",
    fields: [
      { key: "Power Source",  placeholder: "e.g. Rechargeable Battery" },
      { key: "Input Voltage", placeholder: "e.g. 5 V / 3 A" },
    ],
  },
  {
    label: "Controls",
    icon: "🎛️",
    fields: [
      { key: "Volume Control",      placeholder: "" },
      { key: "Playback Controls",   placeholder: "" },
      { key: "Built-in Microphone", placeholder: "" },
      { key: "Hands-Free Calling",  placeholder: "" },
    ],
  },
  {
    label: "Package Contents",
    icon: "📦",
    fields: [
      { key: "Package Contents", placeholder: "e.g. Speaker, USB Type-C Cable, User Manual, Warranty Card" },
    ],
  },
];

function SpeakerSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";

  const set = (key: string, value: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      onChange(rows.map((r) => (r.id === existing.id ? { ...r, value } : r)));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  const [modelCount, setModelCount] = useState(() => {
    let count = 1;
    for (let i = 1; i < MAX_SPEAKER_MODELS; i++) {
      if (rows.some((r) => r.key === speakerModelKey("Model", i))) count = i + 1;
    }
    return count;
  });

  const removeModel = (i: number) => {
    const keysToRemove = new Set(
      SPEAKER_PER_MODEL_BASE_KEYS.map((k) => speakerModelKey(k, i)),
    );
    onChange(rows.filter((r) => !keysToRemove.has(r.key)));
    setModelCount((c) => Math.max(1, c - 1));
  };

  const extraRows = rows.filter((r) => !SPEAKER_SPEC_KEYS.has(r.key));
  const setExtraRows = (next: SpecRow[]) => {
    onChange([...rows.filter((r) => SPEAKER_SPEC_KEYS.has(r.key)), ...next]);
  };

  return (
    <div className="space-y-4">
      {/* Global: Brand + Series */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-2">
          <span className="text-base leading-none">📋</span>
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">General</span>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: "Brand",  placeholder: "e.g. JBL, Sony, Bose" },
            { key: "Series", placeholder: "e.g. Flip Series, Charge Series" },
          ].map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{f.key}</label>
              <input
                value={get(f.key)}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={disabled}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-model sections */}
      {Array.from({ length: modelCount }, (_, i) => {
        const modelVal = get(speakerModelKey("Model", i));
        return (
          <div key={i} className="border border-[#129cd3]/30 rounded-xl overflow-hidden">
            {/* Model No. row */}
            <div className="bg-[#e8f7fc] border-b border-[#129cd3]/20 px-4 py-2.5 flex items-center gap-3">
              <span className="text-[11px] font-bold text-[#129cd3] uppercase tracking-wide whitespace-nowrap">
                Model No.{i > 0 ? ` ${i + 1}` : ""}
              </span>
              <input
                value={modelVal}
                onChange={(e) => set(speakerModelKey("Model", i), e.target.value)}
                placeholder="Enter model no. to unlock spec fields…"
                disabled={disabled}
                className="flex-1 border border-[#129cd3]/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              />
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeModel(i)}
                  disabled={disabled}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                  title="Remove this model"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {modelVal.trim() ? (
              <div className="p-3 space-y-4">
                {/* Product Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product Name</label>
                  <input
                    value={get(speakerModelKey("Product Name", i))}
                    onChange={(e) => {
                      const v = e.target.value;
                      const nameKey = speakerModelKey("Product Name", i);
                      const slugKey = speakerModelKey("Slug", i);
                      const curSlug = get(slugKey);
                      const shouldAutoSlug = !curSlug || curSlug === toKebab(get(nameKey));
                      let next = rows.some(r => r.key === nameKey)
                        ? rows.map(r => r.key === nameKey ? { ...r, value: v } : r)
                        : [...rows, { id: uid(), key: nameKey, value: v }];
                      if (shouldAutoSlug) {
                        const newSlug = toKebab(v);
                        next = next.some(r => r.key === slugKey)
                          ? next.map(r => r.key === slugKey ? { ...r, value: newSlug } : r)
                          : [...next, { id: uid(), key: slugKey, value: newSlug }];
                      }
                      onChange(next);
                    }}
                    placeholder="e.g. JBL Charge 5 Portable Bluetooth Speaker"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Slug */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
                  <input
                    value={get(speakerModelKey("Slug", i))}
                    onChange={(e) => set(speakerModelKey("Slug", i), e.target.value)}
                    placeholder="e.g. jbl-charge-5-portable-bluetooth-speaker (auto-generated if empty)"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] font-mono bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                  <textarea
                    rows={4}
                    value={get(speakerModelKey("Description", i))}
                    onChange={(e) => set(speakerModelKey("Description", i), e.target.value)}
                    placeholder="Describe key features and what makes this model great…"
                    disabled={disabled}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-y bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {SPEAKER_PER_MODEL_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm leading-none">{group.icon}</span>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.fields.map((field) => {
                        const k = speakerModelKey(field.key, i);
                        const isYesNo = SPEAKER_YES_NO_BASE_KEYS.has(field.key);
                        return (
                          <div
                            key={k}
                            className={`flex flex-col gap-1 ${group.fields.length === 1 ? "sm:col-span-2" : ""}`}
                          >
                            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                              {field.key}
                            </label>
                            {isYesNo ? (
                              <select
                                value={get(k)}
                                onChange={(e) => set(k, e.target.value)}
                                disabled={disabled}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                              >
                                <option value="">— Select —</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            ) : (
                              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                                <input
                                  value={get(k)}
                                  onChange={(e) => set(k, e.target.value)}
                                  placeholder={field.placeholder}
                                  disabled={disabled}
                                  type={field.numeric ? "number" : "text"}
                                  inputMode={field.numeric ? "decimal" : undefined}
                                  min={field.numeric ? "0" : undefined}
                                  step={field.numeric ? "any" : undefined}
                                  className="flex-1 px-3 py-2 text-sm outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                                {field.unit && (
                                  <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-medium">
                                    {field.unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-xs text-gray-400">
                Enter a Model No. above to unlock specification fields for this model.
              </p>
            )}
            {/* Additional free-form specs — always visible at the bottom of each model card */}
            <div className="border-t border-gray-100 p-3">
              <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
                <SpecsEditor rows={extraRows} onChange={setExtraRows} disabled={disabled} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Add another model */}
      {modelCount < MAX_SPEAKER_MODELS && (
        <button
          type="button"
          onClick={() => setModelCount((c) => c + 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add Another Model
        </button>
      )}
    </div>
  );
}

// ── Smart Device-specific structured spec editor ──────────────────────────────

const MAX_SMART_DEVICE_MODELS = 5;

function smartDeviceModelKey(base: string, idx: number): string {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

const SD_RESERVED_BASE_KEYS = ["Model", "Product Name", "Product Type", "Slug", "Description", "Color"];
const SD_RESERVED_KEY_SET = new Set(
  SD_RESERVED_BASE_KEYS.flatMap((k) =>
    Array.from({ length: MAX_SMART_DEVICE_MODELS }, (_, i) => smartDeviceModelKey(k, i)),
  ),
);

type SDField   = { id: string; key: string; value: string };
type SDSection = { id: string; heading: string; fields: SDField[] };

const SD_HEADING_RE = /^__h\d+$/;
const SD_FIELD_PREFIX_RE = /^__h(\d+):(.+)$/;

function initSDSections(rows: SpecRow[]): SDSection[][] {
  return Array.from({ length: MAX_SMART_DEVICE_MODELS }, (_, mi) => {
    const reservedForModel = new Set(SD_RESERVED_BASE_KEYS.map((k) => smartDeviceModelKey(k, mi)));
    // Collect raw rows for this model with their base keys (model suffix stripped).
    type RawRow = { id: string; baseKey: string; value: string };
    let rawRows: RawRow[];
    if (mi === 0) {
      rawRows = rows
        .filter((r) => !SD_RESERVED_KEY_SET.has(r.key) && !/\s\d+$/.test(r.key))
        .map((r) => ({ id: r.id, baseKey: r.key, value: r.value }));
    } else {
      const suffix = ` ${mi + 1}`;
      rawRows = rows
        .filter((r) => !reservedForModel.has(r.key) && r.key.endsWith(suffix))
        .map((r) => ({ id: r.id, baseKey: r.key.slice(0, -suffix.length), value: r.value }));
    }
    if (rawRows.length === 0) return [{ id: uid(), heading: "", fields: [] }];

    // New format: fields stored as __hN:fieldKey — order-independent reconstruction.
    const hasNewFormat = rawRows.some((r) => SD_FIELD_PREFIX_RE.test(r.baseKey));
    if (hasNewFormat) {
      const headings = new Map<number, string>();
      const fieldsBySection = new Map<number, SDField[]>();
      for (const row of rawRows) {
        const hm = row.baseKey.match(/^__h(\d+)$/);
        if (hm) { headings.set(+hm[1], row.value); continue; }
        const fm = row.baseKey.match(/^__h(\d+):(.+)$/);
        if (fm) {
          const si = +fm[1];
          if (!fieldsBySection.has(si)) fieldsBySection.set(si, []);
          fieldsBySection.get(si)!.push({ id: row.id, key: fm[2], value: row.value });
        }
      }
      const maxSi = Math.max(-1, ...headings.keys(), ...fieldsBySection.keys());
      if (maxSi < 0) return [{ id: uid(), heading: "", fields: [] }];
      return Array.from({ length: maxSi + 1 }, (_, si) => ({
        id: uid(),
        heading: headings.get(si) ?? "",
        fields: fieldsBySection.get(si) ?? [],
      }));
    }

    // Legacy format: __hN marker rows interleaved — order-dependent (may fail after JSONB round-trip).
    const sections: SDSection[] = [];
    let cur: SDSection = { id: uid(), heading: "", fields: [] };
    for (const row of rawRows) {
      if (SD_HEADING_RE.test(row.baseKey)) {
        if (cur.fields.length > 0 || cur.heading) sections.push(cur);
        cur = { id: uid(), heading: row.value, fields: [] };
      } else {
        cur.fields.push({ id: row.id, key: row.baseKey, value: row.value });
      }
    }
    sections.push(cur);
    return sections.length > 0 ? sections : [{ id: uid(), heading: "", fields: [] }];
  });
}

function SmartDeviceSpecsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
}) {
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";
  const setVal = (key: string, value: string) => {
    if (rows.some((r) => r.key === key)) {
      onChange(rows.map((r) => r.key === key ? { ...r, value } : r));
    } else {
      onChange([...rows, { id: uid(), key, value }]);
    }
  };

  const [modelCount, setModelCount] = useState(() => {
    let count = 1;
    for (let i = 1; i < MAX_SMART_DEVICE_MODELS; i++) {
      if (rows.some((r) => r.key === smartDeviceModelKey("Model", i))) count = i + 1;
    }
    return count;
  });

  const [sectionsByModel, setSectionsByModel] = useState<SDSection[][]>(() => initSDSections(rows));

  const rowsRef = useRef(rows);
  useLayoutEffect(() => { rowsRef.current = rows; });

  // Sync dynamic sections → parent rows (only fires on section state change)
  useEffect(() => {
    const reservedRows = rowsRef.current.filter((r) => SD_RESERVED_KEY_SET.has(r.key));
    const dynRows: SpecRow[] = [];
    sectionsByModel.forEach((sections, mi) => {
      sections.forEach((sec, si) => {
        // Persist heading as a marker row (__hN). Fields are stored with section prefix
        // (__hN:fieldKey) so reconstruction is order-independent (backend may sort keys).
        dynRows.push({ id: uid(), key: smartDeviceModelKey(`__h${si}`, mi), value: sec.heading });
        sec.fields.forEach((f) => {
          if (f.key.trim()) {
            dynRows.push({ id: f.id, key: smartDeviceModelKey(`__h${si}:${f.key}`, mi), value: f.value });
          }
        });
      });
    });
    onChange([...reservedRows, ...dynRows]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsByModel]);

  const updateSections = (mi: number, updater: (secs: SDSection[]) => SDSection[]) =>
    setSectionsByModel((prev) => {
      const next = [...prev];
      next[mi] = updater(next[mi] ?? []);
      return next;
    });

  const removeModel = (i: number) => {
    // Clear reserved rows for this model
    const reservedForModel = new Set(SD_RESERVED_BASE_KEYS.map((k) => smartDeviceModelKey(k, i)));
    onChange(rowsRef.current.filter((r) => !reservedForModel.has(r.key)));
    // Clear dynamic sections for this model
    setSectionsByModel((prev) => {
      const next = [...prev];
      next[i] = [{ id: uid(), heading: "", fields: [] }];
      return next;
    });
    setModelCount((c) => Math.max(1, c - 1));
  };

  return (
    <div className="space-y-4">
      {Array.from({ length: modelCount }, (_, i) => {
        const modelVal = get(smartDeviceModelKey("Model", i));
        const sections = sectionsByModel[i] ?? [];
        return (
          <div key={i} className="border border-[#129cd3]/30 rounded-xl overflow-hidden">
            {/* Model No. row */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#e8f7fc]">
              <span className="text-xs font-bold text-[#129cd3] uppercase tracking-wide whitespace-nowrap">Model {i + 1}</span>
              <input
                value={modelVal}
                onChange={(e) => setVal(smartDeviceModelKey("Model", i), e.target.value)}
                placeholder="Enter model no. to unlock spec fields…"
                disabled={disabled}
                className="flex-1 border border-[#129cd3]/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              />
              {i > 0 && (
                <button type="button" onClick={() => removeModel(i)} disabled={disabled} className="text-red-400 hover:text-red-600 disabled:opacity-40">
                  <X size={15} />
                </button>
              )}
            </div>

            {modelVal && (
              <div className="p-4 space-y-4 bg-white">
                {/* Reserved fields */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product Name</label>
                      <input
                        value={get(smartDeviceModelKey("Product Name", i))}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nameKey = smartDeviceModelKey("Product Name", i);
                          const slugKey = smartDeviceModelKey("Slug", i);
                          const curSlug = get(slugKey);
                          const shouldAutoSlug = !curSlug || curSlug === toKebab(get(nameKey));
                          let next = rows.some(r => r.key === nameKey)
                            ? rows.map(r => r.key === nameKey ? { ...r, value: v } : r)
                            : [...rows, { id: uid(), key: nameKey, value: v }];
                          if (shouldAutoSlug) {
                            const newSlug = toKebab(v);
                            next = next.some(r => r.key === slugKey)
                              ? next.map(r => r.key === slugKey ? { ...r, value: newSlug } : r)
                              : [...next, { id: uid(), key: slugKey, value: newSlug }];
                          }
                          onChange(next);
                        }}
                        placeholder="e.g. Amazon Echo Dot (5th Gen)"
                        disabled={disabled}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product Type</label>
                      <input
                        value={get(smartDeviceModelKey("Product Type", i))}
                        onChange={(e) => setVal(smartDeviceModelKey("Product Type", i), e.target.value)}
                        placeholder="e.g. Smart Speaker, Smart Plug"
                        disabled={disabled}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
                    <input
                      value={get(smartDeviceModelKey("Slug", i))}
                      onChange={(e) => setVal(smartDeviceModelKey("Slug", i), e.target.value)}
                      placeholder="e.g. amazon-echo-dot-5th-gen (auto-generated if empty)"
                      disabled={disabled}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] font-mono bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                    <textarea
                      rows={4}
                      value={get(smartDeviceModelKey("Description", i))}
                      onChange={(e) => setVal(smartDeviceModelKey("Description", i), e.target.value)}
                      placeholder="Describe key features and what makes this model great…"
                      disabled={disabled}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-y bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {/* Dynamic spec sections */}
                <div className="space-y-3">
                  {sections.map((sec, si) => (
                    <div key={sec.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Section heading input */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#ebebeb] border-b border-gray-200">
                        <svg className="w-3 h-3 text-[#6e6e6e]/50 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" /></svg>
                        <input
                          value={sec.heading}
                          onChange={(e) => updateSections(i, (secs) => secs.map((s, idx) => idx === si ? { ...s, heading: e.target.value } : s))}
                          placeholder="SECTION HEADING"
                          disabled={disabled}
                          className="flex-1 bg-transparent text-xs font-extrabold text-[#6e6e6e] uppercase tracking-widest placeholder:text-[#6e6e6e]/40 outline-none border-none"
                        />
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => updateSections(i, (secs) => secs.filter((_, idx) => idx !== si))}
                            disabled={disabled}
                            className="text-red-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {/* Fields */}
                      <div className="p-3 space-y-2">
                        {sec.fields.map((field, fi) => (
                          <div key={field.id} className="flex items-center gap-2">
                            <input
                              value={field.key}
                              onChange={(e) => updateSections(i, (secs) => secs.map((s, idx) => idx === si ? { ...s, fields: s.fields.map((f, fIdx) => fIdx === fi ? { ...f, key: e.target.value } : f) } : s))}
                              placeholder="Spec name"
                              disabled={disabled}
                              className="w-2/5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            <input
                              value={field.value}
                              onChange={(e) => updateSections(i, (secs) => secs.map((s, idx) => idx === si ? { ...s, fields: s.fields.map((f, fIdx) => fIdx === fi ? { ...f, value: e.target.value } : f) } : s))}
                              placeholder="Value"
                              disabled={disabled}
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateSections(i, (secs) => secs.map((s, idx) => idx === si ? { ...s, fields: s.fields.filter((_, fIdx) => fIdx !== fi) } : s))}
                              disabled={disabled}
                              className="text-red-400 hover:text-red-600 disabled:opacity-40"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateSections(i, (secs) => secs.map((s, idx) => idx === si ? { ...s, fields: [...s.fields, { id: uid(), key: "", value: "" }] } : s))}
                          disabled={disabled}
                          className="text-xs font-semibold text-[#129cd3] hover:underline disabled:opacity-40"
                        >
                          + Add Field
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateSections(i, (secs) => [...secs, { id: uid(), heading: "", fields: [] }])}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
                  >
                    <Plus size={12} /> Add Section
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add another model */}
      {modelCount < MAX_SMART_DEVICE_MODELS && (
        <button
          type="button"
          onClick={() => setModelCount((c) => c + 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add Another Model
        </button>
      )}
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
    onChange(rows.map((r: SpecRow) => (r.id === id ? { ...r, ...patch } : r)));
const add = () => onChange([...rows, { id: uid(), key: "", value: "" }]);
  const remove = (id: string) => onChange(rows.filter((r: SpecRow) => r.id !== id));

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
            placeholder=""
            disabled={disabled}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
          />
          <input
            value={r.value}
            onChange={(e) => update(r.id, { value: e.target.value })}
            placeholder=""
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
