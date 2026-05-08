"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import CategoryForm from "@/components/admin/CategoryForm";

export default function AddCategoryPage() {
  return (
    <>
      <AdminHeader
        title="Add Category"
        subtitle="Create a new category for your storefront"
      />
      <CategoryForm mode={{ kind: "create" }} />
    </>
  );
}
