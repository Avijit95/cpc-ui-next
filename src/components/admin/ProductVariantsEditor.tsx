"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, Star, Trash2, X } from "lucide-react";
import { adminApi } from "@/lib/api";
import { imageUrlForKey } from "@/lib/image-url";
import type { AdminVariant, ProductImageContentType } from "@/lib/api";

// Presets are suggestions only (datalist) — the merchant can type anything.
const RAM_PRESETS = ["4GB", "6GB", "8GB", "12GB", "16GB"];
const STORAGE_PRESETS = ["64GB", "128GB", "256GB", "512GB", "1TB"];

const COLOR_PRESETS = [
  "Black",
  "White",
  "Silver",
  "Gold",
  "Blue",
  "Red",
  "Green",
  "Purple",
];

const ALLOWED_TYPES: ProductImageContentType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_BYTES = 5 * 1024 * 1024;

type VariantRow = {
  uid: string;
  existingId?: string;
  ram: string;
  storage: string;    // ROM (phone) | Lens Name (camera) | Model No. (TV)
  color: string;
  launchYear: string;   // TV + Camera
  lensIncluded: string; // Camera only: "Yes" | "No"
  dimensions: string;       // TV only: legacy single-dimension field
  weight: string;           // TV only: e.g. "4.5 kg"
  dimWithStand: string;     // TV only: W×H×D with stand, e.g. "97.2 × 62.5 × 21.3 cm"
  dimWithoutStand: string;  // TV only: W×H×D without stand, e.g. "97.2 × 56.2 × 7.4 cm"
  stock: string;
  base: string;      // MRP (struck price); blank = no separate MRP
  price: string;     // selling price (GST-inclusive); blank = use product base price
  gst: string;       // GST % (default 18)
  gstAmount: string; // auto-calc: selling × gst / (100 + gst), read-only display
  netBase: string;   // auto-calc: selling − gstAmount (base price excl. GST), read-only display
};

// A color's images are one ordered list.
// defaultId marks the featured image shown first in the storefront.
// Existing items carry the saved S3 key; pending items carry a local File.
type ColorImageItem =
  | { id: string; kind: "existing"; key: string; url: string | null }
  | { id: string; kind: "pending"; file: File; previewUrl: string };
type ColorImages = { items: ColorImageItem[]; defaultId: string | null };

