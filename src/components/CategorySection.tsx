import { serverGetCategories } from "@/lib/api/server";
import CategorySlider from "./CategorySlider";

const ITEM_LIMIT = 12;

export default async function CategorySection() {
  const all = await serverGetCategories();
  const items = all
    .filter((c) => c.imageUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, ITEM_LIMIT)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.imageUrl! }));

  if (items.length === 0) return null;

  return <CategorySlider items={items} />;
}
