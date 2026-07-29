import type { Metadata } from "next";
import { serverGetProduct } from "@/lib/api/server";
import type { ProductDetail, Variant } from "@/lib/api";
import ProductDetailClient from "./ProductDetailClient";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const MAX_MULTIMODEL = 10;

function multiModelKey(base: string, idx: number) {
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

function crumbMatch(product: ProductDetail, term: string) {
  return product.breadcrumbs.some(
    (b) => b.slug?.toLowerCase().includes(term) || b.name?.toLowerCase().includes(term)
  );
}

function resolveVariantTitle(product: ProductDetail, variant: Variant): string {
  // 1. Direct variant name attribute (used by TVs and others)
  if (variant.attributes?.name) return String(variant.attributes.name);

  const specs = product.specs as Record<string, unknown>;
  const isTv = crumbMatch(product, "tv") || crumbMatch(product, "television");
  const isLens = crumbMatch(product, "lens");
  const isSpeaker = !isLens && crumbMatch(product, "speaker");
  const isCamera = !isLens && crumbMatch(product, "camera");
  const isSmartDevice = !isTv && !isLens && !isSpeaker && !isCamera && crumbMatch(product, "smart");

  const specNameKey = isLens ? "Lens Name" : "Product Name";

  // 2. For TVs: match by size attribute against "Screen Size" specs
  if (isTv) {
    const sizeAttr = String(variant.attributes?.size ?? "").trim().toLowerCase().replace(/['"]/g, "");
    if (sizeAttr) {
      for (let i = 0; i < MAX_MULTIMODEL; i++) {
        const screenSize = String(specs[multiModelKey("Screen Size", i)] ?? "").trim().toLowerCase().replace(/['"]/g, "");
        if (screenSize && screenSize.includes(sizeAttr)) {
          const n = String(specs[multiModelKey("Product Name", i)] ?? "").trim();
          if (n) return n;
        }
      }
    }
    // Fall back to size number word-boundary match in "Product Name N"
    const sizeNum = sizeAttr.replace(/[^0-9]/g, "");
    if (sizeNum) {
      const re = new RegExp(`(?<![0-9])${sizeNum}(?![0-9])`);
      for (let i = 0; i < MAX_MULTIMODEL; i++) {
        const n = String(specs[multiModelKey("Product Name", i)] ?? "").trim();
        if (n && re.test(n)) return n;
      }
    }
  }

  // 3. For lens/speaker/camera/smart device: match by model attribute position
  if (isLens || isSpeaker || isCamera || isSmartDevice) {
    const modelAttr = String(variant.attributes?.model ?? variant.attributes?.ram ?? "").trim().toLowerCase();
    if (modelAttr) {
      for (let i = 0; i < MAX_MULTIMODEL; i++) {
        const n = String(specs[multiModelKey(specNameKey, i)] ?? "").trim();
        if (n && n.toLowerCase().includes(modelAttr)) return n;
      }
    }
    // Fall back: use variant position in variants array
    const pos = product.variants.findIndex((v) => v.id === variant.id);
    if (pos >= 0 && pos < MAX_MULTIMODEL) {
      const n = String(specs[multiModelKey(specNameKey, pos)] ?? "").trim();
      if (n) return n;
    }
  }

  return product.name;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const variantId = typeof sp.variant === "string" ? sp.variant : undefined;

  const product = await serverGetProduct(slug);
  if (!product) return {};

  const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;

  // Pick the image: variant image first, then product image
  let imageUrl: string | null = variant?.images?.[0]?.url ?? null;
  if (!imageUrl) {
    const sorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
    imageUrl = sorted[0]?.url ?? null;
  }

  // Resolve title: use variant-specific name when available
  const title = variant ? resolveVariantTitle(product, variant) : product.name;

  // description: prefer product.description, fall back to specs["Description"]
  // Strip any corrupted trailing data (runs of repeated chars like AAAA...)
  const rawDesc =
    product.description?.trim() ||
    String(product.specs?.["Description"] ?? "").trim() ||
    "";
  const description = rawDesc
    ? rawDesc.replace(/(.)\1{10,}/g, "").trim() || undefined
    : undefined;

  const pageUrl = `/products/${slug}${variantId ? `?variant=${variantId}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      siteName: "CellPhone Crowd",
      type: "website",
      url: pageUrl,
      title,
      description,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default function ProductDetailPage() {
  return <ProductDetailClient />;
}
