"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  FolderTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminCategoryListItem } from "@/lib/api";

function deleteErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Couldn't delete the category. Try again.";
  switch (err.code) {
    case "CATEGORY_HAS_PRODUCTS":
      return "This category still has products attached. Reassign or archive them first.";
    case "CATEGORY_HAS_CHILDREN":
      return "This category still has child categories. Detach or delete them first.";
    default:
      return err.displayMessage || "Couldn't delete the category.";
  }
}

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<AdminCategoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [confirmTarget, setConfirmTarget] =
    useState<AdminCategoryListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listCategories()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            isApiError(err)
              ? err.displayMessage
              : "Couldn't load categories. Try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const parentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of items) m.set(c.id, c.name);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [items, query]);

  const productTotal = useMemo(
    () => items.reduce((sum, c) => sum + (c._count?.products ?? 0), 0),
    [items],
  );
  const rootCount = useMemo(
    () => items.filter((c) => !c.parentId).length,
    [items],
  );

  const onDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await adminApi.deleteCategory(confirmTarget.id);
      setItems((prev) => prev.filter((c) => c.id !== confirmTarget.id));
      setConfirmTarget(null);
    } catch (err) {
      setDeleteError(deleteErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Categories"
        subtitle="Organize your storefront into a category tree"
        actions={
          <Link
            href="/admin/categories/add"
            className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Add category
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              label: "Total Categories",
              value: items.length,
              tint: "bg-[#e8f7fc] text-[#129cd3]",
            },
            {
              label: "Root Categories",
              value: rootCount,
              tint: "bg-emerald-50 text-emerald-600",
            },
            {
              label: "Products in Catalog",
              value: productTotal,
              tint: "bg-amber-50 text-amber-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4"
            >
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.tint}`}
              >
                <FolderTree size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or slug…"
              className="bg-transparent outline-none text-sm text-gray-700 flex-1"
            />
          </div>
        </div>

        {/* Top-level error / loading */}
        {errorMsg && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={reload}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-5 py-3">Slug</th>
                  <th className="text-left font-semibold px-5 py-3">Parent</th>
                  <th className="text-left font-semibold px-5 py-3">Sort</th>
                  <th className="text-left font-semibold px-5 py-3">Products</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <Loader2
                        className="animate-spin text-[#129cd3] inline-block"
                        size={22}
                      />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      {items.length === 0
                        ? "No categories yet. Click \"Add category\" to create your first one."
                        : "No categories match your search."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const parentName = c.parentId
                      ? parentNameById.get(c.parentId)
                      : null;
                    const productCount = c._count?.products ?? 0;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
                              <FolderTree size={16} />
                            </div>
                            <p className="font-semibold text-gray-800">
                              {c.name}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <code className="text-[12px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {c.slug}
                          </code>
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {parentName ?? (
                            <span className="text-gray-400">— Root —</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {c.sortOrder}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              productCount === 0
                                ? "bg-gray-50 text-gray-500 border-gray-200"
                                : "bg-emerald-50 text-emerald-600 border-emerald-200"
                            }`}
                          >
                            {productCount}{" "}
                            {productCount === 1 ? "product" : "products"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/admin/categories/${c.id}/edit`}
                              className="p-1.5 rounded text-gray-400 hover:text-[#129cd3] hover:bg-[#e8f7fc]"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </Link>
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                setConfirmTarget(c);
                              }}
                              className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                            <button
                              className="p-1.5 rounded text-gray-400 hover:text-gray-700"
                              aria-label="More"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>
                Showing {filtered.length} of {items.length} categories
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !deleting && setConfirmTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">
                  Delete category?
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  This action cannot be undone.
                </p>
              </div>
              <button
                onClick={() => !deleting && setConfirmTarget(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-700 mb-2">
              You&apos;re about to delete{" "}
              <span className="font-semibold">{confirmTarget.name}</span>{" "}
              <code className="text-[12px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {confirmTarget.slug}
              </code>
              .
            </p>

            {deleteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={deleting}
                className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-[#129cd3] hover:text-[#129cd3]"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-red-200 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
