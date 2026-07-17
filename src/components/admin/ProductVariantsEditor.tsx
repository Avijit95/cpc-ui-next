"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ImagePlus, Plus, Star, Trash2, X } from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
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
  name: string;       // TV only: per-variant product name, e.g. "Samsung 43\" Crystal 4K TV"
  ram: string;
  storage: string;    // ROM (phone) | Lens Name (camera) | Model No. (TV)
  color: string;
  launchYear: string;   // TV + Camera
  lensIncluded: string; // Camera only: "Yes" | "No"
  dimensions: string;       // TV only: legacy single-dimension field
  weight: string;           // TV only: e.g. "4.5 kg"
  dimWithStand: string;     // TV only: W×H×D with stand, e.g. "97.2 × 62.5 × 21.3 cm"
  dimWithoutStand: string;  // TV only: W×H×D without stand, e.g. "97.2 × 56.2 × 7.4 cm"
  attr1: string; // Smart Device: custom attribute 1
  attr2: string; // Smart Device: custom attribute 2
  attr3: string; // Smart Device: custom attribute 3
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

function isSmartDeviceCategory(slug?: string): boolean {
  if (!slug) return false;
  const s = slug.toLowerCase();
  return s.includes("smart") && !s.includes("tv") && !s.includes("television");
}

