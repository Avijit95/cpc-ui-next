"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type { Banner, CreateBannerBody, UpdateBannerBody } from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  X,
  LayoutGrid,
  Image as ImageIcon,
  Calendar,
} from "lucide-react";

const KNOWN_POSITIONS = ["home_hero", "home_side"] as const;

type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

type BannerSpec = {
  recommended: { w: number; h: number };
  hardMin: { w: number; h: number };
  aspectRatio: number | null;
};

const BANNER_SPECS: Record<string, BannerSpec> = {
  home_hero: {
    recommended: { w: 1920, h: 720 },
    hardMin: { w: 1280, h: 400 },
    aspectRatio: 1920 / 720,
  },
  home_side: {
    recommended: { w: 600, h: 600 },
    hardMin: { w: 320, h: 320 },
    aspectRatio: 1,
  },
};

const FALLBACK_SPEC: BannerSpec = {
  recommended: { w: 1280, h: 480 },
  hardMin: { w: 640, h: 320 },
  aspectRatio: null,
};

const ASPECT_TOLERANCE = 0.15;

function getBannerSpec(position: string): BannerSpec {
  return BANNER_SPECS[position] ?? FALLBACK_SPEC;
}

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function validateBannerImage(
  width: number,
  height: number,
  position: string,
): { blocked: string | null; warning: string | null } {
  const spec = getBannerSpec(position);
  if (width < spec.hardMin.w || height < spec.hardMin.h) {
    return {
      blocked: `Image is too small (${width}×${height}px). Minimum accepted size is ${spec.hardMin.w}×${spec.hardMin.h}px. Please upload an HD image.`,
      warning: null,
    };
  }
  if (width < spec.recommended.w || height < spec.recommended.h) {
    return {
      blocked: null,
      warning: `Image is below the recommended HD size of ${spec.recommended.w}×${spec.recommended.h}px (uploaded ${width}×${height}px). It may look soft on large screens.`,
    };
  }
  if (spec.aspectRatio !== null) {
    const actualRatio = width / height;
    const deviation = Math.abs(actualRatio - spec.aspectRatio) / spec.aspectRatio;
    if (deviation > ASPECT_TOLERANCE) {
      return {
        blocked: null,
        warning: `Aspect ratio (${actualRatio.toFixed(2)}:1) differs noticeably from the recommended ${spec.aspectRatio.toFixed(2)}:1 for this slot. The image may be cropped or stretched.`,
      };
    }
  }
  return { blocked: null, warning: null };
}

