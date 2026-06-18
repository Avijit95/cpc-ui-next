import ProductCard from "./ProductCard";
import type { ListCard } from "@/lib/api";

type Props = {
  title: string;
  items: ListCard[];
};

export default function ProductTabs({ title, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-bold text-white bg-[#129cd3] px-4 py-2 uppercase tracking-wide">
            {title}
          </h2>
        </div>

        <div className="product-home-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
