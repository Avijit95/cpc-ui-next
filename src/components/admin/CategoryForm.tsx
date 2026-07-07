"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import { imageUrlForKey } from "@/lib/image-url";
import type {
  AdminCategoryListItem,
  CreateCategoryBody,
  UpdateCategoryBody,
} from "@/lib/api";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Mode =
  | { kind: "create" }
  | { kind: "edit"; categoryId: string; initial: AdminCategoryListItem };

type FormState = {
  name: string;
  slug: string;
  parentId: string; // "" = root
  sortOrder: string; // string for input, parsed on submit
  imageObjectKey: string;
};

function toForm(initial?: AdminCategoryListItem): FormState {
  return {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    parentId: initial?.parentId ?? "",
    sortOrder: initial?.sortOrder != null ? String(initial.sortOrder) : "0",
    imageObjectKey: initial?.imageObjectKey ?? "",
  };
}

function readableError(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "CATEGORY_SLUG_TAKEN":
      return "That slug is already in use. Pick a different one or leave it blank to auto-generate.";
    case "PARENT_NOT_FOUND":
      return "The selected parent category no longer exists. Refresh and try again.";
    case "CATEGORY_CYCLE":
      return "A category can't be its own parent (or descendant of itself).";
    case "CATEGORY_HAS_PRODUCTS":
      return "This category still has products attached. Reassign or archive them first.";
    case "CATEGORY_HAS_CHILDREN":
      return "This category still has child categories. Detach or delete them first.";
    default:
      return err.displayMessage || "Couldn't save the category.";
  }
}

export default function CategoryForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : undefined;

  const [form, setForm] = useState<FormState>(toForm(initial));
  const [allCategories, setAllCategories] = useState<AdminCategoryListItem[]>([]);
  const [loadingParents, setLoadingParents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    imageUrlForKey(initial?.imageObjectKey ?? ""),
  );
  const [imageTab, setImageTab] = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all categories for the parent dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await adminApi.listCategories();
        if (!cancelled) setAllCategories(list);
      } catch (err) {
        if (!cancelled) setError(readableError(err));
      } finally {
        if (!cancelled) setLoadingParents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When editing, exclude the current category from parent options
  // (the API also enforces CATEGORY_CYCLE, but this keeps UI honest).
  const parentOptions = useMemo(() => {
    const editingId = mode.kind === "edit" ? mode.categoryId : null;
    return allCategories.filter((c) => c.id !== editingId);
  }, [allCategories, mode]);

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only JPEG, PNG, WebP, or AVIF images are allowed.");
      return;
    }
    setUploadError(null);
    // Show local preview immediately while uploading
    const local = URL.createObjectURL(file);
    setPreviewUrl(local);
    setUploading(true);
    try {
      const result = await adminApi.uploadBannerImage(file);
      onChange("imageObjectKey", result.objectKey);
      setPreviewUrl(result.publicUrl ?? imageUrlForKey(result.objectKey));
    } catch {
      setUploadError("Image upload failed. You can still enter the object key manually.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    const sortOrderNum = form.sortOrder.trim() === "" ? 0 : Number(form.sortOrder);
    if (Number.isNaN(sortOrderNum)) {
      setError("Sort order must be a number.");
      return;
    }

    const baseBody: CreateCategoryBody = { name };
    if (form.slug.trim()) baseBody.slug = form.slug.trim();
    if (form.parentId) baseBody.parentId = form.parentId;
    else if (mode.kind === "edit") {
      // explicitly detach to root when editing
      (baseBody as CreateCategoryBody & { parentId: null }).parentId = null;
    }
    baseBody.sortOrder = sortOrderNum;
    if (form.imageObjectKey.trim()) baseBody.imageObjectKey = form.imageObjectKey.trim();

    setBusy(true);
    try {
      if (mode.kind === "create") {
        await adminApi.createCategory(baseBody);
      } else {
        await adminApi.updateCategory(mode.categoryId, baseBody as UpdateCategoryBody);
      }
      router.replace("/admin/categories");
      router.refresh();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <Link
        href="/admin/categories"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#129cd3] mb-4"
      >
        <ChevronLeft size={14} /> Back to categories
      </Link>

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl bg-white border border-gray-200 rounded-xl p-6 space-y-5"
      >
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => onChange("name", e.target.value.slice(0, 200))}
            placeholder="e.g. Smartphones"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Slug
          </label>
          <input
            value={form.slug}
            onChange={(e) => onChange("slug", e.target.value)}
            placeholder="auto-generated from name if empty (kebab-case)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Leave blank to auto-generate. Must be globally unique.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Parent category
            </label>
            <select
              value={form.parentId}
              onChange={(e) => onChange("parentId", e.target.value)}
              disabled={loadingParents}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">— None (root) —</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Sort order
            </label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => onChange("sortOrder", e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            Category Image
          </label>

          {/* Preview */}
          {previewUrl && (
            <div className="relative w-40 h-32 mb-3 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Category preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setUrlInput("");
                  onChange("imageObjectKey", "");
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-red-500 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => setImageTab("upload")}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${imageTab === "upload" ? "bg-[#129cd3] text-white border-[#129cd3]" : "border-gray-200 text-gray-500 hover:border-[#129cd3] hover:text-[#129cd3]"}`}
            >
              <ImagePlus size={12} /> Upload from device
            </button>
            <button
              type="button"
              onClick={() => setImageTab("url")}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${imageTab === "url" ? "bg-[#129cd3] text-white border-[#129cd3]" : "border-gray-200 text-gray-500 hover:border-[#129cd3] hover:text-[#129cd3]"}`}
            >
              <Link2 size={12} /> Use image link
            </button>
          </div>

          {imageTab === "upload" ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || busy}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#129cd3] border border-[#129cd3]/40 px-3 py-2 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  {uploading ? "Uploading…" : previewUrl ? "Change image" : "Choose file"}
                </button>
                <span className="text-[11px] text-gray-400">JPEG, PNG or WebP</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                className="hidden"
                onChange={handleImagePick}
              />
              {uploadError && (
                <p className="text-[11px] text-red-500 mt-1.5">{uploadError}</p>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3]"
              />
              <button
                type="button"
                disabled={!urlInput.trim()}
                onClick={() => {
                  const url = urlInput.trim();
                  if (!url) return;
                  onChange("imageObjectKey", url);
                  setPreviewUrl(url);
                }}
                className="px-3 py-2 text-sm font-semibold bg-[#129cd3] text-white rounded-lg hover:bg-[#0e87b5] disabled:opacity-40"
              >
                Use
              </button>
            </div>
          )}

          {/* Manual S3 key override */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
              Or enter S3 object key manually
            </label>
            <input
              value={/^https?:\/\//i.test(form.imageObjectKey) ? "" : form.imageObjectKey}
              onChange={(e) => {
                onChange("imageObjectKey", e.target.value);
                setPreviewUrl(imageUrlForKey(e.target.value));
              }}
              placeholder="e.g. categories/camera-lens.jpg"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode.kind === "create" ? "Create category" : "Save changes"}
          </button>
          <Link
            href="/admin/categories"
            className="text-sm border border-gray-200 text-gray-700 px-5 py-2.5 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
