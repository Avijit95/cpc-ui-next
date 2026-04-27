import HeroBanner from "@/components/HeroBanner";
import CategorySection from "@/components/CategorySection";
import TrustBar from "@/components/TrustBar";
import ProductSection from "@/components/ProductSection";
import DealsSection from "@/components/DealsSection";
import PromoBanners from "@/components/PromoBanners";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        <HeroBanner />
        <CategorySection />
        <DealsSection />
        <ProductSection
          title="Best Sellers"
          filter="bestseller"
          showTabs={false}
        />
        <ProductSection
          title="New Arrivals"
          filter="new"
          showTabs={true}
        />
        <PromoBanners />
      </main>
      <TrustBar />
      <Footer />
    </div>
  );
}
