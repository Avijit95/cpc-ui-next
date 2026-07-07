import Image from "next/image";
import { Tag } from "lucide-react";
import {
  serverGetActiveBanners,
  serverGetCategories,
} from "@/lib/api/server";
import { imageUrlForKey } from "@/lib/image-url";
import HeroSlider from "./HeroSlider";

const HOME_HERO_SLOT = "home_hero";
const HOME_SIDE_SLOT = "home_side";
const SIDEBAR_CATEGORY_LIMIT = 10;

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

  const allMapped = categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      slug: c.slug.toLowerCase(),
      name: c.name,
      imageUrl: imageUrlForKey(c.imageObjectKey ?? "") ?? c.imageUrl,
    }));

  // Move Camera Lens to immediately after Camera, then slice.
  function moveItem<T>(arr: T[], from: number, to: number): T[] {
    if (from === -1 || from === to) return arr;
    const r = [...arr];
    const [item] = r.splice(from, 1);
    r.splice(from < to ? to - 1 : to, 0, item);
    return r;
  }
  const cameraPos = allMapped.findIndex((c) => c.slug === "camera");
  const lensPos = allMapped.findIndex((c) => c.name.toLowerCase().includes("lens"));
  const reordered = (cameraPos !== -1 && lensPos !== -1)
    ? moveItem(allMapped, lensPos, cameraPos + 1)
    : allMapped;

  let sidebarCategories = reordered.slice(0, SIDEBAR_CATEGORY_LIMIT);

  // If Camera Lens still not in the slice, inject fallback after Camera.
  const hasLens = sidebarCategories.some((c) => c.name.toLowerCase().includes("lens"));
  if (!hasLens) {
    const camIdx = sidebarCategories.findIndex((c) => c.slug === "camera");
    const insertAt = camIdx >= 0 ? camIdx + 1 : sidebarCategories.length;
    sidebarCategories = [
      ...sidebarCategories.slice(0, insertAt),
      { slug: "camera-lens", name: "Camera Lens", imageUrl: "/Sony Alpha ZV-E10.jpeg" },
      ...sidebarCategories.slice(insertAt),
    ];
  }

  return (
    <section className="bg-gray-100">
      <div className="max-w-7xl mx-auto flex">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-[170px] xl:w-52 flex-shrink-0 bg-white shadow-sm">
          <div className="all-categories-btn bg-[#129cd3] text-white px-4 py-3 flex items-center gap-2 font-semibold text-sm cursor-pointer">
            <span className="text-lg leading-none">☰</span> ALL CATEGORIES
          </div>
          <ul>
            {sidebarCategories.map((cat) => (
              <li key={cat.slug}>
                <a
                  href={`/products?category=${encodeURIComponent(cat.slug)}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:text-[#129cd3] hover:bg-[#e8f7fc] border-b border-gray-100 transition-colors"
                >
                  <span className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded overflow-hidden bg-gray-50 border border-gray-100">
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <Tag size={16} className="text-gray-400" />
                    )}
                  </span>
                  {cat.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Center Slider */}
        <div className="flex-1 overflow-hidden relative max-lg:h-[clamp(200px,36.2vw,370px)] max-lg:min-h-[inherit] lg:min-h-[370px] xl:min-h-[320px] bg-black">
          <HeroSlider slides={heroSlides} />
        </div>

        {/* Right Banners */}
        {sideBanners.length > 0 && (
          <div className="hidden lg:flex flex-col w-[170px] xl:w-48 flex-shrink-0 border-l border-gray-200">
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
