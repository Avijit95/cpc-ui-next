"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import CategoryForm from "@/components/admin/CategoryForm";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminCategoryListItem } from "@/lib/api";

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [category, setCategory] = useState<AdminCategoryListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await adminApi.getCategory(id);
        if (!cancelled) setCategory(c);
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && err.statusCode === 404) {
          router.replace("/admin/categories");
          return;
        }
        setErrorMsg(
          isApiError(err)
            ? err.displayMessage
            : "Couldn't load this category. Try again.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <>
      <AdminHeader
        title="Edit Category"
        subtitle={category ? category.name : "Update category details"}
      />

      {loading && (
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#129cd3]" size={26} />
        </div>
      )}

      {!loading && errorMsg && (
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        </div>
      )}

      {!loading && category && (
        <CategoryForm mode={{ kind: "edit", categoryId: id, initial: category }} />
      )}
    </>
  );
}