// Derives custom attr column names from existing saved variants (edit mode).
function initSmartDeviceAttrCols(variants: AdminVariant[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const v of variants) {
    for (const key of Object.keys(v.attributes)) {
      if (key !== "model" && key !== "color" && key !== "__gstRate" && !seen.has(key) && cols.length < 3) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

const TV_SIZE_PRESETS = ["32\"", "43\"", "50\"", "55\"", "65\"", "75\"", "85\""];

function makeSku(name: string, r: VariantRow, isCamera: boolean, isTV = false, isSmartDevice = false, attrColumns: string[] = []): string {
  let parts: string[];
  if (isCamera) {
    parts = [r.ram, r.color, r.launchYear, r.lensIncluded === "Yes" ? r.storage : ""];
  } else if (isTV) {
    parts = [r.ram, r.storage, r.launchYear, r.color];
  } else if (isSmartDevice) {
    // Include model + color + all custom attr values so variants with same model/color
    // but different watt/capacity/etc. get distinct SKUs.
    const attrVals = [r.attr1, r.attr2, r.attr3].slice(0, attrColumns.length);
    parts = [r.ram, r.color, ...attrVals];
  } else {
    parts = [r.ram, r.storage, r.color];
  }
  const tail = parts.map(slugifyPart).filter(Boolean).join("-");
  // Reserve space in the base so the tail always appears in the SKU.
  const maxBase = tail ? Math.max(20, 80 - tail.length - 1) : 80;
  // Trim trailing dashes from base to avoid double-dash when concatenating tail.
  const base = (slugifyPart(name) || "variant").slice(0, maxBase).replace(/-+$/, "");
  const full = tail ? `${base}-${tail}` : base;
  return full.slice(0, 80);
}

function comboKey(r: VariantRow, isCamera: boolean, isSmartDevice = false): string {
  if (isCamera) {
    // Lens name (storage) distinguishes variants when lensIncluded=Yes.
    const lensKey = r.lensIncluded === "Yes" ? r.storage.trim() : "";
    return `${r.ram.trim()}|${r.color.trim()}|${r.launchYear.trim()}|${r.lensIncluded.trim()}|${lensKey}`.toLowerCase();
  }
  if (isSmartDevice) {
    // Include all custom attrs so variants that differ only by watt/capacity are distinct.
    return `${r.ram.trim()}|${r.color.trim()}|${r.attr1.trim()}|${r.attr2.trim()}|${r.attr3.trim()}`.toLowerCase();
  }
  return `${r.ram.trim()}|${r.storage.trim()}|${r.color.trim()}`.toLowerCase();
}

// For cameras images are grouped by model+color+launchYear+lensIncluded+lensName; for TVs by size+color+launchYear+model; lens by model+color; smart devices by model+color+custom attrs; all others by color.
function imageGroupKey(r: VariantRow, isTV: boolean, isCamera: boolean, isLens = false, isSmartDevice = false, attrColumns: string[] = [], isSpeaker = false): string {
  if (isCamera) {
    const parts = [
      r.ram.trim(),
      r.color.trim(),
      r.launchYear.trim(),
      r.lensIncluded === "Yes" ? "WithLens" : "BodyOnly",
      r.lensIncluded === "Yes" ? r.storage.trim() : "",
    ].filter(Boolean);
    return parts.join(" / ") || "Camera";
  }
  if (isLens) {
    const model = r.ram.trim();
    const color = r.color.trim();
    if (model && color) return `${model} / ${color}`;
    return model || color || "Lens";
  }
  if (isTV) {
    const parts = [r.ram.trim(), r.color.trim(), r.launchYear.trim(), r.storage.trim()].filter(Boolean);
    return parts.join(" / ") || "";
  }
  if (isSmartDevice) {
    // Group by model + color + all custom attr values so each distinct config gets its own images.
    const attrVals = [r.attr1, r.attr2, r.attr3].slice(0, attrColumns.length).map((v) => v.trim()).filter(Boolean);
    const parts = [r.ram.trim(), r.color.trim(), ...attrVals].filter(Boolean);
    return parts.join(" / ") || "";
  }
  if (isSpeaker) {
    // Group by model + watt + color so each distinct SKU gets its own images.
    const parts = [r.ram.trim(), r.storage.trim(), r.color.trim()].filter(Boolean);
    return parts.join(" / ") || "";
  }
  return r.color.trim();
}

function buildAttributes(r: VariantRow, isCamera: boolean, isTV: boolean, isSpeaker: boolean, isLens = false, isSmartDevice = false, attrColumns: string[] = []): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (isCamera) {
    if (r.ram.trim()) a.model = r.ram.trim();
    if (r.launchYear.trim()) a.launchYear = r.launchYear.trim();
    a.lensIncluded = r.lensIncluded || "No";
    if (r.lensIncluded === "Yes" && r.storage.trim()) a.lens = r.storage.trim();
  } else if (isTV) {
    if (r.name?.trim()) a.name = r.name.trim();
    if (r.ram.trim()) a.size = r.ram.trim();
    if (r.storage.trim()) a.model = r.storage.trim();
    if (r.launchYear.trim()) a.launchYear = r.launchYear.trim();
    if (r.dimensions.trim()) a.dimensions = r.dimensions.trim();
    if (r.weight.trim()) a.weight = r.weight.trim();
    if (r.dimWithStand.trim()) a.dimWithStand = r.dimWithStand.trim();
    if (r.dimWithoutStand.trim()) a.dimWithoutStand = r.dimWithoutStand.trim();
  } else if (isSpeaker || isSmartDevice) {
    if (r.ram.trim()) a.model = r.ram.trim();
    if (!isSmartDevice && r.storage.trim()) a.watt = r.storage.trim();
    if (isSmartDevice) {
      const vals = [r.attr1, r.attr2, r.attr3];
      attrColumns.forEach((col, idx) => { if (col.trim() && vals[idx]?.trim()) a[col.toLowerCase()] = vals[idx].trim(); });
    }
  } else if (isLens) {
    if (r.ram.trim()) a.model = r.ram.trim();
  } else {
    if (r.ram.trim()) a.ram = r.ram.trim();
    if (r.storage.trim()) a.storage = r.storage.trim();
  }
  if (r.color.trim()) a.color = r.color.trim();
  const gstNum = Number(r.gst);
  if (!isNaN(gstNum) && gstNum >= 0) a.__gstRate = gstNum;
  // Strip empty-string attributes — backend rejects them with minLength validation errors.
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== ""));
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

function initRows(variants: AdminVariant[], isCamera: boolean, isTV: boolean, isSpeaker: boolean, isLens = false, isSmartDevice = false, attrColumns: string[] = []): VariantRow[] {
  return variants.map((v) => {
    const base = v.basePrice != null ? String(v.basePrice) : "";
    const price = v.priceOverride != null ? String(v.priceOverride) : "";
    const gst = v.attributes.__gstRate != null ? String(v.attributes.__gstRate) : "18";
    const { gstAmount, netBase } = calcGstFields(price, gst);
    // Camera → model/lens; TV → size/model; Speaker/SmartDevice → model; Lens → model (fallback ram); default → ram/storage.
    const ramVal = isCamera
      ? (v.attributes.model != null ? String(v.attributes.model) : "")
      : isTV
      ? (v.attributes.size != null ? String(v.attributes.size) : "")
      : (isSpeaker || isSmartDevice)
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
      : isSmartDevice
      ? ""
      : (v.attributes.storage != null ? String(v.attributes.storage) : "");
    const lensIncluded = isCamera
      ? (v.attributes.lensIncluded != null ? String(v.attributes.lensIncluded) : "No")
      : "";
    return {
      uid: uid(),
      existingId: v.id,
      name: isTV && v.attributes.name != null ? String(v.attributes.name) : "",
      ram: ramVal,
      storage: storageVal,
      color: v.attributes.color != null ? String(v.attributes.color) : "",
      launchYear: (isTV || isCamera) && v.attributes.launchYear != null ? String(v.attributes.launchYear) : "",
      lensIncluded,
      dimensions: isTV && v.attributes.dimensions != null ? String(v.attributes.dimensions) : "",
      weight: isTV && v.attributes.weight != null ? String(v.attributes.weight) : "",
      dimWithStand: isTV && v.attributes.dimWithStand != null ? String(v.attributes.dimWithStand) : "",
      dimWithoutStand: isTV && v.attributes.dimWithoutStand != null ? String(v.attributes.dimWithoutStand) : "",
      attr1: isSmartDevice && attrColumns[0] ? (v.attributes[attrColumns[0].toLowerCase()] != null ? String(v.attributes[attrColumns[0].toLowerCase()]) : "") : "",
      attr2: isSmartDevice && attrColumns[1] ? (v.attributes[attrColumns[1].toLowerCase()] != null ? String(v.attributes[attrColumns[1].toLowerCase()]) : "") : "",
      attr3: isSmartDevice && attrColumns[2] ? (v.attributes[attrColumns[2].toLowerCase()] != null ? String(v.attributes[attrColumns[2].toLowerCase()]) : "") : "",
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
function initColorImages(variants: AdminVariant[], isTV: boolean, isCamera: boolean, isLens = false, isSmartDevice = false, attrColumns: string[] = [], isSpeaker = false): Record<string, ColorImages> {
  const map: Record<string, ColorImages> = {};
  for (const v of variants) {
    let groupKey: string;
    if (isCamera) {
      const model      = v.attributes.model      != null ? String(v.attributes.model).trim()      : "";
      const color      = v.attributes.color      != null ? String(v.attributes.color).trim()      : "";
      const launchYear = v.attributes.launchYear != null ? String(v.attributes.launchYear).trim() : "";
      const lensFlag   = v.attributes.lensIncluded === "Yes" ? "WithLens" : "BodyOnly";
      const lensName   = v.attributes.lensIncluded === "Yes" && v.attributes.lens != null
        ? String(v.attributes.lens).trim()
        : "";
      const parts = [model, color, launchYear, lensFlag, lensName].filter(Boolean);
      groupKey = parts.join(" / ") || "Camera";
    } else if (isLens) {
      const model = (v.attributes.model ?? v.attributes.ram) != null
        ? String(v.attributes.model ?? v.attributes.ram).trim()
        : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      groupKey = model && color ? `${model} / ${color}` : model || color || "";
    } else if (isTV) {
      const size = v.attributes.size != null ? String(v.attributes.size).trim() : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      const launchYear = v.attributes.launchYear != null ? String(v.attributes.launchYear).trim() : "";
      const model = v.attributes.model != null ? String(v.attributes.model).trim() : "";
      const parts = [size, color, launchYear, model].filter(Boolean);
      groupKey = parts.join(" / ") || "";
    } else if (isSmartDevice) {
      const model = v.attributes.model != null ? String(v.attributes.model).trim() : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      const attrVals = attrColumns.slice(0, 3).map((col) => {
        const val = v.attributes[col.toLowerCase()];
        return val != null ? String(val).trim() : "";
      }).filter(Boolean);
      const parts = [model, color, ...attrVals].filter(Boolean);
      groupKey = parts.join(" / ") || "";
    } else if (isSpeaker) {
      const model = v.attributes.model != null ? String(v.attributes.model).trim() : "";
      const watt  = v.attributes.watt  != null ? String(v.attributes.watt).trim()  : "";
      const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
      const parts = [model, watt, color].filter(Boolean);
      groupKey = parts.join(" / ") || "";
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

type CameraSpecModel = { model: string; lensIncluded: string; launchYear: string; lensName: string };

type TvSpecModel = { screenSize: string; productName: string };

const ProductVariantsEditor = forwardRef<
  ProductVariantsHandle,
  { productName: string; initialVariants: AdminVariant[]; disabled: boolean; categorySlug?: string; draftRows?: unknown[]; specModelNos?: string[]; cameraSpecModels?: CameraSpecModel[]; tvSpecSizes?: string[]; tvSpecModels?: TvSpecModel[] }
>(function ProductVariantsEditor({ productName, initialVariants, disabled, categorySlug, draftRows, specModelNos = [], cameraSpecModels = [], tvSpecSizes = [], tvSpecModels = [] }, ref) {
  const [isIPhone, setIsIPhone] = useState(false);
  const isLens = isLensCategory(categorySlug);
  const isCamera = !isLens && isCameraCategory(categorySlug);
  const isTV = isTvCategory(categorySlug);
  const isSpeaker = !isCamera && !isTV && !isLens && isSpeakerCategory(categorySlug);
  const isSmartDevice = !isCamera && !isTV && !isLens && !isSpeaker && isSmartDeviceCategory(categorySlug);
  const isPhone = !isCamera && !isTV && !isLens && !isSpeaker && !isSmartDevice;
  const hideRam = isPhone && isIPhone;
  const [attrColumns, setAttrColumns] = useState<string[]>(() =>
    isSmartDevice ? initSmartDeviceAttrCols(initialVariants) : []
  );
  const [rows, setRows] = useState<VariantRow[]>(() => {
    const _attrCols = isSmartDevice ? initSmartDeviceAttrCols(initialVariants) : [];
    if (draftRows && draftRows.length > 0) {
      return (draftRows as VariantRow[]).map((r) => ({ ...r, uid: uid(), existingId: undefined, name: r.name ?? "", attr1: r.attr1 ?? "", attr2: r.attr2 ?? "", attr3: r.attr3 ?? "" }));
    }
    return initRows(initialVariants, isCamera, isTV, isSpeaker, isLens, isSmartDevice, _attrCols);
  });
  const [colorImages, setColorImages] = useState<Record<string, ColorImages>>(
    () => initColorImages(initialVariants, isTV, isCamera, isLens, isSmartDevice, isSmartDevice ? initSmartDeviceAttrCols(initialVariants) : [], isSpeaker),
  );

  // Distinct image group keys (camera: body/lens; TV: size; smart device: model+color+attrs; others: color) — drives the image uploaders.
  const colors = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const c = imageGroupKey(r, isTV, isCamera, isLens, isSmartDevice, attrColumns, isSpeaker);
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }, [rows, isTV, isCamera, isLens, isSmartDevice, attrColumns]);

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
        name: "",
        ram: "",
        storage: "",
        color: "",
        launchYear: "",
        lensIncluded: isCamera ? "No" : "",
        dimensions: "",
        weight: "",
        dimWithStand: "",
        dimWithoutStand: "",
        attr1: "",
        attr2: "",
        attr3: "",
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
              : isSmartDevice
              ? "Each variant needs at least one of Model No. or Color."
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
          if (!isTV) {
            const key = comboKey(r, isCamera, isSmartDevice);
            if (seen.has(key)) {
              return isCamera
                ? (isLens ? "Two variants have the same Model No. / Color combination." : "Two variants have the same Model No. / Color / Launch Year / Lens combination.")
                : isSpeaker
                ? "Two variants have the same Model No. / Watt / Color combination."
                : isSmartDevice
                ? "Two variants have the same Model No. / Color / custom attribute combination."
                : "Two variants have the same RAM / ROM / Color combination.";
            }
            seen.add(key);
          }
        }
        return null;
      },
      hasRows: () => rows.length > 0,
      getRows: () => rows as unknown[],
      setRows: (newRows: unknown[]) => setRows(
        (newRows as VariantRow[]).map((r) => ({ ...r, uid: uid(), existingId: undefined, name: r.name ?? "" }))
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

        // Helper: backend returns "not found" when variant no longer exists
        // (e.g. stale ID from a previous partial-save attempt).
        const isNotFound = (err: unknown) =>
          isApiError(err) && (
            err.displayMessage.toLowerCase().includes("not found") ||
            (err.code ?? "").toLowerCase().includes("not_found") ||
            err.statusCode === 404
          );

        // 2. Update existing rows; collect new rows to create after deletes.
        const keptIds = new Set<string>();
        const toCreate: VariantRow[] = [];
        for (const r of rows) {
          const existing = r.existingId ? initialVariants.find((v) => v.id === r.existingId) : undefined;
          if (existing) {
            keptIds.add(existing.id);
            const body = {
              // On update keep the original SKU to avoid backend uniqueness conflicts.
              sku: existing.sku,
              attributes: buildAttributes(r, isCamera, isTV, isSpeaker, isLens, isSmartDevice, attrColumns),
              basePrice: r.base.trim() === "" ? null : Number(r.base),
              priceOverride: r.price.trim() === "" ? null : Number(r.price),
              stock: Number(r.stock),
              imagesObjectKeys: finalKeys[imageGroupKey(r, isTV, isCamera, isLens, isSmartDevice, attrColumns, isSpeaker)] ?? [],
            };
            try {
              await adminApi.updateVariant(productId, existing.id, body);
            } catch (err) {
              if (isNotFound(err)) {
                // Variant was removed externally — re-create it instead.
                toCreate.push(r);
              } else {
                throw err;
              }
            }
          } else {
            toCreate.push(r);
          }
        }

        // 3. Delete removed variants BEFORE creating new ones — prevents SKU collisions
        //    when a replaced variant's auto-generated SKU matches its predecessor.
        for (const v of initialVariants) {
          if (!keptIds.has(v.id)) {
            try {
              await adminApi.deleteVariant(productId, v.id);
            } catch (err) {
              // If already gone, treat as success — it's effectively deleted.
              if (!isNotFound(err)) throw err;
            }
          }
        }

        // 4. Create new variants (after deletes so their generated SKUs are free).
        for (const r of toCreate) {
          await adminApi.createVariant(productId, {
            sku: makeSku(productName, r, isCamera, isTV, isSmartDevice, attrColumns),
            attributes: buildAttributes(r, isCamera, isTV, isSpeaker, isLens, isSmartDevice, attrColumns),
            basePrice: r.base.trim() === "" ? null : Number(r.base),
            priceOverride: r.price.trim() === "" ? null : Number(r.price),
            stock: Number(r.stock),
            imagesObjectKeys: finalKeys[imageGroupKey(r, isTV, isCamera, isLens, isSmartDevice, attrColumns, isSpeaker)] ?? [],
          });
        }
      },
    }),
    [rows, colors, colorImages, productName, initialVariants, isCamera, isTV, isSpeaker, isLens, isSmartDevice, attrColumns],
  );

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div>
        <h3 className="font-bold text-gray-800 text-sm">Variants</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">
          {isLens
            ? "Add each Model No. / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above."
            : isCamera
            ? "Add each Model No. / Color / Launch Year combination. Select Lens Included — if yes, enter the lens name. Stock and prices are per variant. Images: Camera: [Color] sections for body-only variants per color, Lens sections for each included lens."
            : isTV
            ? "Add each Size / Model No. / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above. Images are shared per size."
            : isSpeaker
            ? "Add each Model No. / Watt / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above. Images are per Model No. / Watt / Color combination."
            : isSmartDevice
            ? "Add each Model No. / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above. Images are shared per color."
            : hideRam
            ? "Add each ROM / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above. Images are shared per color."
            : "Add each RAM / ROM / Color combination with its own stock and prices. Enter MRP (original struck price) and Selling Price (GST-inclusive, what the customer pays). GST Amount and Base Price are auto-calculated from the Selling Price using the GST Rate set above. Images are shared per color."}
        </p>
        {isPhone && (
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={isIPhone}
              onChange={(e) => setIsIPhone(e.target.checked)}
              className="w-4 h-4 accent-[#129cd3]"
              disabled={disabled}
            />
            <span className="text-sm text-gray-600 font-medium">
              Is this an iPhone?{" "}
              <span className="text-xs text-gray-400">(RAM column will be hidden)</span>
            </span>
          </label>
        )}
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

      {/* Smart Device: custom attribute column builder */}
      {isSmartDevice && (
        <>
        <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-gray-100">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Custom columns:</span>
          {attrColumns.map((col, ci) => (
            <div key={ci} className="flex items-center gap-1 bg-[#e8f7fc] border border-[#129cd3]/30 rounded-lg px-2 py-1">
              <input
                value={col}
                onChange={(e) => setAttrColumns((prev) => prev.map((c, i) => i === ci ? e.target.value : c))}
                placeholder="e.g. Size"
                disabled={disabled}
                className="bg-transparent text-xs font-semibold text-[#0a6d93] outline-none w-20"
              />
              <button
                type="button"
                onClick={() => {
                  setAttrColumns((prev) => prev.filter((_, i) => i !== ci));
                  setRows((rs) => rs.map((r) => {
                    if (ci === 0) return { ...r, attr1: r.attr2, attr2: r.attr3, attr3: "" };
                    if (ci === 1) return { ...r, attr2: r.attr3, attr3: "" };
                    return { ...r, attr3: "" };
                  }));
                }}
                disabled={disabled}
                className="text-[#129cd3] hover:text-red-500 disabled:opacity-40"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {attrColumns.length < 3 && (
            <button
              type="button"
              onClick={() => setAttrColumns((prev) => [...prev, ""])}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#129cd3] border border-dashed border-[#129cd3]/40 px-2 py-1 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
            >
              <Plus size={11} /> Add Column
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          <span className="font-semibold text-gray-500">Tip:</span> Use custom columns to add variant-specific attributes unique to this product — e.g. <span className="italic">Size</span>, <span className="italic">Wattage</span>, <span className="italic">Voltage</span>. Type the column name, then fill in the value for each variant row below. Model No. and Color are always included by default.
        </p>
        </>
      )}

      {/* Variant rows */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-[12px] text-gray-400">No variants yet. Add one below.</p>
        )}
        {rows.map((r) => {
        // Model-no validation: applies to multi-model types (speaker, lens, smart device).
        // If specModelNos is provided, the variant model must match one of the spec models.
        const hasSpecModels = specModelNos.length > 0 && (isSmartDevice || isSpeaker || isLens || isCamera);
        const modelEntered = r.ram.trim() !== "";
        const modelMatched = !hasSpecModels || !modelEntered ||
          specModelNos.some((m) => m.trim().toLowerCase() === r.ram.trim().toLowerCase());
        const showModelAlert = hasSpecModels && modelEntered && !modelMatched;
        // Disable non-model fields when there's an active mismatch.
        const rowDisabled = disabled || (hasSpecModels && modelEntered && !modelMatched);

        // TV-specific validation — spec screen sizes and product names must match variants.
        // Normalise size by stripping inch symbols (" ″ ') before comparing.
        const normTvSize = (v: string) => v.replace(/["""″''']/g, "").trim().toLowerCase();
        const hasTvSpecSizes = isTV && tvSpecSizes.length > 0;
        const hasTvSpecNames = isTV && tvSpecModels.some((m) => m.productName);
        const tvSizeEntered = isTV && r.ram.trim() !== "";
        const tvNameEntered = isTV && r.name.trim() !== "";
        const tvSizeMatched = !hasTvSpecSizes || !tvSizeEntered ||
          tvSpecModels.some((m) => normTvSize(m.screenSize) === normTvSize(r.ram));
        const tvNameMatched = !hasTvSpecNames || !tvNameEntered ||
          tvSpecModels.some((m) => m.productName.trim().toLowerCase() === r.name.trim().toLowerCase());
        const showTvSizeAlert = hasTvSpecSizes && tvSizeEntered && !tvSizeMatched;
        const showTvNameAlert = hasTvSpecNames && tvNameEntered && !tvNameMatched;
        const tvRowDisabled = disabled || showTvSizeAlert || showTvNameAlert;

        return isTV ? (
          /* ── TV: multi-row card ───────────────────────────────── */
          <div key={r.uid} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {(showTvNameAlert || showTvSizeAlert) && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  {showTvNameAlert
                    ? <>Product Name <strong>&ldquo;{r.name}&rdquo;</strong> doesn&apos;t match any product name in the Specifications section. Fix it here or update the Specifications first.</>
                    : <>Size <strong>&ldquo;{r.ram}&rdquo;</strong> doesn&apos;t match any screen size in the Specifications section. Fix it here or add this size to the Specifications first.</>
                  } Other fields are locked until it matches.
                </span>
              </div>
            )}
            <div className="p-3 space-y-3">
            {/* Product Name — validates against spec names; auto-fills Size on match */}
            <Field label="Product Name">
              <input
                value={r.name}
                onChange={(e) => {
                  const val = e.target.value;
                  const updates: Partial<VariantRow> = { name: val };
                  if (tvSpecModels.length > 0) {
                    const matched = tvSpecModels.find(
                      (m) => m.productName.trim().toLowerCase() === val.trim().toLowerCase(),
                    );
                    if (matched) {
                      if (matched.screenSize) updates.ram = matched.screenSize;
                    }
                  }
                  updateRow(r.uid, updates);
                }}
                placeholder='e.g. Samsung 43" Crystal 4K TV'
                disabled={disabled}
                className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] ${showTvNameAlert ? "border-red-400 bg-red-50" : "border-gray-200"}`}
              />
            </Field>
            {/* Row 1: Size + Model No. + delete */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <Field label="Size (inch)">
                <input
                  value={r.ram}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updates: Partial<VariantRow> = { ram: val };
                    if (tvSpecModels.length > 0) {
                      const matched = tvSpecModels.find(
                        (m) => normTvSize(m.screenSize) === normTvSize(val),
                      );
                      if (matched && matched.productName) updates.name = matched.productName;
                    }
                    updateRow(r.uid, updates);
                  }}
                  list="variant-tv-size-presets"
                  placeholder='e.g. 43'
                  disabled={disabled}
                  className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] ${showTvSizeAlert ? "border-red-400 bg-red-50" : "border-gray-200"}`}
                />
              </Field>
              <Field label="Model No.">
                <input
                  value={r.storage}
                  onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                  placeholder="e.g. UA43CUE60BKLXL"
                  disabled={tvRowDisabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
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
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </Field>
                <Field label="W×H×D (with stand)">
                  <input
                    value={r.dimWithStand}
                    onChange={(e) => updateRow(r.uid, { dimWithStand: e.target.value })}
                    placeholder='e.g. 972.4 × 625.0 × 213.3 mm'
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </Field>
                <Field label="Weight">
                  <input
                    value={r.weight}
                    onChange={(e) => updateRow(r.uid, { weight: e.target.value })}
                    placeholder='e.g. 4.5 kg'
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </Field>
                <Field label="Launch Year">
                  <select
                    value={r.launchYear}
                    onChange={(e) => updateRow(r.uid, { launchYear: e.target.value })}
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
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
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </Field>
                <Field label="Stock">
                  <input
                    type="number" min={0} step={1}
                    value={r.stock}
                    onChange={(e) => updateRow(r.uid, { stock: e.target.value })}
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </Field>
                <Field label="MRP (₹)">
                  <input
                    type="number" min={0} step="0.01"
                    value={r.base}
                    onChange={(e) => updateRow(r.uid, { base: e.target.value })}
                    placeholder="0"
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
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
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
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
                    disabled={tvRowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] disabled:bg-gray-50 disabled:text-gray-400"
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
            </div>{/* end p-3 space-y-3 */}
          </div>
        ) : (
          /* ── non-TV: existing compact grid ───────────────────── */
          <div key={r.uid} className={`rounded-lg overflow-hidden ${showModelAlert ? "border border-red-300" : "border border-gray-100"}`}>
            {showModelAlert && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  Model No. <strong>&ldquo;{r.ram}&rdquo;</strong> doesn&apos;t match any model defined in the Specifications section.
                  Fix the model no. here or add this model to the Specifications first. Other fields are locked until the model matches.
                </span>
              </div>
            )}
          <div
            className={`grid grid-cols-2 gap-2 items-end p-2.5 ${
              isLens
                ? "sm:grid-cols-[repeat(8,1fr)_auto]"
                : isCamera
                ? r.lensIncluded === "Yes" ? "sm:grid-cols-[repeat(11,1fr)_auto]" : "sm:grid-cols-[repeat(10,1fr)_auto]"
                : isSmartDevice
                ? `sm:grid-cols-[repeat(${8 + attrColumns.length},1fr)_auto]`
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
                    onChange={(e) => {
                      const val = e.target.value;
                      const updates: Partial<VariantRow> = { ram: val };
                      if (isCamera && cameraSpecModels.length > 0) {
                        const matched = cameraSpecModels.find(
                          (m) => m.model.trim().toLowerCase() === val.trim().toLowerCase(),
                        );
                        if (matched) {
                          if (matched.launchYear)   updates.launchYear   = matched.launchYear;
                          if (matched.lensIncluded) updates.lensIncluded = matched.lensIncluded;
                          if (matched.lensIncluded !== "Yes") updates.storage = "";
                          else if (matched.lensName) updates.storage = matched.lensName;
                        }
                      }
                      updateRow(r.uid, updates);
                    }}
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
                    disabled={rowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                {!isLens && (
                  <>
                    <Field label="Launch Year">
                      <select
                        value={r.launchYear}
                        onChange={(e) => updateRow(r.uid, { launchYear: e.target.value })}
                        disabled={rowDisabled}
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
                        disabled={rowDisabled}
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
                          disabled={rowDisabled}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                        />
                      </Field>
                    )}
                  </>
                )}
              </>
            ) : isSmartDevice ? (
              <>
                <Field label="Model No.">
                  <input
                    value={r.ram}
                    onChange={(e) => updateRow(r.uid, { ram: e.target.value })}
                    placeholder="e.g. Echo Dot 5th Gen"
                    disabled={disabled}
                    className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] ${showModelAlert ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}
                  />
                </Field>
                <Field label="Color">
                  <input
                    value={r.color}
                    onChange={(e) => updateRow(r.uid, { color: e.target.value })}
                    list="variant-color-presets"
                    placeholder="e.g. Black"
                    disabled={rowDisabled}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                  />
                </Field>
                {attrColumns[0] && (
                  <Field label={attrColumns[0]}>
                    <input value={r.attr1} onChange={(e) => updateRow(r.uid, { attr1: e.target.value })} placeholder="Value" disabled={rowDisabled} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]" />
                  </Field>
                )}
                {attrColumns[1] && (
                  <Field label={attrColumns[1]}>
                    <input value={r.attr2} onChange={(e) => updateRow(r.uid, { attr2: e.target.value })} placeholder="Value" disabled={rowDisabled} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]" />
                  </Field>
                )}
                {attrColumns[2] && (
                  <Field label={attrColumns[2]}>
                    <input value={r.attr3} onChange={(e) => updateRow(r.uid, { attr3: e.target.value })} placeholder="Value" disabled={rowDisabled} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]" />
                  </Field>
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
                  className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3] ${isSpeaker && showModelAlert ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}
                />
              </Field>
            ) : null}
            {!isCamera && !isLens && !isSmartDevice && (
              <Field label={isSpeaker ? "Watt" : "ROM"}>
                <input
                  value={r.storage}
                  onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                  list={isSpeaker ? undefined : "variant-storage-presets"}
                  placeholder={isSpeaker ? "e.g. 30W" : "128GB"}
                  disabled={rowDisabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
            )}
            {!isCamera && !isLens && !isSmartDevice && (
              <Field label="Color">
                <input
                  value={r.color}
                  onChange={(e) => updateRow(r.uid, { color: e.target.value })}
                  list="variant-color-presets"
                  placeholder="Red"
                  disabled={rowDisabled}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
                />
              </Field>
            )}
            <Field label="Stock">
              <input
                type="number" min={0} step={1}
                value={r.stock}
                onChange={(e) => updateRow(r.uid, { stock: e.target.value })}
                disabled={rowDisabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="MRP (₹)">
              <input
                type="number" min={0} step="0.01"
                value={r.base}
                onChange={(e) => updateRow(r.uid, { base: e.target.value })}
                placeholder="0"
                disabled={rowDisabled}
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
                disabled={rowDisabled}
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
                disabled={rowDisabled}
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
          </div>
        );
      })}
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
            {isCamera ? "Images by body / lens" : isTV ? "Images by size, color, year & model" : isSmartDevice ? "Images by model, color & attributes" : isSpeaker ? "Images by model, watt & color" : "Images by color"}
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