type FormState = {
  imageObjectKey: string;
  imageUrl: string | null;
  position: string;
  linkUrl: string;
  sortOrder: string;
  activeFrom: string;
  activeTo: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  imageObjectKey: "",
  imageUrl: null,
  position: "home_hero",
  linkUrl: "",
  sortOrder: "0",
  activeFrom: "",
  activeTo: "",
  isActive: true,
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

function toFormState(b: Banner): FormState {
  return {
    imageObjectKey: b.imageObjectKey,
    imageUrl: b.imageUrl,
    position: b.position,
    linkUrl: b.linkUrl ?? "",
    sortOrder: String(b.sortOrder),
    activeFrom: toDatetimeLocal(b.activeFrom),
    activeTo: toDatetimeLocal(b.activeTo),
    isActive: b.isActive,
  };
}

export default function CmsPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Banner | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listBanners()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load banners",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await adminApi.listBanners();
      setItems(data);
    } catch {
      // Best-effort.
    }
  }, []);

  useEffect(() => {
    if (modalMode !== "edit" || !form.imageUrl || imageDims) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = form.imageUrl;
    return () => {
      cancelled = true;
    };
  }, [modalMode, form.imageUrl, imageDims]);

  const imageWarning = useMemo(() => {
    if (!imageDims) return null;
    const { blocked, warning } = validateBannerImage(
      imageDims.w,
      imageDims.h,
      form.position,
    );
    return blocked ?? warning;
  }, [imageDims, form.position]);

  const currentSpec = useMemo(
    () => getBannerSpec(form.position),
    [form.position],
  );

  const groupedByPosition = useMemo(() => {
    const map = new Map<string, Banner[]>();
    for (const b of items) {
      const list = map.get(b.position) ?? [];
      list.push(b);
      map.set(b.position, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const openCreate = () => {
    setModalMode("create");
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImageDims(null);
  };

  const openEdit = (banner: Banner) => {
    setModalMode("edit");
    setEditId(banner.id);
    setForm(toFormState(banner));
    setFormError(null);
    setImageDims(null);
  };

  const closeModal = () => {
    if (saveBusy || uploadBusy) return;
    setModalMode("closed");
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImageDims(null);
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ct = file.type as ImageContentType;
      if (!["image/jpeg", "image/png", "image/webp"].includes(ct)) {
        setFormError("Image must be JPG, PNG, or WebP.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setFormError(null);
      setImageDims(null);
      const currentPosition = form.position;

      let dims: { width: number; height: number };
      try {
        dims = await readImageDimensions(file);
      } catch {
        setFormError("Could not read image dimensions. Try a different file.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const { blocked } = validateBannerImage(
        dims.width,
        dims.height,
        currentPosition,
      );
      if (blocked) {
        setFormError(blocked);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setUploadBusy(true);
      try {
        const result = await adminApi.uploadBannerImage(file);
        setForm((prev) => ({
          ...prev,
          imageObjectKey: result.objectKey,
          imageUrl: result.publicUrl ?? prev.imageUrl,
        }));
        setImageDims({ w: dims.width, h: dims.height });
      } catch (err) {
        setFormError(
          isApiError(err) ? err.displayMessage : "Image upload failed",
        );
      } finally {
        setUploadBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [form.position],
  );

  const handleSave = useCallback(async () => {
    if (!form.imageObjectKey) {
      setFormError("Please upload a banner image first.");
      return;
    }
    if (!form.position.trim()) {
      setFormError("Position is required.");
      return;
    }
    const sortOrder = Number(form.sortOrder);
    if (Number.isNaN(sortOrder)) {
      setFormError("Sort order must be a number.");
      return;
    }
    setSaveBusy(true);
    setFormError(null);
    try {
      if (modalMode === "create") {
        const body: CreateBannerBody = {
          imageObjectKey: form.imageObjectKey,
          position: form.position.trim(),
          sortOrder,
          isActive: form.isActive,
        };
        if (form.linkUrl.trim()) body.linkUrl = form.linkUrl.trim();
        if (form.activeFrom) body.activeFrom = fromDatetimeLocal(form.activeFrom);
        if (form.activeTo) body.activeTo = fromDatetimeLocal(form.activeTo);
        await adminApi.createBanner(body);
      } else if (modalMode === "edit" && editId) {
        const body: UpdateBannerBody = {
          imageObjectKey: form.imageObjectKey,
          position: form.position.trim(),
          sortOrder,
          isActive: form.isActive,
          linkUrl: form.linkUrl.trim() || null,
          activeFrom: form.activeFrom ? fromDatetimeLocal(form.activeFrom) : null,
          activeTo: form.activeTo ? fromDatetimeLocal(form.activeTo) : null,
        };
        await adminApi.updateBanner(editId, body);
      }
      await refresh();
      setModalMode("closed");
      setEditId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(
        isApiError(err) ? err.displayMessage : "Could not save banner",
      );
    } finally {
      setSaveBusy(false);
    }
  }, [modalMode, editId, form, refresh]);

  const toggleActive = useCallback(
    async (banner: Banner) => {
      try {
        await adminApi.updateBanner(banner.id, { isActive: !banner.isActive });
        await refresh();
      } catch {
        // Visual hint only — silent on failure for now.
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await adminApi.deleteBanner(confirmDelete.id);
      setItems((prev) => prev.filter((b) => b.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(
        isApiError(err) ? err.displayMessage : "Could not delete banner",
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [confirmDelete]);

  return (
    <>
      <AdminHeader
        title="CMS"
        subtitle="Banners — hero slides, side panels, scheduled campaigns"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> New banner
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <LayoutGrid size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Banners</p>
              <p className="text-xl font-bold text-gray-800">{items.length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Eye size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Active</p>
              <p className="text-xl font-bold text-gray-800">
                {items.filter((b) => b.isActive).length}
              </p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Positions</p>
              <p className="text-xl font-bold text-gray-800">
                {groupedByPosition.length}
              </p>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <ImageIcon size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-700 mb-1">
              No banners yet
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Add a banner image and assign it a position to start displaying it on the storefront.
            </p>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              <Plus size={14} /> New banner
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedByPosition.map(([position, list]) => (
              <div
                key={position}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 text-sm">
                    <code className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">
                      {position}
                    </code>
                  </h2>
                  <span className="text-xs text-gray-500">
                    {list.length} banner{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {list.map((b) => (
                    <div
                      key={b.id}
                      className="px-5 py-3 flex items-center gap-4"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={b.imageUrl}
                        alt=""
                        className="w-24 h-14 object-cover rounded border border-gray-200 flex-shrink-0 bg-gray-50"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-700">
                            Sort #{b.sortOrder}
                          </span>
                          {b.isActive ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                              PAUSED
                            </span>
                          )}
                        </div>
                        {b.linkUrl && (
                          <p className="text-xs text-[#129cd3] line-clamp-1">
                            → {b.linkUrl}
                          </p>
                        )}
                        {(b.activeFrom || b.activeTo) && (
                          <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                            <Calendar size={10} />
                            {b.activeFrom
                              ? new Date(b.activeFrom).toLocaleDateString(
                                  "en-IN",
                                  { day: "2-digit", month: "short", year: "numeric" },
                                )
                              : "open"}{" "}
                            →{" "}
                            {b.activeTo
                              ? new Date(b.activeTo).toLocaleDateString(
                                  "en-IN",
                                  { day: "2-digit", month: "short", year: "numeric" },
                                )
                              : "open"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleActive(b)}
                          className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                          aria-label={b.isActive ? "Pause" : "Activate"}
                          title={b.isActive ? "Pause" : "Activate"}
                        >
                          {b.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          onClick={() => openEdit(b)}
                          className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]"
                          aria-label="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDelete(b);
                            setDeleteError(null);
                          }}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                          aria-label="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banner form modal */}
      {modalMode !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">
                {modalMode === "create" ? "New banner" : "Edit banner"}
              </h2>
              <button
                onClick={closeModal}
                disabled={saveBusy || uploadBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Image */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Banner image
                </label>
                <div className="flex items-center gap-3">
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.imageUrl}
                      alt=""
                      className="w-32 h-20 object-cover rounded border border-gray-200 bg-gray-50"
                    />
                  ) : (
                    <div className="w-32 h-20 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400">
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadBusy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50 transition-colors"
                    >
                      {uploadBusy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ImagePlus size={13} />
                      )}
                      {form.imageObjectKey ? "Replace image" : "Upload image"}
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1">
                      JPG / PNG / WebP. Stored under banners/ — required.
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Recommended {currentSpec.recommended.w}×
                      {currentSpec.recommended.h}px (HD). Minimum{" "}
                      {currentSpec.hardMin.w}×{currentSpec.hardMin.h}px.
                      {imageDims && (
                        <span className="text-gray-400">
                          {" "}
                          Uploaded: {imageDims.w}×{imageDims.h}px.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {imageWarning && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {imageWarning}
                  </div>
                )}
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Position slot
                </label>
                <div className="flex gap-2">
                  <select
                    value={
                      KNOWN_POSITIONS.includes(
                        form.position as (typeof KNOWN_POSITIONS)[number],
                      )
                        ? form.position
                        : "__custom"
                    }
                    onChange={(e) => {
                      if (e.target.value === "__custom") {
                        setForm((prev) => ({ ...prev, position: "" }));
                      } else {
                        setForm((prev) => ({
                          ...prev,
                          position: e.target.value,
                        }));
                      }
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 bg-white"
                  >
                    {KNOWN_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value="__custom">Custom…</option>
                  </select>
                  {!KNOWN_POSITIONS.includes(
                    form.position as (typeof KNOWN_POSITIONS)[number],
                  ) && (
                    <input
                      type="text"
                      placeholder="custom_slot_name"
                      value={form.position}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          position: e.target.value,
                        }))
                      }
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                    />
                  )}
                </div>
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Click-through URL{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="/products?category=Phones"
                  value={form.linkUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, linkUrl: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>

              {/* Sort order */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Sort order
                </label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sortOrder: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>

              {/* Active window */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Active from{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.activeFrom}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        activeFrom: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Active to{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.activeTo}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, activeTo: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 accent-[#129cd3]"
                />
                Active (visible on the storefront within its date window)
              </label>
            </div>

            {formError && (
              <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saveBusy || uploadBusy}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saveBusy && <Loader2 size={16} className="animate-spin" />}
                {modalMode === "create" ? "Create banner" : "Save changes"}
              </button>
              <button
                onClick={closeModal}
                disabled={saveBusy || uploadBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deleteBusy && setConfirmDelete(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              Delete banner?
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              The banner in slot{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                {confirmDelete.position}
              </code>{" "}
              will be removed. The image stays in S3 (manual cleanup if needed).
            </p>
            {deleteError && (
              <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteBusy}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {deleteBusy && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
