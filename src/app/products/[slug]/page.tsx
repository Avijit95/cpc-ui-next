import type { Metadata } from "next";
import { serverGetProduct } from "@/lib/api/server";
import ProductDetailClient from "./ProductDetailClient";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const variantId = typeof sp.variant === "string" ? sp.variant : undefined;

  const product = await serverGetProduct(slug);
  if (!product) return {};

  // Pick the image: variant image first, then product image
  let imageUrl: string | null = null;
  if (variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    imageUrl = variant?.images?.[0]?.url ?? null;
  }
  if (!imageUrl) {
    const sorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
    imageUrl = sorted[0]?.url ?? null;
  }

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description: product.description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default function ProductDetailPage() {
  return <ProductDetailClient />;
}
