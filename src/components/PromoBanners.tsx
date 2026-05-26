import Image from "next/image";

const promos = [
  {
    id: 1,
    label: "COLORFUL DEALS",
    title: "Punchy Audio Gear",
    price: "Starting ₹1,299",
    bg: "bg-gradient-to-r from-orange-100 to-yellow-50",
    border: "border-[#b3e3f5]",
    textColor: "text-[#0a6e99]",
    image: "https://placehold.co/280x150/fed7aa/9a3412?text=Audio+Deals",
  },
  {
    id: 2,
    label: "GOING WIRELESS?",
    title: "Latest Earphone Collection",
    price: "Starting ₹2,499",
    bg: "bg-gradient-to-r from-blue-100 to-cyan-50",
    border: "border-blue-200",
    textColor: "text-blue-700",
    image: "https://placehold.co/280x150/bfdbfe/1e40af?text=Earphones",
  },
];

export default function PromoBanners() {
  return (
    <section className="py-8 px-4 bg-gray-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        {promos.map((promo) => (
          <div
            key={promo.id}
            className={`${promo.bg} border ${promo.border} rounded overflow-hidden flex items-center justify-between p-6 hover:shadow-md transition-shadow`}
          >
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${promo.textColor} mb-1`}>
                {promo.label}
              </p>
              <h3 className={`text-xl font-bold ${promo.textColor} mb-1`}>{promo.title}</h3>
              <p className={`text-sm ${promo.textColor} opacity-80 mb-4`}>{promo.price}</p>
              <a href="#" className="inline-flex items-center gap-1 text-[#0e87b5] font-semibold text-xs border border-[#129cd3] px-3 py-1.5 hover:bg-[#129cd3] hover:text-white transition-colors">
                ➤ SEE MORE
              </a>
            </div>
            <Image
              src={promo.image}
              alt={promo.title}
              width={144}
              height={112}
              className="w-36 h-28 object-cover rounded hidden sm:block"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
