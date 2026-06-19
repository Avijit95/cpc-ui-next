import Image from "next/image";
import HeroBanner from "@/components/HeroBanner";
import CategorySection from "@/components/CategorySection";
import TrustBar from "@/components/TrustBar";
import ProductSection from "@/components/ProductSection";
import ProductTabs from "@/components/ProductTabs";
import DealsSection from "@/components/DealsSection";
import PromoBanners from "@/components/PromoBanners";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { serverGetActiveBanners, serverGetNavLinks, serverListProducts } from "@/lib/api/server";

export default async function Home() {
  const [tabsInitial, navLinks, banners] = await Promise.all([
    serverListProducts({ newOnly: true, limit: 7 }),
    serverGetNavLinks(),
    serverGetActiveBanners(),
  ]);

  const sideBanners = banners
    .filter((b) => b.position === "home_side")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header initialNavLinks={navLinks} />
      <main>
        <HeroBanner />
        <CategorySection />
        <DealsSection />

        {/* Side banner 1 — mobile only (below 768px), after Deals & Best Sellers */}
        {sideBanners[0] && (
          <div className="block min-[500px]:hidden px-3 py-2">
            <a
              href={sideBanners[0].linkUrl ?? "#"}
              aria-label="Promotional banner"
              className="block relative w-full overflow-hidden rounded" style={{ height: "200px", maxHeight: "200px" }}
            >
              <Image
                src={sideBanners[0].imageUrl}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
            </a>
          </div>
        )}

        <ProductSection title="Featured" filter="featured" />

        {/* Side banner 2 — mobile only (below 768px), after Featured */}
        {sideBanners[1] && (
          <div className="block min-[500px]:hidden px-3 py-2">
            <a
              href={sideBanners[1].linkUrl ?? "#"}
              aria-label="Promotional banner"
              className="block relative w-full overflow-hidden rounded" style={{ height: "200px", maxHeight: "200px" }}
            >
              <Image
                src={sideBanners[1].imageUrl}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
            </a>
          </div>
        )}

        <ProductTabs title="New Arrivals" items={tabsInitial?.items ?? []} />
        <PromoBanners />
      </main>
      <TrustBar />
      <Footer />
    </div>
  );
}
