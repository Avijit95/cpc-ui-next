import { ArrowRight } from "lucide-react";

const promos = [
  {
    id: 1,
    title: "Become a Partner",
    subtitle: "Access wholesale pricing & exclusive deals",
    cta: "Apply Now",
    bg: "from-indigo-600 to-purple-700",
    emoji: "🤝",
  },
  {
    id: 2,
    title: "New Arrivals",
    subtitle: "Just launched — be the first to grab them",
    cta: "Explore",
    bg: "from-emerald-500 to-teal-600",
    emoji: "✨",
  },
];

export default function PromoBanners() {
  return (
    <section className="py-10 px-4 bg-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
        {promos.map((promo) => (
          <div
            key={promo.id}
            className={`bg-gradient-to-r ${promo.bg} rounded-2xl p-6 flex items-center justify-between shadow-md hover:shadow-lg transition-shadow`}
          >
            <div>
              <div className="text-3xl mb-2">{promo.emoji}</div>
              <h3 className="text-xl font-bold text-white mb-1">{promo.title}</h3>
              <p className="text-white/80 text-sm mb-4">{promo.subtitle}</p>
              <a
                href="#"
                className="inline-flex items-center gap-1.5 bg-white text-gray-900 font-semibold text-sm px-4 py-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                {promo.cta} <ArrowRight size={14} />
              </a>
            </div>
            <div className="hidden sm:block w-24 h-24 bg-white/10 rounded-2xl"></div>
          </div>
        ))}
      </div>
    </section>
  );
}
