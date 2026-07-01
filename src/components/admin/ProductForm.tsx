"use client";

import {
  useCallback,
  useEffect,
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

  const [form, setForm] = useState<FormState>(buildInitialForm(initial));
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
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | null
  >(null);
  const [processingCount, setProcessingCount] = useState(0);
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
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
  const [isIPhone, setIsIPhone] = useState(false);
  const couponSectionRef = useRef<HTMLDivElement>(null);

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
  const onPickFiles = useCallback(
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

  // Move any image to position 0 (makes it the main/display photo).
  const setAsMain = (id: string) => {
    setImages((curr) => {
      const i = curr.findIndex((it) => it.id === id);
      if (i <= 0) return curr;
      const next = [...curr];
      const [item] = next.splice(i, 1);
      next.unshift(item);
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
      if (mode.kind === "create") {
        const created = await adminApi.createProduct(built);
        productId = created.id;
      } else {
        await adminApi.updateProduct(mode.productId, built as UpdateProductBody);
        productId = mode.productId;
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
          setErrorMsg(
            readableError(err) +
            "\nThe product saved, but variants failed to save. Edit the product to retry.",
          );
          return;
        }
      }

      if (mode.kind === "create") {
        setCreatedId(productId);
        // Scroll to coupon section after React re-renders
        setTimeout(() => {
          couponSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } else {
        router.replace("/admin/products");
        router.refresh();
      }
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
              return isPhone ? (
                <PhoneSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} isIPhone={isIPhone} onIsIPhoneChange={setIsIPhone} />
              ) : isTv ? (
                <TvSpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              ) : (
                <SpecsEditor rows={specRows} onChange={setSpecRows} disabled={busy} />
              );
            })()}
          </section>


          {showVariants && (() => {
            const catSlug = categories.find((c) => c.id === form.categoryId)?.slug;
            // Key includes catSlug so the editor remounts once categories load,
            // ensuring isTV/isCamera are correct when initRows/initColorImages run.
            const editorKey = `${isEdit ? mode.productId : "new"}-${catSlug ?? ""}`;
            return (
              <ProductVariantsEditor
                key={editorKey}
                ref={variantsRef}
                productName={form.name}
                initialVariants={isEdit ? mode.initial.variants : []}
                disabled={busy}
                categorySlug={catSlug}
                hideRam={isIPhone}
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
              initialCoupons={isEdit ? mode.initial.coupons : {}}
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
  "RAM", "ROM",
  "Height", "Width", "Depth", "Weight",
  "Battery",
  "Front Camera", "Rear Camera",
  "Processor",
]);

type PhoneSpecGroup = {
  label: string;
  icon: string;
  fields: { key: string; placeholder: string; unit?: string }[];
};

const PHONE_SPEC_GROUPS: PhoneSpecGroup[] = [
  {
    label: "Display",
    icon: "📱",
    fields: [
      { key: "Display Size", placeholder: "e.g. 6.8 inches", unit: "inches" },
      { key: "Resolution", placeholder: "e.g. 2400 × 1080 px" },
      { key: "Screen Type", placeholder: "e.g. AMOLED, 120Hz" },
    ],
  },
  {
    label: "Memory",
    icon: "💾",
    fields: [
      { key: "RAM", placeholder: "e.g. 8 GB", unit: "GB" },
      { key: "ROM", placeholder: "e.g. 128 GB", unit: "GB" },
    ],
  },
  {
    label: "Dimensions",
    icon: "📐",
    fields: [
      { key: "Height", placeholder: "e.g. 163.4 mm", unit: "mm" },
      { key: "Width", placeholder: "e.g. 77.8 mm", unit: "mm" },
      { key: "Depth", placeholder: "e.g. 8.2 mm", unit: "mm" },
      { key: "Weight", placeholder: "e.g. 214 g", unit: "g" },
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
      { key: "Rear Camera", placeholder: "e.g. 50 MP + 8 MP + 2 MP" },
      { key: "Front Camera", placeholder: "e.g. 32 MP" },
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
  isIPhone,
  onIsIPhoneChange,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  disabled: boolean;
  isIPhone: boolean;
  onIsIPhoneChange: (v: boolean) => void;
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
          {group.label === "Memory" && (
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isIPhone}
                onChange={(e) => onIsIPhoneChange(e.target.checked)}
                className="w-4 h-4 accent-[#129cd3]"
                disabled={disabled}
              />
              <span className="text-sm text-gray-600 font-medium">
                Is this an iPhone?{" "}
                <span className="text-xs text-gray-400">(RAM field will be hidden)</span>
              </span>
            </label>
          )}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Group header */}
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-base leading-none">{group.icon}</span>
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{group.label}</span>
          </div>
          {/* Fields */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.fields.filter((field) => !(isIPhone && group.label === "Memory" && field.key === "RAM")).map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {field.key}
                </label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                  <input
                    value={get(field.key)}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={disabled}
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

const TV_SPEC_KEYS = new Set([
  "Screen Size", "Color", "Model Name", "Display Technology", "Resolution",
  "Operating System", "Product Dimensions", "Aspect Ratio", "Refresh Rate",
  "Connectivity Technology", "Special Feature", "Included Components",
  "Country of Origin", "Launch Year",
  "Power Consumption", "Line Voltage",
]);

const TV_SPEC_GROUPS: PhoneSpecGroup[] = [
  {
    label: "Display",
    icon: "📺",
    fields: [
      { key: "Screen Size", placeholder: "e.g. 43 inches / 108 cm", unit: "inch" },
      { key: "Display Technology", placeholder: "e.g. LED, QLED, OLED" },
      { key: "Resolution", placeholder: "e.g. 3840 × 2160 (4K Ultra HD)" },
      { key: "Aspect Ratio", placeholder: "e.g. 16:9" },
      { key: "Refresh Rate", placeholder: "e.g. 60 Hz", unit: "Hz" },
    ],
  },
  {
    label: "General",
    icon: "📋",
    fields: [
      { key: "Operating System", placeholder: "e.g. Tizen OS 8.0, Android TV 11" },
      { key: "Country of Origin", placeholder: "e.g. India" },
    ],
  },
  {
    label: "Connectivity",
    icon: "🔌",
    fields: [
      { key: "Connectivity Technology", placeholder: "e.g. Wi-Fi, Bluetooth 5.0, HDMI, USB" },
    ],
  },
  {
    label: "Dimensions",
    icon: "📐",
    fields: [
      { key: "Product Dimensions", placeholder: "e.g. 97.2 × 56.2 × 7.4 cm (without stand)", unit: "cm" },
    ],
  },
  {
    label: "Features & Contents",
    icon: "⭐",
    fields: [
      { key: "Special Feature", placeholder: "e.g. Dolby Atmos, HDR10+, Voice Remote" },
      { key: "Included Components", placeholder: "e.g. TV, Remote Control, Power Cable, Stand" },
    ],
  },
  {
    label: "Power",
    icon: "⚡",
    fields: [
      { key: "Power Consumption", placeholder: "e.g. 289.08 Watts", unit: "Watts" },
      { key: "Line Voltage", placeholder: "e.g. 100-240 VAC 50-60 Hz" },
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

  const extraRows = rows.filter((r) => !TV_SPEC_KEYS.has(r.key));
  const setExtraRows = (next: SpecRow[]) => {
    onChange([...rows.filter((r) => TV_SPEC_KEYS.has(r.key)), ...next]);
  };

  return (
    <div className="space-y-4">
      {TV_SPEC_GROUPS.map((group) => (
        <div key={group.label} className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-base leading-none">{group.icon}</span>
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{group.label}</span>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.fields.map((field) => (
              <div key={field.key} className={`flex flex-col gap-1 ${group.fields.length === 1 ? "sm:col-span-2" : ""}`}>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {field.key}
                </label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#129cd3] transition-colors">
                  <input
                    value={get(field.key)}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={disabled}
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
      ))}

      {/* Additional free-form specs */}
      <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Specs</p>
        <SpecsEditor rows={extraRows} onChange={setExtraRows} disabled={disabled} />
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
