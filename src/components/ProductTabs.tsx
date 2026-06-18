import ProductSectionSlider from "./ProductSectionSlider";
import type { ListCard } from "@/lib/api";

type Props = {
  title: string;
  items: ListCard[];
  viewAllHref?: string;
};

export default function ProductTabs({ title, items, viewAllHref = "/products" }: Props) {
  if (items.length === 0) return null;

  return (
    <ProductSectionSlider title={title} items={items} viewAllHref={viewAllHref} />
  );
}
