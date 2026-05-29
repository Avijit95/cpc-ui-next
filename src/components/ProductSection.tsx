import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { serverListProducts } from "@/lib/api/server";
import type { CatalogSort } from "@/lib/api";

type Props = {
  title: string;
  filter?: "new" | "bestseller" | "featured" | "all";
};

const ITEM_LIMIT = 8;

function queryFromFilter(filter: Props["filter"]): {
  sort?: CatalogSort;
  isFeatured?: boolean;
} {
  if (filter === "new") return { sort: "newest" };
  if (filter === "bestseller") return { sort: "popular" };
  if (filter === "featured") return { isFeatured: true };
  return {};
}

export default async function ProductSection({ title, filter = "all" }: Props) {
  const resp = await serverListProducts({
    ...queryFromFilter(filter),
    limit: ITEM_LIMIT,
  });
  const items = resp?.items ?? [];

  if (items.length === 0) return null;

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-bold text-white bg-[#129cd3] px-4 py-2 uppercase tracking-wide">
            {title}
          </h2>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              aria-label="Previous products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors ml-2"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              aria-label="Next products"
              className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
