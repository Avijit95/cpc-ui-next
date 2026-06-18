import { serverListProducts } from "@/lib/api/server";
import type { CatalogSort } from "@/lib/api";
import ProductSectionSlider from "./ProductSectionSlider";

type Props = {
  title: string;
  filter?: "new" | "bestseller" | "featured" | "all";
  viewAllHref?: string;
};

const ITEM_LIMIT = 7;

function queryFromFilter(filter: Props["filter"]): {
  sort?: CatalogSort;
  isFeatured?: boolean;
} {
  if (filter === "new") return { sort: "newest" };
  if (filter === "bestseller") return { sort: "popular" };
  if (filter === "featured") return { isFeatured: true };
  return {};
}

export default async function ProductSection({
  title,
  filter = "all",
  viewAllHref = "/products",
}: Props) {
  const resp = await serverListProducts({
    ...queryFromFilter(filter),
    limit: ITEM_LIMIT,
  });
  const items = resp?.items ?? [];

  if (items.length === 0) return null;

  return (
    <ProductSectionSlider title={title} items={items} viewAllHref={viewAllHref} />
  );
}
