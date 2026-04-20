import HeroBanner from "@/components/HeroBanner";
import CategorySection from "@/components/CategorySection";
import TrustBar from "@/components/TrustBar";
import ProductSection from "@/components/ProductSection";
import DealsSection from "@/components/DealsSection";
import PromoBanners from "@/components/PromoBanners";
import BrandSection from "@/components/BrandSection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        <HeroBanner />
        <TrustBar />
        <CategorySection />
        <ProductSection
          title="Best Sellers"
          subtitle="Our most loved products"
          filter="bestseller"
          showTabs={false}
        />
        <DealsSection />
        <ProductSection
          title="New Arrivals"
          subtitle="Fresh off the shelf — just launched"
          filter="new"
          showTabs={true}
        />
        <PromoBanners />
        <BrandSection />
      </main>
      <Footer />
    </div>
  );
}
