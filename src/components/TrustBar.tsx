import { Truck, ShieldCheck, RotateCcw, Headphones } from "lucide-react";

const features = [
  { icon: Truck, title: "Free Delivery", desc: "On orders above ₹999" },
  { icon: ShieldCheck, title: "Genuine Products", desc: "100% authentic guarantee" },
  { icon: RotateCcw, title: "Easy Returns", desc: "7-day hassle-free return" },
  { icon: Headphones, title: "24/7 Support", desc: "Dedicated customer care" },
];

export default function TrustBar() {
  return (
    <section className="py-8 px-4 bg-blue-600">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{title}</p>
              <p className="text-blue-100 text-xs">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
