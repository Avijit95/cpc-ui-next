import Image from "next/image";
import { Tag } from "lucide-react";
import {
  serverGetActiveBanners,
  serverGetCategories,
} from "@/lib/api/server";
import HeroSlider from "./HeroSlider";

const HOME_HERO_SLOT = "home_hero";
const HOME_SIDE_SLOT = "home_side";
const SIDEBAR_CATEGORY_LIMIT = 5;

export default async function HeroBanner() {
  const [banners, categories] = await Promise.all([
    serverGetActiveBanners(),
    serverGetCategories(),
  ]);

  const heroSlides = banners
    .filter((b) => b.position === HOME_HERO_SLOT)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sideBanners = banners
    .filter((b) => b.position === HOME_SIDE_SLOT)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sidebarCategories = categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, SIDEBAR_CATEGORY_LIMIT)
    .map((c) => ({
      slug: c.slug.toLowerCase(),
      name: c.name,
      imageUrl: c.imageUrl,
    }));

  return (
    <section className="bg-gray-100">
      <div className="max-w-7xl mx-auto flex">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-52 flex-shrink-0 bg-white shadow-sm">
          <div className="bg-[#129cd3] text-white px-4 py-3 flex items-center gap-2 font-semibold text-sm cursor-pointer">
            <span className="text-lg leading-none">☰</span> ALL CATEGORIES
          </div>
          <ul>
            {sidebarCategories.map((cat) => (
              <li key={cat.slug}>
                <a
                  href={`/products?category=${encodeURIComponent(cat.slug)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:text-[#129cd3] hover:bg-[#e8f7fc] border-b border-gray-100 transition-colors"
                >
                  <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {cat.imageUrl ? (
                      <Image
                        src={cat.imageUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5 object-cover rounded"
                      />
                    ) : (
                      <Tag size={14} className="text-gray-400" />
                    )}
                  </span>
                  {cat.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Center Slider */}
        <div className="flex-1 overflow-hidden relative min-h-[200px] sm:min-h-[320px]">
          <HeroSlider slides={heroSlides} />
        </div>

        {/* Right Banners */}
        {sideBanners.length > 0 && (
          <div className="hidden xl:flex flex-col w-48 flex-shrink-0 border-l border-gray-200">
            {sideBanners.map((banner) => {
              const href = banner.linkUrl ?? "#";
              return (
                <a
                  key={banner.id}
                  href={href}
                  aria-label="Promotional banner"
                  className="flex-1 relative overflow-hidden border-b border-gray-200 block hover:opacity-90 transition-opacity"
                >
                  <Image
                    src={banner.imageUrl}
                    alt=""
                    fill
                    sizes="192px"
                    className="object-cover"
                  />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
