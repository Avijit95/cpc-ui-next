import { brands } from "@/data/products";

export default function BrandSection() {
  return (
    <section className="py-10 px-4 bg-gray-50 border-t border-gray-100">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-center text-lg font-semibold text-gray-500 uppercase tracking-widest mb-8">
          Top Brands
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {brands.map((brand) => (
            <a
              key={brand.id}
              href="#"
              className="bg-white border border-gray-200 rounded-xl px-6 py-3 text-gray-600 font-semibold hover:border-blue-300 hover:text-blue-600 hover:shadow transition-all text-sm"
            >
              {brand.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
