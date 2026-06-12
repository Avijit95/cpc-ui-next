// Build a public image URL from an S3 object key. Product and variant images
// live under the public-read `products/` prefix, so the direct S3 URL works.
// Mirrors the API's s3.publicUrlFor (= S3_PUBLIC_BASE_URL + "/" + key).
const BASE = (process.env.NEXT_PUBLIC_S3_PUBLIC_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);

export function imageUrlForKey(key: string): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key; // already an absolute URL
  if (!BASE) return null;
  return `${BASE}/${key}`;
}
