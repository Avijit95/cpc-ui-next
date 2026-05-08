"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import CouponAttachments from "@/components/admin/CouponAttachments";
import ProductForm from "@/components/admin/ProductForm";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminProductDetail } from "@/lib/api";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await adminApi.getProduct(id);
        if (!cancelled) setProduct(p);
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && err.statusCode === 404) {
          router.replace("/admin/products");
          return;
        }
        setErrorMsg(
          isApiError(err)
            ? err.displayMessage
            : "Couldn't load this product. Try again.",
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
        title="Edit Product"
        subtitle={product ? product.name : "Update product details"}
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

      {!loading && product && (
        <>
          <ProductForm mode={{ kind: "edit", productId: id, initial: product }} />
          <CouponAttachments productId={id} />
        </>
      )}
    </>
  );
}
