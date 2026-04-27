import { ChevronLeft, ChevronRight } from "lucide-react";

const featuredCategories = [
  { id: 1, name: "Phone", image: "/phone.jpg" },
  { id: 2, name: "Camera", image: "/camera.jpg" },
  { id: 3, name: "Speakers", image: "/speakers.jpg" },
  { id: 4, name: "TV", image: "/tv.jpg" },
  { id: 5, name: "Accessories", image: "/accessories.jpg" },
];

export default function CategorySection() {
  return (
    <section className="py-8 px-4 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-l-4 border-[#129cd3] pl-3">
            FEATURED CATEGORIES
          </h2>
          <div className="flex gap-1.5">
            <button className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors">
              <ChevronLeft size={13} />
            </button>
            <button className="w-7 h-7 border border-gray-300 rounded flex items-center justify-center hover:border-[#129cd3] hover:text-[#129cd3] text-gray-500 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {featuredCategories.map((cat) => (
            <a
              key={cat.id}
              href={`/products?category=${encodeURIComponent(cat.name)}`}
              className="group flex flex-col items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <div className="w-full aspect-square overflow-hidden border border-gray-100 group-hover:border-[#8dd4ee] transition-colors rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <p className="text-xs font-semibold text-gray-700 group-hover:text-[#129cd3] transition-colors text-center">
                {cat.name}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
