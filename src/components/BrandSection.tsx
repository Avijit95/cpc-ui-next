import { brands } from "@/data/products";

export default function BrandSection() {
  return (
    <section className="py-8 px-4 bg-white/20 section-gradient-border">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-l-4 border-orange-500 pl-3 mb-6">
          OUR BRANDS
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {brands.map((brand) => (
            <a
              key={brand.id}
              href="#"
              className="bg-white border border-gray-200 px-8 py-3 text-gray-500 font-semibold text-sm hover:border-orange-400 hover:text-orange-500 hover:shadow-sm transition-all"
            >
              {brand.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
