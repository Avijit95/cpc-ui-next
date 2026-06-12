"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
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
  storage: string; // ROM
  color: string;
  stock: string;
  base: string; // MRP (struck); blank = no separate base price
  price: string; // selling price; blank = use product base price
};

// A color's images are one ordered list — order is the display rank (#1 first).
// Existing items carry the saved S3 key; pending items carry a local File.
type ColorImageItem =
  | { id: string; kind: "existing"; key: string; url: string | null }
  | { id: string; kind: "pending"; file: File; previewUrl: string };
type ColorImages = { items: ColorImageItem[] };

export type ProductVariantsHandle = {
  // Returns an error message, or null when the rows are valid.
  validate: () => string | null;
  // Uploads per-color images then creates/updates/deletes variants to match the rows.
  commit: (productId: string) => Promise<void>;
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

function makeSku(name: string, r: VariantRow): string {
  const base = slugifyPart(name) || "variant";
  const tail = [r.ram, r.storage, r.color].map(slugifyPart).filter(Boolean).join("-");
  return tail ? `${base}-${tail}` : base;
}

function comboKey(r: VariantRow): string {
  return `${r.ram.trim()}|${r.storage.trim()}|${r.color.trim()}`.toLowerCase();
}

function buildAttributes(r: VariantRow): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (r.ram.trim()) a.ram = r.ram.trim();
  if (r.storage.trim()) a.storage = r.storage.trim();
  if (r.color.trim()) a.color = r.color.trim();
  return a;
}

function initRows(variants: AdminVariant[]): VariantRow[] {
  return variants.map((v) => ({
    uid: uid(),
    existingId: v.id,
    ram: v.attributes.ram != null ? String(v.attributes.ram) : "",
    storage: v.attributes.storage != null ? String(v.attributes.storage) : "",
    color: v.attributes.color != null ? String(v.attributes.color) : "",
    stock: String(v.stock ?? 0),
    base: v.basePrice != null ? String(v.basePrice) : "",
    price: v.priceOverride != null ? String(v.priceOverride) : "",
  }));
}

// Variants of the same color share one image set — take the first non-empty.
function initColorImages(variants: AdminVariant[]): Record<string, ColorImages> {
  const map: Record<string, ColorImages> = {};
  for (const v of variants) {
    const color = v.attributes.color != null ? String(v.attributes.color).trim() : "";
    if (!color) continue;
    if (!map[color]) map[color] = { items: [] };
    if (map[color].items.length === 0 && v.imagesObjectKeys.length > 0) {
      map[color].items = v.imagesObjectKeys.map((key) => ({
        id: uid(),
        kind: "existing" as const,
        key,
        url: imageUrlForKey(key),
      }));
    }
  }
  return map;
}

const ProductVariantsEditor = forwardRef<
  ProductVariantsHandle,
  { productName: string; initialVariants: AdminVariant[]; disabled: boolean }
