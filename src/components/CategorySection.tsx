import { serverGetCategories } from "@/lib/api/server";
import { imageUrlForKey } from "@/lib/image-url";
import CategorySlider from "./CategorySlider";

const ITEM_LIMIT = 12;

export default async function CategorySection() {
  const all = await serverGetCategories();
  const sorted = all
    .map((c) => ({ ...c, imageUrl: imageUrlForKey(c.imageObjectKey ?? "") ?? c.imageUrl }))
    .filter((c) => c.imageUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Reorder: Phone first, then Camera, then Camera Lens immediately after Camera
  function moveItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
    if (fromIdx === -1 || fromIdx === toIdx) return arr;
    const r = [...arr];
    const [item] = r.splice(fromIdx, 1);
    const adj = fromIdx < toIdx ? toIdx - 1 : toIdx;
    r.splice(adj, 0, item);
    return r;
  }

  let reordered = sorted;

  // 1. Move Phone to front
  const phoneIdx = reordered.findIndex((c) => c.name.toLowerCase() === "phone" || c.name.toLowerCase().includes("phone"));
  reordered = moveItem(reordered, phoneIdx, 0);

  // 2. Move Camera Lens to right after Camera (match by name)
  const cameraIdx = reordered.findIndex((c) => {
    const n = c.name.toLowerCase();
    return n === "camera" || (n.includes("camera") && !n.includes("lens"));
  });
  const lensIdx = reordered.findIndex((c) => c.name.toLowerCase().includes("lens"));
  if (cameraIdx !== -1 && lensIdx !== -1 && lensIdx !== cameraIdx + 1) {
    reordered = moveItem(reordered, lensIdx, cameraIdx + 1);
  }

  let items = reordered
    .slice(0, ITEM_LIMIT)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.imageUrl! }));

  // If Camera Lens is not in the API list, inject it after Camera
  const hasLens = items.some((c) => c.name.toLowerCase().includes("lens"));
  if (!hasLens) {
    const camPos = items.findIndex((c) => c.name.toLowerCase().includes("camera") && !c.name.toLowerCase().includes("lens"));
    const lensCard = { id: "camera-lens", name: "Camera Lens", slug: "camera-lens", imageUrl: "/Sony Alpha ZV-E10.jpeg" };
    if (camPos !== -1) {
      items = [...items.slice(0, camPos + 1), lensCard, ...items.slice(camPos + 1)];
    } else {
      items = [lensCard, ...items];
    }
  }

  if (items.length === 0) return null;

  return <CategorySlider items={items} />;
}
