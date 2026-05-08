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
  ChevronLeft,
  ImagePlus,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { adminApi, isApiError, s3Put } from "@/lib/api";
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

type PendingImage = {
  id: string; // local id for React keys
  file: File;
  previewUrl: string;
};

// ── Phone-only option presets ─────────────────────────────────────────────
// Stored on the product `specs` field (§7.4 specs is a free-form
// Record<string, unknown>, so arrays of strings are fine).
const RAM_PRESETS = ["4GB", "6GB", "8GB", "12GB", "16GB", "32GB"];
const STORAGE_PRESETS = [
  "32GB",
  "64GB",
  "128GB",
  "256GB",
  "512GB",
  "1TB",
];
const COLOR_PRESETS = [
  "Black",
  "White",
  "Silver",
  "Gold",
  "Rose Gold",
  "Blue",
  "Red",
  "Green",
  "Purple",
  "Pink",
  "Yellow",
];

type PhoneOptions = {
  ram: string[];
  storage: string[];
  color: string[];
};

const EMPTY_PHONE_OPTIONS: PhoneOptions = { ram: [], storage: [], color: [] };

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

// Pull phone options out of an existing specs object (edit mode).
function readPhoneOptions(specs: Record<string, unknown> | undefined | null): PhoneOptions {
  const pick = (val: unknown): string[] =>
    Array.isArray(val) ? val.map(String).filter(Boolean) : [];
  if (!specs) return EMPTY_PHONE_OPTIONS;
  return {
    ram: pick((specs as Record<string, unknown>).ramOptions),
    storage: pick((specs as Record<string, unknown>).storageOptions),
    color: pick((specs as Record<string, unknown>).colorOptions),
  };
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

  // ── Image upload state ────────────────────────────────────────────────
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingImageCount = mode.kind === "edit" ? mode.initial.images.length : 0;

  // ── Phone option state (only surfaced when category looks like phones) ─
  const [phoneOptions, setPhoneOptions] = useState<PhoneOptions>(() =>
    readPhoneOptions(initial?.specs),
  );

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      setPendingImages((curr) => {
        for (const p of curr) URL.revokeObjectURL(p.previewUrl);
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

  const totalImageCount = existingImageCount + pendingImages.length;
  const remainingSlots = Math.max(0, MAX_IMAGES - totalImageCount);

  const onPickFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImageError(null);

      const accepted: PendingImage[] = [];
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
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
        slotsLeft -= 1;
      }

      if (accepted.length > 0) {
        setPendingImages((curr) => [...curr, ...accepted]);
      }
      if (rejections.length > 0) {
        setImageError(rejections.join("\n"));
      }
      // Reset the file input so picking the same file twice still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [remainingSlots],
  );

  const removePendingImage = (id: string) => {
    setPendingImages((curr) => {
      const next = curr.filter((p) => p.id !== id);
      const removed = curr.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
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

    const stockNum = form.stock.trim() === "" ? 0 : Number(form.stock);
    if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
      return { error: "Stock must be a whole number ≥ 0." };
    }

    let specs: Record<string, unknown> | undefined;

    // Phone option chips populate specs.{ramOptions, storageOptions, colorOptions}
    // when the chosen category looks like phones.
    const phoneCategory = isPhoneCategory(form.categoryId, categories);
    if (phoneCategory) {
      const merged: Record<string, unknown> = {};
      if (phoneOptions.ram.length) merged.ramOptions = phoneOptions.ram;
      if (phoneOptions.storage.length) merged.storageOptions = phoneOptions.storage;
      if (phoneOptions.color.length) merged.colorOptions = phoneOptions.color;
      if (Object.keys(merged).length > 0) specs = merged;
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
      stock: stockNum,
      status,
    };
    if (form.slug.trim()) body.slug = form.slug.trim();
    if (form.brand.trim()) body.brand = form.brand.trim();
    if (form.hsnCode.trim()) body.hsnCode = form.hsnCode.trim();
    if (specs) body.specs = specs;
    return body;
  };

  // Upload pending images: presign → S3 PUT → confirm. Returns true on success.
  const uploadPendingImages = async (productId: string): Promise<boolean> => {
    if (pendingImages.length === 0) return true;
    const total = pendingImages.length;
    setUploadProgress({ current: 0, total });
    const uploadedKeys: string[] = [];
    try {
      for (let i = 0; i < pendingImages.length; i++) {
        const item = pendingImages[i];
        setUploadProgress({ current: i + 1, total });
        const presigned = await adminApi.presignProductImage(productId, {
          contentType: item.file.type as ProductImageContentType,
          contentLength: item.file.size,
        });
        await s3Put(presigned.uploadUrl, item.file);
        uploadedKeys.push(presigned.objectKey);
      }
      // Append by default — matches the doc: replace=false (default).
      await adminApi.confirmProductImages(productId, {
        objectKeys: uploadedKeys,
      });
      return true;
    } catch (err) {
      setErrorMsg(readableError(err));
      return false;
    } finally {
      setUploadProgress(null);
    }
  };

  const submit = async (status: ProductStatus) => {
    setErrorMsg(null);
    const built = buildBody(status);
    if ("error" in built) {
      setErrorMsg(built.error);
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

      const imagesOk = await uploadPendingImages(productId);
      if (!imagesOk) {
        // The product itself saved fine — nudge the user to retry images
        // from the product editor instead of blocking the save outright.
        setErrorMsg(
          (errorMsg ?? "") +
            "\nThe product was saved, but image upload failed. Edit the product to retry.",
        );
        // Still clear pending so future submits don't re-upload.
        setPendingImages([]);
        return;
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

  const showPhoneOptions = useMemo(
    () => isPhoneCategory(form.categoryId, categories),
    [form.categoryId, categories],
  );

  const togglePhoneOption = (
    group: keyof PhoneOptions,
    value: string,
  ) => {
    setPhoneOptions((prev) => {
      const current = prev[group];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [group]: next };
    });
  };

  const addCustomPhoneOption = (
    group: keyof PhoneOptions,
    raw: string,
  ) => {
    const value = raw.trim();
    if (!value) return;
    setPhoneOptions((prev) =>
      prev[group].includes(value)
        ? prev
        : { ...prev, [group]: [...prev[group], value] },
    );
  };

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

            {isEdit && existingImageCount > 0 && (
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {existingImageCount}{" "}
                {existingImageCount === 1 ? "image already" : "images already"}{" "}
                attached. New uploads will be appended to the existing list.
              </div>
            )}

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

              {pendingImages.map((p, i) => (
                <div
                  key={p.id}
                  className="aspect-square relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100 group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(p.id)}
                    disabled={busy}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-gray-600 hover:text-red-500 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                    aria-label="Remove image"
                    title="Remove image"
                  >
                    <X size={14} />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[10px] px-2 py-1 truncate">
                    #{existingImageCount + i + 1} · {fileSizeLabel(p.file.size)}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400">
              {mode.kind === "create"
                ? "Images upload to S3 right after the product is created."
                : "New images will be uploaded and appended when you save."}
            </p>
          </section>

          {showPhoneOptions && (
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Phone options</h3>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Pick the RAM, Storage, and Color choices this phone is sold in.
                  Stored on the product&apos;s <code className="font-mono text-[11px] bg-gray-100 px-1 rounded">specs</code>{" "}
                  as <code className="font-mono text-[11px] bg-gray-100 px-1 rounded">ramOptions</code>,{" "}
                  <code className="font-mono text-[11px] bg-gray-100 px-1 rounded">storageOptions</code>,{" "}
                  <code className="font-mono text-[11px] bg-gray-100 px-1 rounded">colorOptions</code>.
                </p>
              </div>

              <PhoneOptionRow
                label="RAM"
                presets={RAM_PRESETS}
                values={phoneOptions.ram}
                onToggle={(v) => togglePhoneOption("ram", v)}
                onAddCustom={(v) => addCustomPhoneOption("ram", v)}
                placeholder="Add custom RAM (e.g. 24GB)"
              />
              <PhoneOptionRow
                label="Storage"
                presets={STORAGE_PRESETS}
                values={phoneOptions.storage}
                onToggle={(v) => togglePhoneOption("storage", v)}
                onAddCustom={(v) => addCustomPhoneOption("storage", v)}
                placeholder="Add custom storage (e.g. 2TB)"
              />
              <PhoneOptionRow
                label="Color"
                presets={COLOR_PRESETS}
                values={phoneOptions.color}
                onToggle={(v) => togglePhoneOption("color", v)}
                onAddCustom={(v) => addCustomPhoneOption("color", v)}
                placeholder="Add custom color (e.g. Titanium)"
              />
            </section>
          )}


          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm">Pricing &amp; Inventory</h3>
            <div className="grid grid-cols-2 gap-4">
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
                  Rupees. Up to 2 decimal places.
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

          {!isEdit && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Variants attach to a product after it&apos;s saved. Save this
                product first, then add variants from the editor.
              </span>
            </div>
          )}

          {isEdit && mode.initial.variants.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 text-sm mb-3">
                Variants ({mode.initial.variants.length})
              </h3>
              <div className="divide-y divide-gray-100">
                {mode.initial.variants.map((v) => (
                  <div
                    key={v.id}
                    className="py-2.5 flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="font-mono text-xs text-gray-700">{v.sku}</p>
                      <p className="text-[11px] text-gray-400">
                        Stock: {v.stock} ·{" "}
                        {v.priceOverride != null
                          ? `Override ₹${v.priceOverride.toLocaleString("en-IN")}`
                          : "Uses base price"}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {Object.entries(v.attributes)
                        .map(([k, val]) => `${k}: ${String(val)}`)
                        .join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
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

function PhoneOptionRow({
  label,
  presets,
  values,
  onToggle,
  onAddCustom,
  placeholder,
}: {
  label: string;
  presets: string[];
  values: string[];
  onToggle: (value: string) => void;
  onAddCustom: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const customValues = values.filter((v) => !presets.includes(v));
  const allOptions = [...presets, ...customValues];

  const submitCustom = () => {
    if (!draft.trim()) return;
    onAddCustom(draft);
    setDraft("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {label}
        </p>
        <span className="text-[11px] text-gray-400">
          {values.length} selected
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {allOptions.map((opt) => {
          const active = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-[#129cd3] text-white border-[#129cd3] shadow-sm shadow-[#129cd3]/20"
                  : "bg-white text-gray-700 border-gray-200 hover:border-[#129cd3] hover:text-[#129cd3]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCustom();
            }
          }}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#129cd3]"
        />
        <button
          type="button"
          onClick={submitCustom}
          disabled={!draft.trim()}
          className="text-xs font-semibold border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3] disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
