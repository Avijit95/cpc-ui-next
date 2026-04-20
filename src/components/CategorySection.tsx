import { ArrowRight } from "lucide-react";
import { categories } from "@/data/products";

export default function CategorySection() {
  return (
    <section className="py-10 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Shop by Category</h2>
            <p className="text-gray-500 text-sm mt-1">Find what you&apos;re looking for</p>
          </div>
          <a href="#" className="flex items-center gap-1 text-blue-600 text-sm font-medium hover:gap-2 transition-all">
            View All <ArrowRight size={16} />
          </a>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <a
              key={cat.id}
              href="#"
              className="group flex flex-col items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
            >
              <div className={`w-14 h-14 ${cat.color} rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                {cat.icon}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{cat.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cat.count}+ items</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
