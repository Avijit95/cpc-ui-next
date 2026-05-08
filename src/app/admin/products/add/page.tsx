"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import ProductForm from "@/components/admin/ProductForm";

export default function AddProductPage() {
  return (
    <>
      <AdminHeader
        title="Add Product"
        subtitle="Create a new product listing in your catalog"
      />
      <ProductForm mode={{ kind: "create" }} />
    </>
  );
}