>(function ProductVariantsEditor({ productName, initialVariants, disabled }, ref) {
  const [rows, setRows] = useState<VariantRow[]>(() => initRows(initialVariants));
  const [colorImages, setColorImages] = useState<Record<string, ColorImages>>(
    () => initColorImages(initialVariants),
  );

  // Distinct colors actually used by the rows — drives the image uploaders.
  const colors = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const c = r.color.trim();
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }, [rows]);

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
        stock: "0",
        base: "",
        price: "",
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
      const cur = prev[color] ?? { items: [] };
      return { ...prev, [color]: { items: [...cur.items, ...accepted] } };
    });
  };

  const removeImage = (color: string, id: string) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      const removed = cur.items.find((it) => it.id === id);
      if (removed?.kind === "pending") URL.revokeObjectURL(removed.previewUrl);
      return {
        ...prev,
        [color]: { items: cur.items.filter((it) => it.id !== id) },
      };
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
      return { ...prev, [color]: { items } };
    });

  const clearColor = (color: string) =>
    setColorImages((prev) => {
      const cur = prev[color];
      if (!cur) return prev;
      for (const it of cur.items) {
        if (it.kind === "pending") URL.revokeObjectURL(it.previewUrl);
      }
      return { ...prev, [color]: { items: [] } };
    });

  useImperativeHandle(
    ref,
    () => ({
      validate: () => {
        const seen = new Set<string>();
        for (const r of rows) {
          if (!r.ram.trim() && !r.storage.trim() && !r.color.trim()) {
            return "Each variant needs at least one of RAM, ROM, or Color.";
          }
          const stockNum = Number(r.stock);
          if (
            r.stock.trim() === "" ||
            !Number.isInteger(stockNum) ||
            stockNum < 0
          ) {
            return "Each variant's stock must be a whole number ≥ 0.";
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
              return "Variant base price must be a number ≥ 0 (leave blank for no struck price).";
            }
            if (r.price.trim() !== "" && b < Number(r.price)) {
              return "Variant base price must be greater than or equal to the selling price.";
            }
          }
          const key = comboKey(r);
          if (seen.has(key)) {
            return "Two variants have the same RAM / ROM / Color combination.";
          }
          seen.add(key);
        }
        return null;
      },
      commit: async (productId: string) => {
        // 1. Resolve each color's images in display order — uploading pending
        //    files in place so the final key list matches the chosen ranking.
        const finalKeys: Record<string, string[]> = {};
        for (const color of colors) {
          const ci = colorImages[color] ?? { items: [] };
          const keys: string[] = [];
          for (const it of ci.items) {
            if (it.kind === "existing") {
              keys.push(it.key);
            } else {
              const { objectKey } = await adminApi.uploadProductImage(
                productId,
                it.file,
              );
              keys.push(objectKey);
            }
          }
          finalKeys[color] = keys;
        }

        // 2. Create or update each row.
        const keptIds = new Set<string>();
        for (const r of rows) {
          const body = {
            sku: makeSku(productName, r),
            attributes: buildAttributes(r),
            basePrice: r.base.trim() === "" ? null : Number(r.base),
            priceOverride: r.price.trim() === "" ? null : Number(r.price),
            stock: Number(r.stock),
            imagesObjectKeys: finalKeys[r.color.trim()] ?? [],
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
    [rows, colors, colorImages, productName, initialVariants],
  );

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div>
        <h3 className="font-bold text-gray-800 text-sm">Variants</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">
          Add each RAM / ROM / Color combination this phone is sold in, with its own
          stock and prices. Base (₹) is the struck MRP; Selling (₹) is what the
          customer pays — leave Selling blank to use the product base price, and
          Base blank for no struck price. Images are shared per color — image #1 is
          the primary; reorder or remove them below.
        </p>
      </div>

      {/* Datalists shared by every row */}
      <datalist id="variant-ram-presets">
        {RAM_PRESETS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="variant-storage-presets">
        {STORAGE_PRESETS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
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
        {rows.map((r) => (
          <div
            key={r.uid}
            className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_70px_100px_100px_auto] gap-2 items-end border border-gray-100 rounded-lg p-2.5"
          >
            <Field label="RAM">
              <input
                value={r.ram}
                onChange={(e) => updateRow(r.uid, { ram: e.target.value })}
                list="variant-ram-presets"
                placeholder="8GB"
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="ROM">
              <input
                value={r.storage}
                onChange={(e) => updateRow(r.uid, { storage: e.target.value })}
                list="variant-storage-presets"
                placeholder="128GB"
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
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
            <Field label="Stock">
              <input
                type="number"
                min={0}
                step={1}
                value={r.stock}
                onChange={(e) => updateRow(r.uid, { stock: e.target.value })}
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="Base (₹)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.base}
                onChange={(e) => updateRow(r.uid, { base: e.target.value })}
                placeholder="MRP"
                disabled={disabled}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
            </Field>
            <Field label="Selling (₹)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.price}
                onChange={(e) => updateRow(r.uid, { price: e.target.value })}
                placeholder="base"
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

      {/* Per-color images */}
      {colors.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700">Images by color</p>
          {colors.map((color) => {
            const ci = colorImages[color] ?? { items: [] };
            const count = ci.items.length;
            return (
              <div key={color}>
                <div className="flex items-center gap-3 mb-1.5">
                  <p className="text-[11px] font-semibold text-gray-600">{color}</p>
                  {count > 0 && (
                    <span className="text-[11px] text-gray-400">
                      {count} image{count === 1 ? "" : "s"} · #1 shows first ·{" "}
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
                    return (
                      <div
                        key={it.id}
                        className="aspect-square relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100 group"
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
                        <span className="absolute top-1 left-1 min-w-[20px] h-5 px-1 rounded-full bg-black/60 text-white text-[10px] font-semibold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeImage(color, it.id)}
                          disabled={disabled}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-red-500 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-1 inset-x-1 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
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