export type ProductVariantsHandle = {
  // Returns an error message, or null when the rows are valid.
  validate: () => string | null;
  // Uploads per-color images then creates/updates/deletes variants to match the rows.
  commit: (productId: string) => Promise<void>;
  // True when at least one variant row exists.
  hasRows: () => boolean;
  // Returns the minimum selling price across all variant rows (0 if none set).
  getMinSellingPrice: () => number;
  // Draft persistence — get current rows for saving, set rows when restoring.
  getRows: () => unknown[];
  setRows: (rows: unknown[]) => void;
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugifyPart(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isCameraCategory(slug?: string): boolean {
  return !!slug && slug.toLowerCase().includes("camera");
}

function isLensCategory(slug?: string): boolean {
  return !!slug && slug.toLowerCase().includes("lens");
}

function isTvCategory(slug?: string): boolean {
  return !!slug && (slug.toLowerCase().includes("tv") || slug.toLowerCase().includes("television"));
}

function isSpeakerCategory(slug?: string): boolean {
  return !!slug && slug.toLowerCase().includes("speaker");
}

const TV_SIZE_PRESETS = ["32\"", "43\"", "50\"", "55\"", "65\"", "75\"", "85\""];

function makeSku(name: string, r: VariantRow, isCamera: boolean): string {
  const base = slugifyPart(name) || "variant";
  const parts = isCamera
    ? [r.ram, r.color, r.launchYear, r.lensIncluded === "Yes" ? r.storage : ""]
    : [r.ram, r.storage, r.color];
  const tail = parts.map(slugifyPart).filter(Boolean).join("-");
  const full = tail ? `${base}-${tail}` : base;
  return full.slice(0, 80);
}

function comboKey(r: VariantRow, isCamera: boolean): string {
  if (isCamera) {
    // Lens name (storage) distinguishes variants when lensIncluded=Yes.
    const lensKey = r.lensIncluded === "Yes" ? r.storage.trim() : "";
    return `${r.ram.trim()}|${r.color.trim()}|${r.launchYear.trim()}|${r.lensIncluded.trim()}|${lensKey}`.toLowerCase();
  }
  return `${r.ram.trim()}|${r.storage.trim()}|${r.color.trim()}`.toLowerCase();
}

// For cameras images are grouped by body color / lens; for TVs by size+color; lens by model+color; all others by color.
function imageGroupKey(r: VariantRow, isTV: boolean, isCamera: boolean, isLens = false): string {
  if (isCamera) {
    if (r.lensIncluded === "Yes" && r.storage.trim()) return `Lens: ${r.storage.trim()}`;
    const color = r.color.trim();
    return color ? `Camera: ${color}` : "Camera";
  }
  if (isLens) {
    const model = r.ram.trim();
    const color = r.color.trim();
    if (model && color) return `${model} / ${color}`;
    return model || color || "Lens";
  }
  if (isTV) {
    const size = r.ram.trim();
    const color = r.color.trim();
    if (size && color) return `${size} / ${color}`;
    return size || color || "";
  }
  return r.color.trim();
}

function buildAttributes(r: VariantRow, isCamera: boolean, isTV: boolean, isSpeaker: boolean, isLens = false): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (isCamera) {
    if (r.ram.trim()) a.model = r.ram.trim();
    if (r.launchYear.trim()) a.launchYear = r.launchYear.trim();
    a.lensIncluded = r.lensIncluded || "No";
    if (r.lensIncluded === "Yes" && r.storage.trim()) a.lens = r.storage.trim();
  } else if (isTV) {
    if (r.ram.trim()) a.size = r.ram.trim();
    if (r.storage.trim()) a.model = r.storage.trim();
    if (r.launchYear.trim()) a.launchYear = r.launchYear.trim();
    if (r.dimensions.trim()) a.dimensions = r.dimensions.trim();
    if (r.weight.trim()) a.weight = r.weight.trim();
    if (r.dimWithStand.trim()) a.dimWithStand = r.dimWithStand.trim();
    if (r.dimWithoutStand.trim()) a.dimWithoutStand = r.dimWithoutStand.trim();
  } else if (isSpeaker) {
    if (r.ram.trim()) a.model = r.ram.trim();
    if (r.storage.trim()) a.watt = r.storage.trim();
  } else if (isLens) {
    if (r.ram.trim()) a.model = r.ram.trim();
  } else {
    if (r.ram.trim()) a.ram = r.ram.trim();
    if (r.storage.trim()) a.storage = r.storage.trim();
  }
  if (r.color.trim()) a.color = r.color.trim();
  return a;
}

function calcGstFields(selling: string, gst: string): { gstAmount: string; netBase: string } {
  const s = Number(selling);
  const g = Number(gst);
  if (!selling.trim() || isNaN(s) || s <= 0 || isNaN(g) || g < 0) {
    return { gstAmount: "", netBase: "" };
  }
  const gstAmount = (s * g) / (100 + g);
  const netBase = s - gstAmount;
  return { gstAmount: gstAmount.toFixed(2), netBase: netBase.toFixed(2) };
}

function initRows(variants: AdminVariant[], isCamera: boolean, isTV: boolean, isSpeaker: boolean, isLens = false): VariantRow[] {
  return variants.map((v) => {
    const base = v.basePrice != null ? String(v.basePrice) : "";
    const price = v.priceOverride != null ? String(v.priceOverride) : "";
    const gst = "18";
    const { gstAmount, netBase } = calcGstFields(price, gst);
    // Camera → model/lens; TV → size/model; Speaker → model/watt; Lens → model (fallback ram); default → ram/storage.
    const ramVal = isCamera
      ? (v.attributes.model != null ? String(v.attributes.model) : "")
      : isTV
      ? (v.attributes.size != null ? String(v.attributes.size) : "")
      : isSpeaker
      ? (v.attributes.model != null ? String(v.attributes.model) : "")
      : isLens
      ? (v.attributes.model != null ? String(v.attributes.model) : v.attributes.ram != null ? String(v.attributes.ram) : "")
      : (v.attributes.ram != null ? String(v.attributes.ram) : "");
    const storageVal = isCamera
      ? (v.attributes.lens != null ? String(v.attributes.lens) : "")
      : isTV
      ? (v.attributes.model != null ? String(v.attributes.model) : "")
      : isSpeaker
      ? (v.attributes.watt != null ? String(v.attributes.watt) : "")
      : (v.attributes.storage != null ? String(v.attributes.storage) : "");
    const lensIncluded = isCamera
      ? (v.attributes.lensIncluded != null ? String(v.attributes.lensIncluded) : "No")
      : "";
    return {
      uid: uid(),
      existingId: v.id,
      ram: ramVal,
      storage: storageVal,
      color: v.attributes.color != null ? String(v.attributes.color) : "",
      launchYear: (isTV || isCamera) && v.attributes.launchYear != null ? String(v.attributes.launchYear) : "",
      lensIncluded,
      dimensions: isTV && v.attributes.dimensions != null ? String(v.attributes.dimensions) : "",
      weight: isTV && v.attributes.weight != null ? String(v.attributes.weight) : "",
      dimWithStand: isTV && v.attributes.dimWithStand != null ? String(v.attributes.dimWithStand) : "",
      dimWithoutStand: isTV && v.attributes.dimWithoutStand != null ? String(v.attributes.dimWithoutStand) : "",
      stock: String(v.stock ?? 0),
      base,
      price,
      gst,
      gstAmount,
      netBase,
    };
  });
}

// Variants sharing the same group key share one image set — take the first non-empty.
// Camera: grouped by body/lens; TV: grouped by size+color; lens by model+color; all others: grouped by color.
function initColorImages(variants: AdminVariant[], isTV: boolean, isCamera: boolean, isLens = false): Record<string, ColorImages> {
  const map: Record<string, ColorImages> = {};
  for (const v of variants) {
    let groupKey: string;
    if (isCamera) {
      const lensName = v.attributes.lens != null ? String(v.attributes.lens).trim() : "";
      if (v.attributes.lensIncluded === "Yes" && lensName) {
        groupKey = `Lens: ${lensName}`;
      } else {
        const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
        groupKey = color ? `Camera: ${color}` : "Camera";
      }
    } else if (isLens) {
      const model = v.attributes.ram != null ? String(v.attributes.ram).trim() : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      groupKey = model && color ? `${model} / ${color}` : model || color || "";
    } else if (isTV) {
      const size = v.attributes.size != null ? String(v.attributes.size).trim() : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      groupKey = size && color ? `${size} / ${color}` : size || color || "";
    } else {
      groupKey = v.attributes.color != null ? String(v.attributes.color).trim() : "";
    }
    if (!groupKey) continue;
    if (!map[groupKey]) map[groupKey] = { items: [], defaultId: null };
    if (map[groupKey].items.length === 0 && v.imagesObjectKeys.length > 0) {
      const items = v.imagesObjectKeys.map((key) => ({
        id: uid(),
        kind: "existing" as const,
        key,
        url: imageUrlForKey(key),
      }));
      // First key saved in DB is the default (storefront featured image).
      map[groupKey] = { items, defaultId: items[0]?.id ?? null };
    }
  }
  return map;
}

const ProductVariantsEditor = forwardRef<
  ProductVariantsHandle,
  { productName: string; initialVariants: AdminVariant[]; disabled: boolean; categorySlug?: string; hideRam?: boolean; draftRows?: unknown[] }
>(function ProductVariantsEditor({ productName, initialVariants, disabled, categorySlug, hideRam = false, draftRows }, ref) {
  const isLens = isLensCategory(categorySlug);
  const isCamera = !isLens && isCameraCategory(categorySlug);
  const isTV = isTvCategory(categorySlug);
  const isSpeaker = !isCamera && !isTV && !isLens && isSpeakerCategory(categorySlug);
  const [rows, setRows] = useState<VariantRow[]>(() => {
    if (draftRows && draftRows.length > 0) {
      return (draftRows as VariantRow[]).map((r) => ({ ...r, uid: uid(), existingId: undefined }));
    }
    return initRows(initialVariants, isCamera, isTV, isSpeaker, isLens);
  });
  const [colorImages, setColorImages] = useState<Record<string, ColorImages>>(
    () => initColorImages(initialVariants, isTV, isCamera, isLens),
  );

  // Distinct image group keys (camera: body/lens; TV: size; others: color) — drives the image uploaders.
  const colors = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const c = imageGroupKey(r, isTV, isCamera, isLens);
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }, [rows, isTV, isCamera, isLens]);

  // Revoke blob previews on unmount.
  useEffect(() => {
    return () => {
      setColorImages((curr) => {
        for (const ci of Object.values(curr)) {
          for (const it of ci.items) {
            if (it.kind === "pending") URL.revokeObjectURL(it.previewUrl);
          }
        }
        return curr;
      });
    };
  }, []);

  const updateRow = (id: string, patch: Partial<VariantRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        uid: uid(),
        ram: "",
        storage: "",
        color: "",
        launchYear: "",
        lensIncluded: isCamera ? "No" : "",
        dimensions: "",
        weight: "",
        dimWithStand: "",
        dimWithoutStand: "",
        stock: "0",
        base: "",
        price: "",
        gst: "18",
        gstAmount: "",
        netBase: "",
      },
    ]);

  const removeRow = (id: string) =>
    setRows((rs) => rs.filter((r) => r.uid !== id));

  const addImages = (color: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: ColorImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type as ProductImageContentType)) continue;
      if (file.size > MAX_BYTES) continue;
      accepted.push({
        id: uid(),
        kind: "pending",
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (accepted.length === 0) return;
    setColorImages((prev) => {
      const cur = prev[color] ?? { items: [], defaultId: null };
      const merged = [...cur.items, ...accepted];
      // Auto-set default to first image ever added.
      const defaultId = cur.defaultId ?? merged[0]?.id ?? null;
      return { ...prev, [color]: { items: merged, defaultId } };
    });
  };

  const removeImage = (color: string, id: string) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      const removed = cur.items.find((it) => it.id === id);
      if (removed?.kind === "pending") URL.revokeObjectURL(removed.previewUrl);
      const items = cur.items.filter((it) => it.id !== id);
      // If the removed image was the default, promote the new first image.
      const defaultId = cur.defaultId === id ? (items[0]?.id ?? null) : cur.defaultId;
      return { ...prev, [color]: { items, defaultId } };
    });

  const setDefaultImage = (color: string, id: string) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      return { ...prev, [color]: { ...cur, defaultId: id } };
    });

  // Move an image one slot earlier (dir -1) or later (dir +1) — its rank.
  const moveImage = (color: string, id: string, dir: -1 | 1) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      const idx = cur.items.findIndex((it) => it.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= cur.items.length) return prev;
      const items = [...cur.items];
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...prev, [color]: { ...cur, items } };
    });

  const clearColor = (color: string) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      for (const it of cur.items) {
        if (it.kind === "pending") URL.revokeObjectURL(it.previewUrl);
      }
      return { ...prev, [color]: { items: [], defaultId: null } };
    });

  useImperativeHandle(
    ref,
    () => ({
      validate: () => {
        const seen = new Set<string>();
        for (const r of rows) {
          if (!r.ram.trim() && !r.color.trim()) {
            return isCamera
              ? "Each variant needs at least one of Model No. or Color."
              : isTV
              ? "Each variant needs at least one of Size, Model No., or Color."
              : isSpeaker
              ? "Each variant needs at least one of Model No., Watt, or Color."
              : "Each variant needs at least one of RAM, ROM, or Color.";
          }
          const stockNum = Number(r.stock);
          if (
            r.stock.trim() === "" ||
            !Number.isInteger(stockNum) ||
            stockNum < 0
          ) {
            return "Each variant's stock must be a whole number ≥ 0.";
          }
          const gstNum = Number(r.gst);
          if (r.gst.trim() === "" || isNaN(gstNum) || gstNum < 0 || gstNum > 100) {
            return "GST % must be a number between 0 and 100.";
          }
          if (r.price.trim() !== "") {
            const p = Number(r.price);
            if (Number.isNaN(p) || p < 0) {
              return "Variant selling price must be a number ≥ 0 (leave blank to use the product base price).";
            }
          }
          if (r.base.trim() !== "") {
            const b = Number(r.base);
            if (Number.isNaN(b) || b < 0) {
              return "Variant MRP must be a number ≥ 0 (leave blank for no struck price).";
            }
            if (r.price.trim() !== "" && b < Number(r.price)) {
              return "MRP must be greater than or equal to the selling price.";
            }
          }
          const key = comboKey(r, isCamera);
          if (seen.has(key)) {
            return isCamera
              ? (isLens ? "Two variants have the same Model No. / Color combination." : "Two variants have the same Model No. / Color / Launch Year / Lens combination.")
              : isTV
              ? "Two variants have the same Size / Model No. / Color combination."
              : isSpeaker
              ? "Two variants have the same Model No. / Watt / Color combination."
              : "Two variants have the same RAM / ROM / Color combination.";
          }
          seen.add(key);
        }
        return null;
      },
      hasRows: () => rows.length > 0,
      getRows: () => rows as unknown[],
      setRows: (newRows: unknown[]) => setRows(
        (newRows as VariantRow[]).map((r) => ({ ...r, uid: uid(), existingId: undefined }))
      ),
      getMinSellingPrice: () => {
        const prices = rows.map((r) => Number(r.price)).filter((n) => !isNaN(n) && n > 0);
        return prices.length > 0 ? Math.min(...prices) : 0;
      },
      commit: async (productId: string) => {
        // 1. Resolve each group's images — uploading pending files, then
        //    reorder so the chosen default image comes first.
        //    Image upload failures (e.g. S3 unreachable in dev) are non-fatal:
        //    only successfully uploaded keys are kept so variant creation proceeds.
        const finalKeys: Record<string, string[]> = {};
        for (const color of colors) {
          const ci = colorImages[color] ?? { items: [], defaultId: null };
          const resolved: { id: string; key: string }[] = [];
          for (const it of ci.items) {
            if (it.kind === "existing") {
              resolved.push({ id: it.id, key: it.key });
            } else {
              try {
                const { objectKey } = await adminApi.uploadProductImage(
                  productId,
                  it.file,
                );
                resolved.push({ id: it.id, key: objectKey });
              } catch {
                // Skip this image — S3 may not be configured in this environment.
                // The variant will be saved without it; images can be re-added on edit.
              }
            }
          }
          // Put the default image first; keep all others in display order.
          const defaultIdx = resolved.findIndex((r) => r.id === ci.defaultId);
          if (defaultIdx > 0) {
            const [def] = resolved.splice(defaultIdx, 1);
            resolved.unshift(def);
          }
          finalKeys[color] = resolved.map((r) => r.key);
        }

        // 2. Create or update each row.
        const keptIds = new Set<string>();
        for (const r of rows) {
          const body = {
            sku: makeSku(productName, r, isCamera),
            attributes: buildAttributes(r, isCamera, isTV, isSpeaker, isLens),
            basePrice: r.base.trim() === "" ? null : Number(r.base),
            priceOverride: r.price.trim() === "" ? null : Number(r.price),
            stock: Number(r.stock),
            imagesObjectKeys: finalKeys[imageGroupKey(r, isTV, isCamera, isLens)] ?? [],
          };
          if (r.existingId && initialVariants.some((v) => v.id === r.existingId)) {
            keptIds.add(r.existingId);
            await adminApi.updateVariant(productId, r.existingId, body);
          } else {
            await adminApi.createVariant(productId, body);
          }
        }

        // 3. Delete variants that were removed from the editor.
        for (const v of initialVariants) {
          if (!keptIds.has(v.id)) {
            await adminApi.deleteVariant(productId, v.id);
          }
        }
      },
    }),
    [rows, colors, colorImages, productName, initialVariants, isCamera, isTV, isSpeaker],
  );

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div>
        <h3 className="font-bold text-gray-800 text-sm">Variants</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">
          {isLens
            ? "Add each Model No. / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price."
            : isCamera
            ? "Add each Model No. / Color / Launch Year combination. Select Lens Included — if yes, enter the lens name. Stock and prices are per variant. Images: Camera: [Color] sections for body-only variants per color, Lens sections for each included lens."
            : isTV
            ? "Add each Size / Model No. / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price. Images are shared per size."
            : isSpeaker
            ? "Add each Model No. / Watt / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price. Images are shared per color."
            : hideRam
            ? "Add each ROM / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price. Images are shared per color."
            : "Add each RAM / ROM / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price. Images are shared per color."}
        </p>
      </div>

      {/* Datalists shared by every row */}
      {!isCamera && (
        <>
          {isTV ? (
            <datalist id="variant-tv-size-presets">
              {TV_SIZE_PRESETS.map((o) => <option key={o} value={o} />)}
            </datalist>
          ) : !hideRam && (
            <datalist id="variant-ram-presets">
              {RAM_PRESETS.map((o) => <option key={o} value={o} />)}
            </datalist>
          )}
          {!isTV && (
            <datalist id="variant-storage-presets">
              {STORAGE_PRESETS.map((o) => <option key={o} value={o} />)}
            </datalist>
          )}
        </>
      )}
      <datalist id="variant-color-presets">
        {COLOR_PRESETS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      {/* Variant rows */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-[12px] text-gray-400">No variants yet. Add one below.</p>
        )}
        {rows.map((r) => isTV ? (
          /* ── TV: multi-row card ───────────────────────────────── */
          <div key={r.uid} className="border border-gray-200 rounded-xl p-3 bg-white space-y-3">
            {/* Row 1: Size + Model No. + delete */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <Field label="Size (inch)">
                <input
                  value={r.ram}
                  onChange={(e) => updateRow(r.uid, { ram: e.target.value })}
                  list="variant-tv-size-presets"
                  placeholder='e.g. 43'
                  disabled={disabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
              <Field label="Model No.">
                <input
                  value={r.storage}
                  onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                  placeholder="e.g. UA43CUE60BKLXL"
                  disabled={disabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
              <button
                type="button"
                onClick={() => removeRow(r.uid)}
                disabled={disabled}
                className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-40"
                aria-label="Remove variant"
                title="Remove variant"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {/* Row 2: Dimensions + Weight + Launch Year (shown once size or model is entered) */}
            {(r.ram.trim() || r.storage.trim()) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="W×H×D (without stand)">
                  <input
                    value={r.dimWithoutStand}
                    onChange={(e) => updateRow(r.uid, { dimWithoutStand: e.target.value })}
                    placeholder='e.g. 972.4 × 562.8 × 74.2 mm'
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="W×H×D (with stand)">
                  <input
                    value={r.dimWithStand}
                    onChange={(e) => updateRow(r.uid, { dimWithStand: e.target.value })}
                    placeholder='e.g. 972.4 × 625.0 × 213.3 mm'
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="Weight">
                  <input
                    value={r.weight}
                    onChange={(e) => updateRow(r.uid, { weight: e.target.value })}
                    placeholder='e.g. 4.5 kg'
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="Launch Year">
                  <select
                    value={r.launchYear}
                    onChange={(e) => updateRow(r.uid, { launchYear: e.target.value })}
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] bg-white"
                  >
                    <option value="">— Year —</option>
                    {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => 2023 + i).map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {/* Row 3: Color + Stock + MRP + Selling + GST% + GST Amt + Base */}
            {(r.ram.trim() || r.storage.trim()) && (
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
                <Field label="Color">
                  <input
                    value={r.color}
                    onChange={(e) => updateRow(r.uid, { color: e.target.value })}
                    list="variant-color-presets"
                    placeholder="e.g. Black"
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="Stock">
                  <input
                    type="number" min={0} step={1}
                    value={r.stock}
                    onChange={(e) => updateRow(r.uid, { stock: e.target.value })}
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="MRP (₹)">
                  <input
                    type="number" min={0} step="0.01"
                    value={r.base}
                    onChange={(e) => updateRow(r.uid, { base: e.target.value })}
                    placeholder="0"
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="Selling (₹)">
                  <input
                    type="number" min={0} step="0.01"
                    value={r.price}
                    onChange={(e) => {
                      const price = e.target.value;
                      updateRow(r.uid, { price, ...calcGstFields(price, r.gst) });
                    }}
                    placeholder="= MRP"
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="GST (%)">
                  <input
                    type="number" min={0} max={100} step="0.1"
                    value={r.gst}
                    onChange={(e) => {
                      const gst = e.target.value;
                      updateRow(r.uid, { gst, ...calcGstFields(r.price, gst) });
                    }}
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="GST Amt (₹)">
                  <input
                    type="number" value={r.gstAmount} readOnly tabIndex={-1} placeholder="auto"
                    className="w-full border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm text-gray-500 cursor-default outline-none"
                  />
                </Field>
                <Field label="Base (₹)">
                  <input
                    type="number" value={r.netBase} readOnly tabIndex={-1} placeholder="auto"
                    className="w-full border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm text-gray-500 cursor-default outline-none"
                  />
                </Field>
              </div>
            )}
          </div>
        ) : (
          /* ── non-TV: existing compact grid ───────────────────── */
          <div
            key={r.uid}
            className={`grid grid-cols-2 gap-2 items-end border border-gray-100 rounded-lg p-2.5 ${
              isLens
                ? "sm:grid-cols-[repeat(8,1fr)_auto]"
                : isCamera
                ? r.lensIncluded === "Yes" ? "sm:grid-cols-[repeat(11,1fr)_auto]" : "sm:grid-cols-[repeat(10,1fr)_auto]"
                : !hideRam
                ? "sm:grid-cols-[repeat(9,1fr)_auto]"
                : "sm:grid-cols-[repeat(8,1fr)_auto]"
            }`}
          >
            {(isCamera || isLens) ? (
              <>
                <Field label="Model No.">
                  <input
                    value={r.ram}
                    onChange={(e) => updateRow(r.uid, { ram: e.target.value })}
                    placeholder="e.g. EOS R50"
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                <Field label="Color">
                  <input
                    value={r.color}
                    onChange={(e) => updateRow(r.uid, { color: e.target.value })}
                    list="variant-color-presets"
                    placeholder="e.g. Black"
                    disabled={disabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                {!isLens && (
                  <>
                    <Field label="Launch Year">
                      <select
                        value={r.launchYear}
                        onChange={(e) => updateRow(r.uid, { launchYear: e.target.value })}
                        disabled={disabled}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] bg-white"
                      >
                        <option value="">— Year —</option>
                        {Array.from({ length: new Date().getFullYear() - 2018 }, (_, i) => 2019 + i).map((y) => (
                          <option key={y} value={String(y)}>{y}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Lens Included">
                      <select
                        value={r.lensIncluded || "No"}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateRow(r.uid, { lensIncluded: val, storage: val === "No" ? "" : r.storage });
                        }}
                        disabled={disabled}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] bg-white"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </Field>
                    {r.lensIncluded === "Yes" && (
                      <Field label="Lens Name">
                        <input
                          value={r.storage}
                          onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                          placeholder="e.g. 18-55mm f/3.5-5.6"
                          disabled={disabled}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                        />
                      </Field>
                    )}
                  </>
                )}
              </>
            ) : !hideRam ? (
              <Field label={isSpeaker ? "Model No." : "RAM"}>
                <input
                  value={r.ram}
                  onChange={(e) => updateRow(r.uid, { ram: e.target.value })}
                  list={isSpeaker ? undefined : "variant-ram-presets"}
                  placeholder={isSpeaker ? "e.g. JBL Charge 5" : "8GB"}
                  disabled={disabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
            ) : null}
            {!isCamera && !isLens && (
              <Field label={isSpeaker ? "Watt" : "ROM"}>
                <input
                  value={r.storage}
                  onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                  list={isSpeaker ? undefined : "variant-storage-presets"}
                  placeholder={isSpeaker ? "e.g. 30W" : "128GB"}
                  disabled={disabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
            )}
            {!isCamera && !isLens && (
              <Field label="Color">
                <input
                  value={r.color}
                  onChange={(e) => updateRow(r.uid, { color: e.target.value })}
                  list="variant-color-presets"
                  placeholder="Red"
                  disabled={disabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
            )}
            <Field label="Stock">
              <input
                type="number" min={0} step={1}
                value={r.stock}
                onChange={(e) => updateRow(r.uid, { stock: e.target.value })}
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="MRP (₹)">
              <input
                type="number" min={0} step="0.01"
                value={r.base}
                onChange={(e) => updateRow(r.uid, { base: e.target.value })}
                placeholder="0"
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="Selling (₹)">
              <input
                type="number" min={0} step="0.01"
                value={r.price}
                onChange={(e) => {
                  const price = e.target.value;
                  updateRow(r.uid, { price, ...calcGstFields(price, r.gst) });
                }}
                placeholder="= MRP"
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="GST (%)">
              <input
                type="number" min={0} max={100} step="0.1"
                value={r.gst}
                onChange={(e) => {
                  const gst = e.target.value;
                  updateRow(r.uid, { gst, ...calcGstFields(r.price, gst) });
                }}
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="GST Amt (₹)">
              <input
                type="number" value={r.gstAmount} readOnly tabIndex={-1} placeholder="auto"
                className="w-full border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm text-gray-500 cursor-default outline-none"
              />
            </Field>
            <Field label="Base (₹)">
              <input
                type="number" value={r.netBase} readOnly tabIndex={-1} placeholder="auto"
                className="w-full border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm text-gray-500 cursor-default outline-none"
              />
            </Field>
            <button
              type="button"
              onClick={() => removeRow(r.uid)}
              disabled={disabled}
              className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-40"
              aria-label="Remove variant"
              title="Remove variant"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
        >
          <Plus size={14} /> Add variant
        </button>
      </div>

      {/* Per-group images (camera: body/lens; TV: size; others: color) */}
      {colors.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700">
            {isCamera ? "Images by body / lens" : isTV ? "Images by size & color" : "Images by color"}
          </p>
          {colors.map((color) => {
            const ci = colorImages[color] ?? { items: [], defaultId: null };
            const count = ci.items.length;
            return (
              <div key={color}>
                <div className="flex items-center gap-3 mb-1.5">
                  <p className="text-[11px] font-semibold text-gray-600">{color}</p>
                  {count > 0 && (
                    <span className="text-[11px] text-gray-400">
                      {count} image{count === 1 ? "" : "s"} · ★ to set default ·{" "}
                      <button
                        type="button"
                        onClick={() => clearColor(color)}
                        disabled={disabled}
                        className="text-red-500 hover:underline disabled:opacity-50"
                      >
                        Clear all
                      </button>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <label
                    className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
                      disabled
                        ? "border-gray-100 text-gray-300"
                        : "border-gray-200 text-gray-400 hover:border-[#129cd3] hover:text-[#129cd3] cursor-pointer"
                    }`}
                  >
                    <ImagePlus size={18} />
                    <span className="text-[10px] mt-1 font-semibold">Add</span>
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(",")}
                      multiple
                      className="hidden"
                      disabled={disabled}
                      onChange={(e) => {
                        addImages(color, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {ci.items.map((it, idx) => {
                    const src = it.kind === "existing" ? it.url : it.previewUrl;
                    const isDefault = ci.defaultId === it.id;
                    return (
                      <div
                        key={it.id}
                        className={`aspect-square relative rounded-lg overflow-hidden bg-gray-50 group ${
                          isDefault
                            ? "border-2 border-[#129cd3]"
                            : "border border-gray-100"
                        }`}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={color}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                            saved
                          </div>
                        )}
                        {/* Position badge */}
                        <span className="absolute top-1 left-1 min-w-[20px] h-5 px-1 rounded-full bg-black/60 text-white text-[10px] font-semibold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        {/* Default badge */}
                        {isDefault && (
                          <span className="absolute bottom-1 left-1 px-1.5 h-4 rounded-full bg-[#129cd3] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                            Default
                          </span>
                        )}
                        {/* Set default star button */}
                        <button
                          type="button"
                          onClick={() => setDefaultImage(color, it.id)}
                          disabled={disabled || isDefault}
                          className={`absolute top-1 right-1 w-6 h-6 rounded-full shadow flex items-center justify-center transition-opacity ${
                            isDefault
                              ? "bg-[#129cd3] text-white opacity-100"
                              : "bg-white/90 text-gray-400 hover:text-yellow-400 opacity-0 group-hover:opacity-100"
                          }`}
                          aria-label="Set as default image"
                          title={isDefault ? "Default image" : "Set as default"}
                        >
                          <Star size={11} fill={isDefault ? "currentColor" : "none"} />
                        </button>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeImage(color, it.id)}
                          disabled={disabled}
                          className="absolute top-8 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-red-500 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => moveImage(color, it.id, -1)}
                            disabled={disabled || idx === 0}
                            className="w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-[#129cd3] shadow flex items-center justify-center disabled:opacity-30"
                            aria-label="Move earlier"
                            title="Move earlier"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(color, it.id, 1)}
                            disabled={disabled || idx === count - 1}
                            className="w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-[#129cd3] shadow flex items-center justify-center disabled:opacity-30"
                            aria-label="Move later"
                            title="Move later"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

export default ProductVariantsEditor;
