import { Truck, RotateCcw, CreditCard, Headphones, Gift } from "lucide-react";

const features = [
  { icon: Truck, title: "FREE DELIVERY", desc: "On orders above ₹999" },
  { icon: RotateCcw, title: "EASY RETURNS", desc: "30-day return policy" },
  { icon: CreditCard, title: "SECURE PAYMENT", desc: "100% secure checkout" },
  { icon: Gift, title: "GIFT CARDS", desc: "Give the perfect gift" },
  { icon: Headphones, title: "24/7 SUPPORT", desc: "Dedicated customer care" },
];

export default function TrustBar() {
  return (
    <section className="py-5 px-4 bg-[#129cd3]">
      <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <p className="trustbar-title text-white font-bold text-xs">{title}</p>
              <p className="text-[#b3e3f5] text-[11px] leading-normal">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
