import HeroBanner from "@/components/HeroBanner";
import CategorySection from "@/components/CategorySection";
import TrustBar from "@/components/TrustBar";
import ProductSection from "@/components/ProductSection";
import ProductTabs from "@/components/ProductTabs";
import DealsSection from "@/components/DealsSection";
import PromoBanners from "@/components/PromoBanners";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { serverGetNavLinks, serverListProducts } from "@/lib/api/server";

export default async function Home() {
  const [tabsInitial, navLinks] = await Promise.all([
    serverListProducts({ sort: "popular", limit: 8 }),
    serverGetNavLinks(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header initialNavLinks={navLinks} />
      <main>
        <HeroBanner />
        <CategorySection />
        <DealsSection />
        <ProductSection title="Best Sellers" filter="bestseller" />
        <ProductTabs
          title="New Arrivals"
          initialItems={tabsInitial?.items ?? []}
        />
        <PromoBanners />
      </main>
      <TrustBar />
      <Footer />
    </div>
  );
}
