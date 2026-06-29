"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import ProductForm from "@/components/admin/ProductForm";

function AddProductInner() {
  const searchParams = useSearchParams();
  const categoryId = searchParams.get("categoryId") ?? undefined;
  return <ProductForm mode={{ kind: "create", initialCategoryId: categoryId }} />;
}

export default function AddProductPage() {
  return (
    <>
      <AdminHeader
        title="Add Product"
        subtitle="Create a new product listing in your catalog"
      />
      <Suspense fallback={null}>
        <AddProductInner />
      </Suspense>
    </>
  );
}
