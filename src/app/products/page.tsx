"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { ProductCardExpander, ProductCardSkeleton, detailCache } from "@/components/ProductCard";
import { apiLimiter } from "@/lib/apiLimiter";
import { catalogApi, isApiError } from "@/lib/api";
import type {
  BrandFacet,
  CatalogSort,
  CategoryNode,
  ListCard,
  ProductListResponse,
  Variant,
} from "@/lib/api";
import { SlidersHorizontal, ChevronDown, ChevronUp, Star, ArrowLeft } from "lucide-react";
import { reorderCategories } from "@/lib/nav/categoryUtils";

type CategoryOption = { slug: string; name: string };

type SortOption = {
  label: string;
  value: CatalogSort | undefined;
};

const sortOptions: SortOption[] = [
  { label: "Featured", value: undefined },
  { label: "Top Rated", value: "top-rated" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Newest", value: "newest" },
];

const ratingOptions = [4, 3, 2, 1] as const;

const PAGE_LIMIT = 24;

const PRICE_FLOOR = 0;
// PRICE_CEIL is the open-ended sentinel — prices at or above this value have no upper bound applied.
// SLIDER_MAX is the visual maximum of the range slider (₹2L); the slider snaps to PRICE_CEIL when dragged to the end.
const PRICE_CEIL = 100_000_000; // sentinel: "no upper bound"
const SLIDER_MAX = 200000;      // visual top of the slider
const PRICE_STEP = 1000;

// Quick-pick ranges; "Above ₹2L" uses PRICE_CEIL so no upper bound is applied.
const priceBuckets: { label: string; min: number; max: number }[] = [
  { label: "Below ₹10K", min: 0, max: 10000 },
  { label: "₹11K – ₹24.9K", min: 11000, max: 24900 },
  { label: "₹25K – ₹49.9K", min: 25000, max: 49900 },
  { label: "₹50K – ₹79.9K", min: 50000, max: 79900 },
  { label: "₹80K – ₹1.349L", min: 80000, max: 134900 },
  { label: "₹1.35L – ₹2L", min: 135000, max: 200000 },
  { label: "Above ₹2L", min: 200001, max: PRICE_CEIL },
];

// ── Phone-specific filter groups ──────────────────────────────────────────────
type PhoneFilterGroup = { key: string; label: string; options: string[] };

const PHONE_FILTER_GROUPS: PhoneFilterGroup[] = [
  {
    key: "ram",
    label: "RAM",
    options: ["4 GB and Below", "6 GB", "8 GB and Above"],
  },
  {
    key: "storage",
    label: "Internal Storage",
    options: [
      "64 GB and Below",
      "64 GB - 127.9 GB",
      "128 GB - 255.9 GB",
      "256 GB and Above",
    ],
  },
  {
    key: "battery",
    label: "Battery Capacity",
    options: [
      "Less than 4000 mAh",
      "4000 - 6000 mAh",
      "Above 6000 mAh",
    ],
  },
  {
    key: "screenSize",
    label: "Screen Size",
    options: [
      "Below 4.4 inch",
      "4.5 - 5.6 inch",
      "5.7 - 6.4 inch",
      "Above 6.4 inch",
    ],
  },
  {
    key: "primaryCamera",
    label: "Rear Camera",
    options: [
      "Below 20.9 MP",
      "21 - 47.9 MP",
      "48 - 63.9 MP",
      "Above 64 MP",
    ],
  },
  {
    key: "secondaryCamera",
    label: "Front Camera",
    options: [
      "Below 12 MP",
      "12 - 15.9 MP",
      "16 - 20.9 MP",
      "21 MP and Above",
    ],
  },
];

// ── Camera-specific filter groups ────────────────────────────────────────────
type CameraFilterGroup = { key: string; label: string; options: string[] };

const CAMERA_FILTER_GROUPS: CameraFilterGroup[] = [
  {
    key: "cameraType",
    label: "Camera Type",
    options: ["DSLR", "Mirrorless"],
  },
  {
    key: "autofocusPoints",
    label: "Autofocus Points",
    options: ["9", "19", "39", "49", "99", "121", "425"],
  },
  {
    key: "lensMount",
    label: "Lens Mount",
    options: [
      "Canon RF",
      "Canon EF",
      "Nikon Z",
      "Nikon F",
      "Sony E",
      "Fujifilm X",
      "Fujifilm G",
      "L Mount",
      "Micro Four Thirds",
      "Leica M",
      "Pentax K",
      "Other…",
    ],
  },
  {
    key: "kitType",
    label: "Kit Type",
    options: ["Body Only", "With Kit Lens", "Twin Lens Kit"],
  },
  {
    key: "sensorTech",
    label: "Sensor Technology",
    options: ["BSI CMOS", "CCD", "CMOS", "MOS"],
  },
  {
    key: "resolution",
    label: "Resolution (Megapixels)",
    options: ["Under 20 MP", "20–24 MP", "24–30 MP", "30–45 MP", "Above 45 MP"],
  },
  {
    key: "connectivity",
    label: "Connectivity",
    options: ["Wi-Fi", "Bluetooth", "NFC", "USB-C"],
  },
  {
    key: "shutterSpeed",
    label: "Shutter Speed",
    options: [
      "1/4000 sec",
      "1/4000 - 30 sec",
      "1/8000 sec",
      "1/8000 - 30 sec",
      "1/8000 - 60 sec",
      "1/16000 sec",
      "1/16000 sec, 1/8000 - 30 sec",
      "1/32000 sec",
    ],
  },
];

// ── Lens-specific filter groups ───────────────────────────────────────────────
type LensFilterGroup = { key: string; label: string; options: string[] };

const LENS_FILTER_GROUPS: LensFilterGroup[] = [
  {
    key: "lensMount",
    label: "Compatible Mountings",
    options: ["Canon RF", "Canon EF", "Canon EF-S", "Nikon Z", "Nikon F", "Sony E", "Sony FE", "Fujifilm X", "Other"],
  },
  {
    key: "focalLength",
    label: "Focal Length",
    options: ["8–15 mm", "16–24 mm", "24–70 mm", "70–200 mm", "200–400 mm", "400 mm & Above"],
  },
  {
    key: "lensType",
    label: "Lens Type",
    options: ["Fisheye", "Macro", "Standard", "Telephoto", "Wide-angle"],
  },
  {
    key: "focusType",
    label: "Autofocus",
    options: ["Autofocus", "Manual Focus"],
  },
  {
    key: "maxAperture",
    label: "Maximum Aperture",
    options: ["f/1.2", "f/1.4", "f/1.8", "f/2", "f/2.8", "f/4", "f/5.6 & Smaller"],
  },
];

// ── Speaker-specific filter groups ────────────────────────────────────────────
type SpeakerFilterGroup = { key: string; label: string; options: string[] };

const SPEAKER_FILTER_GROUPS: SpeakerFilterGroup[] = [
  {
    key: "connectivity",
    label: "Connectivity",
    options: ["Bluetooth", "Wi-Fi", "AUX", "USB", "HDMI ARC", "Optical", "RCA"],
  },
  {
    key: "bluetoothVersion",
    label: "Bluetooth Version",
    options: ["4.2", "5.0", "5.1", "5.2", "5.3", "5.4 & Above"],
  },
  {
    key: "voiceAssistant",
    label: "Voice Assistant",
    options: ["Amazon Alexa", "Google Assistant", "Apple Siri", "None"],
  },
  {
    key: "batteryLife",
    label: "Battery Life",
    options: ["Up to 10 Hours", "10–20 Hours", "20–30 Hours", "Above 30 Hours"],
  },
  {
    key: "waterResistance",
    label: "Water Resistance",
    options: ["IPX4", "IPX5", "IPX6", "IPX7", "IP67"],
  },
  {
    key: "color",
    label: "Color",
    options: ["Black", "White", "Blue", "Red", "Green", "Gray"],
  },
];

// ── TV-specific filter groups ─────────────────────────────────────────────────
type TvFilterGroup = { key: string; label: string; options: string[] };

const TV_FILTER_GROUPS: TvFilterGroup[] = [
  {
    key: "screenSize",
    label: "Screen Size",
    options: [
      "Up to 25.9 in",
      "26.0 – 34.9 in",
      "35.0 – 43.9 in",
      "44.0 – 52.9 in",
      "53.0 – 61.9 in",
      "62.0 – 70.9 in",
      "71.0 in & above",
    ],
  },
  {
    key: "resolution",
    label: "Resolution",
    options: ["8K", "4K", "1080p", "720p"],
  },
  {
    key: "connectivity",
    label: "Connectivity",
    options: ["HDMI", "Wi-Fi", "USB", "AV", "Bluetooth", "Ethernet", "RF"],
  },
];

// Parse a "12GB" or "12 GB" attribute string into a number.
function parseGb(val: unknown): number | null {
  if (!val) return null;
  const m = String(val).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchRamGb(gb: number, option: string): boolean {
  if (option === "4 GB and Below") return gb <= 4;
  if (option === "6 GB") return gb === 6;
  if (option === "8 GB and Above") return gb >= 8;
  return false;
}
function matchStorageGb(gb: number, option: string): boolean {
  if (option === "64 GB and Below") return gb <= 64;
  if (option === "64 GB - 127.9 GB") return gb > 64 && gb < 128;
  if (option === "128 GB - 255.9 GB") return gb >= 128 && gb < 256;
  if (option === "256 GB and Above") return gb >= 256;
  return false;
}

// Collect all unique RAM and storage values across a product's cached variants.
function variantValues(slug: string): { rams: number[]; storages: number[] } {
  const cached = detailCache.get(slug);
  if (!cached || cached.variants.length === 0) return { rams: [], storages: [] };
  const rams: number[] = [];
  const storages: number[] = [];
  for (const v of cached.variants) {
    const r = parseGb(v.attributes["ram"]);
    if (r !== null && !rams.includes(r)) rams.push(r);
    const s = parseGb(v.attributes["storage"]);
    if (s !== null && !storages.includes(s)) storages.push(s);
  }
  return { rams, storages };
}

// Fallback: extract GB values from product name string.
function nameRamGb(name: string): number | null {
  const m = name.match(/\((\d+)\s*GB\s*\+/i) ?? name.match(/(\d+)\s*GB\s*RAM/i);
  return m ? Number(m[1]) : null;
}
function nameStorageGb(name: string): number | null {
  const m = name.match(/\+\s*(\d+)\s*GB\s*\)/i) ?? name.match(/(\d+)\s*GB\s*(?:ROM|Storage|Internal)/i);
  return m ? Number(m[1]) : null;
}

// Parse leading numeric value from a spec string, e.g. "5000 mAh" → 5000, "6.7 inch" → 6.7, "200 MP" → 200
function parseSpec(val: unknown): number | null {
  if (!val) return null;
  const m = String(val).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchBattery(mah: number, option: string): boolean {
  if (option === "Less than 4000 mAh") return mah < 4000;
  if (option === "4000 - 6000 mAh") return mah >= 4000 && mah <= 6000;
  if (option === "Above 6000 mAh") return mah > 6000;
  return false;
}

function matchScreenSize(inch: number, option: string): boolean {
  if (option === "Below 4.4 inch") return inch < 4.4;
  if (option === "4.5 - 5.6 inch") return inch >= 4.5 && inch <= 5.6;
  if (option === "5.7 - 6.4 inch") return inch >= 5.7 && inch <= 6.4;
  if (option === "Above 6.4 inch") return inch > 6.4;
  return false;
}

function matchCamera(mp: number, option: string): boolean {
  // Rear camera
  if (option === "Below 20.9 MP") return mp < 21;
  if (option === "21 - 47.9 MP") return mp >= 21 && mp < 48;
  if (option === "48 - 63.9 MP") return mp >= 48 && mp < 64;
  if (option === "Above 64 MP") return mp >= 64;
  // Front camera
  if (option === "Below 12 MP") return mp < 12;
  if (option === "12 - 15.9 MP") return mp >= 12 && mp < 16;
  if (option === "16 - 20.9 MP") return mp >= 16 && mp < 21;
  if (option === "21 MP and Above") return mp >= 21;
  return false;
}

function applyPhoneFilters(items: ListCard[], phoneFilters: Record<string, string[]>): ListCard[] {
  const ramOpts     = phoneFilters["ram"]           ?? [];
  const storOpts    = phoneFilters["storage"]       ?? [];
  const batOpts     = phoneFilters["battery"]       ?? [];
  const screenOpts  = phoneFilters["screenSize"]    ?? [];
  const rearOpts    = phoneFilters["primaryCamera"] ?? [];
  const frontOpts   = phoneFilters["secondaryCamera"] ?? [];

  const hasAny = [ramOpts, storOpts, batOpts, screenOpts, rearOpts, frontOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);

    // ── RAM ──────────────────────────────────────────────────────────────────
    if (ramOpts.length > 0) {
      const { rams } = variantValues(item.slug);
      if (rams.length > 0) {
        if (!ramOpts.some((opt) => rams.some((gb) => matchRamGb(gb, opt)))) return false;
      } else {
        // Fallback 1: spec field (covers products where RAM is a product-level spec)
        const specGb =
          parseSpec(cached?.specs["RAM"]) ??
          parseSpec(cached?.specs["ram"]) ??
          parseSpec(cached?.specs["Memory"]) ??
          parseSpec(cached?.specs["Internal Memory"]);
        // Fallback 2: product name regex
        const nameGb = nameRamGb(item.name);
        const gb = specGb ?? nameGb;
        if (gb === null) return false;
        if (!ramOpts.some((opt) => matchRamGb(gb, opt))) return false;
      }
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    if (storOpts.length > 0) {
      const { storages } = variantValues(item.slug);
      if (storages.length > 0) {
        if (!storOpts.some((opt) => storages.some((gb) => matchStorageGb(gb, opt)))) return false;
      } else {
        // Fallback 1: spec field
        const specGb =
          parseSpec(cached?.specs["Internal Storage"]) ??
          parseSpec(cached?.specs["Storage"]) ??
          parseSpec(cached?.specs["ROM"]) ??
          parseSpec(cached?.specs["storage"]);
        // Fallback 2: product name regex
        const nameGb = nameStorageGb(item.name);
        const gb = specGb ?? nameGb;
        if (gb === null) return false;
        if (!storOpts.some((opt) => matchStorageGb(gb, opt))) return false;
      }
    }

    // ── Battery ───────────────────────────────────────────────────────────────
    if (batOpts.length > 0) {
      const mah =
        parseSpec(cached?.specs["Battery"]) ??
        parseSpec(cached?.specs["Battery Capacity"]) ??
        parseSpec(cached?.specs["battery"]);
      if (mah === null) return false;
      if (!batOpts.some((opt) => matchBattery(mah, opt))) return false;
    }

    // ── Screen Size ───────────────────────────────────────────────────────────
    if (screenOpts.length > 0) {
      const raw = cached?.specs["Display Size"];
      // Extract inch value: prefer explicit "X.X inch" pattern, else fall back to first number
      let inch: number | null = null;
      if (raw) {
        const inchMatch = String(raw).match(/(\d+(?:\.\d+)?)\s*inch/i);
        if (inchMatch) {
          inch = Number(inchMatch[1]);
        } else {
          // Value stored in cm — convert (e.g. "16.03 cm" → 6.31 inch)
          const cmMatch = String(raw).match(/(\d+(?:\.\d+)?)\s*cm/i);
          if (cmMatch) inch = Number(cmMatch[1]) / 2.54;
          else inch = parseSpec(raw);
        }
      }
      if (inch === null) return false;
      if (!screenOpts.some((opt) => matchScreenSize(inch!, opt))) return false;
    }

    // ── Rear Camera ───────────────────────────────────────────────────────────
    if (rearOpts.length > 0) {
      const mp =
        parseSpec(cached?.specs["Rear Camera"]) ??
        parseSpec(cached?.specs["Primary Camera"]) ??
        parseSpec(cached?.specs["Main Camera"]);
      if (mp === null) return false;
      if (!rearOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    // ── Front Camera ──────────────────────────────────────────────────────────
    if (frontOpts.length > 0) {
      const mp =
        parseSpec(cached?.specs["Front Camera"]) ??
        parseSpec(cached?.specs["Selfie Camera"]) ??
        parseSpec(cached?.specs["Secondary Camera"]);
      if (mp === null) return false;
      if (!frontOpts.some((opt) => matchCamera(mp, opt))) return false;
    }

    return true;
  });
}

function matchTvScreenSize(inch: number, option: string): boolean {
  if (option === "Up to 25.9 in") return inch <= 25.9;
  if (option === "26.0 – 34.9 in") return inch >= 26.0 && inch <= 34.9;
  if (option === "35.0 – 43.9 in") return inch >= 35.0 && inch <= 43.9;
  if (option === "44.0 – 52.9 in") return inch >= 44.0 && inch <= 52.9;
  if (option === "53.0 – 61.9 in") return inch >= 53.0 && inch <= 61.9;
  if (option === "62.0 – 70.9 in") return inch >= 62.0 && inch <= 70.9;
  if (option === "71.0 in & above") return inch >= 71.0;
  return false;
}

function matchTvResolution(val: string, option: string): boolean {
  const v = val.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (option === "8K")    return v.includes("8k") || v.includes("7680") || v.includes("4320") || v.includes("8000");
  if (option === "4K")    return (v.includes("4k") || v.includes("uhd") || v.includes("ultra hd") || v.includes("3840") || v.includes("2160") || v.includes("4096")) && !v.includes("8k") && !v.includes("7680");
  if (option === "1080p") return (v.includes("1080") || v.includes("full hd") || v.includes("fullhd") || v.includes("fhd")) && !v.includes("4k") && !v.includes("uhd") && !v.includes("2160") && !v.includes("8k");
  if (option === "720p")  return (v.includes("720") || v.includes("hd ready") || v.includes("hdready")) && !v.includes("1080") && !v.includes("4k") && !v.includes("uhd");
  return false;
}


function extractTvInches(cached: ReturnType<typeof detailCache.get>, productName?: string): number | null {
  // Helper: try to parse inches out of a raw string value
  const parseInchStr = (s: string): number | null => {
    const inchMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|"|″|′)/i);
    if (inchMatch) return Number(inchMatch[1]);
    const cmMatch = s.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return Math.round(Number(cmMatch[1]) / 2.54);
    return null;
  };

  // 1. Check well-known spec keys first
  const knownKeys = [
    "Screen Size", "screen size", "Display Size", "display size",
    "Screen size", "Diagonal Screen Size", "screenSize", "TV Size",
    "Screen", "display", "Display",
  ];
  for (const key of knownKeys) {
    const raw = cached?.specs[key];
    if (!raw) continue;
    const s = String(raw);
    const result = parseInchStr(s);
    if (result !== null) return result;
    // Last try: leading number (common when value is just "43")
    const leading = parseSpec(raw);
    if (leading !== null && leading >= 20 && leading <= 120) return leading;
  }

  // 2. Scan ALL spec values for anything that looks like an inch/cm TV size
  if (cached?.specs) {
    for (const val of Object.values(cached.specs)) {
      if (!val) continue;
      const result = parseInchStr(String(val));
      if (result !== null && result >= 20 && result <= 120) return result;
    }
  }

  // 3. Variant attributes — check size-related keys, then scan all attributes
  if (cached?.variants?.length) {
    for (const v of cached.variants) {
      const sizeKeys = ["size", "screen_size", "screenSize", "Screen Size", "display_size"];
      for (const key of sizeKeys) {
        const sv = v.attributes[key];
        if (!sv) continue;
        const s = String(sv);
        const result = parseInchStr(s);
        if (result !== null) return result;
        const m = s.match(/^(\d+(?:\.\d+)?)/);
        if (m && Number(m[1]) >= 20 && Number(m[1]) <= 120) return Number(m[1]);
      }
      // Scan all variant attributes
      for (const val of Object.values(v.attributes)) {
        if (!val) continue;
        const result = parseInchStr(String(val));
        if (result !== null && result >= 20 && result <= 120) return result;
      }
    }
  }

  // 4. Product name fallback — e.g. "Samsung 43 Inch TV", 'TCL 55" TV'
  if (productName) {
    const result = parseInchStr(productName);
    if (result !== null) return result;
    const cmMatch = productName.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return Math.round(Number(cmMatch[1]) / 2.54);
  }

  return null;
}

function applyTvFilters(items: ListCard[], tvFilters: Record<string, string[]>): ListCard[] {
  const sizeOpts = tvFilters["screenSize"]   ?? [];
  const resOpts  = tvFilters["resolution"]   ?? [];
  const connOpts = tvFilters["connectivity"] ?? [];

  const hasAny = [sizeOpts, resOpts, connOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);
    if (!cached) return true; // not yet fetched — show until cache is ready

    // ── Screen Size ───────────────────────────────────────────────────────────
    if (sizeOpts.length > 0) {
      const variants = cached?.variants ?? [];
      if (variants.length > 0) {
        // Product has size variants — include if ANY variant size matches a selected option
        const hasMatch = variants.some((v) => {
          const sv = v.attributes["size"];
          if (!sv) return false;
          const m = String(sv).match(/^(\d+(?:\.\d+)?)/);
          if (!m) return false;
          const vInch = Number(m[1]);
          return vInch >= 20 && vInch <= 120 && sizeOpts.some((opt) => matchTvScreenSize(vInch, opt));
        });
        if (!hasMatch) return false;
      } else {
        // No variants — fall back to spec / name
        const inch = extractTvInches(cached, item.name);
        if (inch === null) return false;
        if (!sizeOpts.some((opt) => matchTvScreenSize(inch, opt))) return false;
      }
    }

    // ── Resolution ────────────────────────────────────────────────────────────
    if (resOpts.length > 0) {
      const tvSpecs = cached.specs;
      // Case-insensitive scan of ALL spec keys — any key whose name contains
      // "resolution" is treated as a resolution field.
      // This covers "Display Resolution", "display resolution", "Resolution 2",
      // "Screen Resolution", "Native Resolution", etc.
      const allResVals: string[] = [];
      for (const [k, v] of Object.entries(tvSpecs)) {
        if (!v) continue;
        if (k.toLowerCase().includes("resolution")) {
          allResVals.push(String(v));
        }
      }
      // If no resolution-named key exists, scan spec values for resolution keywords
      // but skip product name/description/model keys to avoid false matches
      // (e.g. "Crystal 4K Vision AI...Ultra HD (4K)..." in a product name field
      // would pollute allResVals when the actual Resolution spec is "8K").
      if (allResVals.length === 0) {
        const skipKeyPrefixes = ["product name", "description", "slug", "name", "model", "other"];
        const resKeywords = ["8k", "4k", "uhd", "ultra hd", "fhd", "full hd", "hd ready", "1080", "720", "2160", "7680", "4320"];
        for (const [k, v] of Object.entries(tvSpecs)) {
          if (!v) continue;
          const kl = k.toLowerCase();
          if (skipKeyPrefixes.some((p) => kl.startsWith(p))) continue;
          const s = String(v).toLowerCase();
          if (resKeywords.some((kw) => s.includes(kw))) allResVals.push(String(v));
        }
      }
      // If no resolution info found at all (specs empty/not yet loaded), let the
      // product through rather than incorrectly hiding it.
      if (allResVals.length > 0 && !allResVals.some((raw) => resOpts.some((opt) => matchTvResolution(raw, opt)))) return false;
    }

    // ── Connectivity ─────────────────────────────────────────────────────────
    // TV stores connectivity as individual fields (HDMI Ports, Wi-Fi, USB Ports…)
    // NOT as a combined "Connectivity Technology" string — check per-size keys.
    if (connOpts.length > 0) {
      const specs = cached.specs;
      // Check a spec key across all TV size slots (key, "key 2", "key 3"…)
      const tvSpecAny = (base: string): string => {
        for (let i = 0; i < 5; i++) {
          const k = i === 0 ? base : `${base} ${i + 1}`;
          const v = specs[k];
          if (v && String(v).trim().toLowerCase() !== "no") return String(v).toLowerCase();
        }
        return "";
      };
      // Free-text fields that may contain connectivity info
      const freeText = [
        specs["Other Convenience Features"],
        specs["Supported Devices for Casting"],
        specs["Wi-Fi Type"],
      ].map((v) => String(v ?? "").toLowerCase()).join(" ");

      const hasConn = (opt: string): boolean => {
        if (opt === "HDMI")      return !!tvSpecAny("HDMI Ports");
        if (opt === "USB")       return !!tvSpecAny("USB Ports");
        if (opt === "Wi-Fi")     return !!tvSpecAny("Wi-Fi");
        if (opt === "Bluetooth") return !!tvSpecAny("Bluetooth") || freeText.includes("bluetooth");
        if (opt === "Ethernet")  return !!tvSpecAny("Ethernet")  || freeText.includes("ethernet") || freeText.includes("lan");
        if (opt === "AV")        return !!tvSpecAny("AV")        || freeText.includes(" av") || freeText.includes("composite");
        if (opt === "RF")        return !!tvSpecAny("RF")        || freeText.includes("antenna") || freeText.includes("coaxial");
        return false;
      };
      if (!connOpts.some(hasConn)) return false;
    }

    return true;
  });
}

const KNOWN_LENS_MOUNTS = [
  "canon rf", "canon ef", "nikon z", "nikon f", "sony e",
  "fujifilm x", "fujifilm g", "l mount", "micro four thirds", "leica m", "pentax k",
];

function applyCameraFilters(items: ListCard[], cameraFilters: Record<string, string[]>): ListCard[] {
  const typeOpts    = cameraFilters["cameraType"]      ?? [];
  const afOpts      = cameraFilters["autofocusPoints"] ?? [];
  const mountOpts   = cameraFilters["lensMount"]       ?? [];
  const kitOpts     = cameraFilters["kitType"]         ?? [];
  const sensorOpts  = cameraFilters["sensorTech"]      ?? [];
  const resOpts     = cameraFilters["resolution"]      ?? [];
  const connOpts    = cameraFilters["connectivity"]    ?? [];
  const shutterOpts = cameraFilters["shutterSpeed"]    ?? [];

  const hasAny = [typeOpts, afOpts, mountOpts, kitOpts, sensorOpts, resOpts, connOpts, shutterOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  // Normalise a spec string: lowercase + collapse whitespace + remove hyphens for fuzzy matching.
  const norm = (v: unknown) =>
    String(v ?? "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);
    if (!cached) return true; // Not yet fetched — show it until cache is ready
    const specs  = cached?.specs ?? {};

    // Helper: read a spec key across all multi-model indexes (key, "key 2", "key 3"…)
    // Returns array of all non-empty string values found.
    const specAllModels = (baseKey: string): string[] => {
      const out: string[] = [];
      for (let i = 0; i < 5; i++) {
        const k = i === 0 ? baseKey : `${baseKey} ${i + 1}`;
        if (specs[k]) out.push(String(specs[k]));
      }
      return out;
    };
    // Returns first non-empty value across models, or fallback keys.
    const specFirst = (...baseKeys: string[]): string => {
      for (const base of baseKeys) {
        const vals = specAllModels(base);
        if (vals.length > 0) return vals[0];
      }
      return "";
    };
    // Returns true if ANY model's value matches the predicate.
    const anyModel = (baseKey: string, pred: (v: string) => boolean): boolean =>
      specAllModels(baseKey).some(pred);

    // Camera Type — check across all models, fall back to product name.
    if (typeOpts.length > 0) {
      const vals = [
        ...specAllModels("Camera Type"),
        norm(specs["Type"] ?? specs["Camera Style"] ?? specs["Form Factor"] ?? item.name),
      ].map(norm);
      if (!typeOpts.some((opt) => vals.some((v) => v.includes(norm(opt))))) return false;
    }

    // Autofocus Points — extract integers from ALL models and all AF keys.
    if (afOpts.length > 0) {
      const afKeys = [
        "Autofocus Points", "AF Points", "Number of Focus Points",
        "Phase Detection AF Points", "Auto Focus Points", "Total Focus Points", "Autofocus",
      ];
      const nums = afKeys
        .flatMap((k) => specAllModels(k))
        .flatMap((v) => { const m = v.match(/\d+/g); return m ? m.map(Number) : []; })
        .filter((n) => !isNaN(n));
      // Only exclude if at least one AF count was found AND none match.
      if (nums.length > 0 && !nums.some((n) => afOpts.includes(String(n)))) return false;
    }

    // Lens Mount — check across all models; "Other…" matches unrecognised mounts.
    if (mountOpts.length > 0) {
      const vals = [
        ...specAllModels("Lens Mount"),
        norm(specs["Mount"] ?? specs["Compatible Lenses"] ?? specs["Mount Type"] ?? ""),
      ].map(norm).filter(Boolean);
      const nonOther = mountOpts.filter((o) => o !== "Other…");
      const wantsOther = mountOpts.includes("Other…");
      const matchesNamed = nonOther.some((opt) => {
        const o = norm(opt);
        return vals.some((v) => {
          // "Sony E" filter should also match "Sony FE-Mount" cameras
          if (o === "sony e") return v.includes("sony e") || v.includes("sony fe");
          return v.includes(o);
        });
      });
      if (!matchesNamed) {
        if (wantsOther) {
          const isKnown = vals.some((v) => KNOWN_LENS_MOUNTS.some((m) => v.includes(m.replace(/-/g, " "))));
          if (vals.length === 0 || isKnown) return false;
        } else {
          return false;
        }
      }
    }

    // Kit Type — needs variant data; skip (hide) the product until detail is cached.
    if (kitOpts.length > 0) {
      if (!cached) return false;
      const variants = cached.variants;
      const lensVariants = variants.filter((v) => String(v.attributes.lensIncluded) === "Yes");
      const uniqueLenses = new Set(
        lensVariants.map((v) => String(v.attributes.lens ?? "").toLowerCase().trim())
      );
      const hasBodyOnly = variants.some((v) => String(v.attributes.lensIncluded) !== "Yes");
      const kitMatch = kitOpts.some((opt) => {
        if (opt === "Body Only")     return hasBodyOnly;
        if (opt === "With Kit Lens") return uniqueLenses.size === 1;
        if (opt === "Twin Lens Kit") return uniqueLenses.size >= 2;
        return false;
      });
      if (!kitMatch) return false;
    }

    // Sensor Technology — check across all models.
    if (sensorOpts.length > 0) {
      const matched = sensorOpts.some((opt) =>
        anyModel("Sensor Type", (v) => norm(v).includes(norm(opt))) ||
        norm(specs["Image Sensor"] ?? specs["Sensor"] ?? specs["Image Sensor Type"] ?? "").includes(norm(opt))
      );
      if (!matched) return false;
    }

    // Resolution (Megapixels) — check "Effective Resolution (MP)" across all models first.
    if (resOpts.length > 0) {
      // Try multi-model key first, then fallback generic keys
      const mpStr = specFirst(
        "Effective Resolution (MP)", "Maximum Resolution", "Effective Megapixels",
        "Resolution", "Megapixels", "Sensor Resolution", "Effective Pixels", "Maximum Megapixels"
      );
      const mp = parseSpec(mpStr);
      if (mp === null) return false;
      if (!resOpts.some((opt) => {
        if (opt === "Under 20 MP") return mp < 20;
        if (opt === "20\u201324 MP") return mp >= 20 && mp <= 24;
        if (opt === "24\u201330 MP") return mp > 24 && mp <= 30;
        if (opt === "30\u201345 MP") return mp > 30 && mp <= 45;
        if (opt === "Above 45 MP") return mp > 45;
        return false;
      })) return false;
    }

    // Connectivity — cameras store Wi-Fi/Bluetooth/NFC as individual "Yes/No" spec keys.
    if (connOpts.length > 0) {
      const matchesOpt = (opt: string): boolean => {
        const o = norm(opt);
        // Check individual boolean spec fields (e.g. specs["Wi-Fi"] = "Yes")
        const directKeys = [opt, opt.replace(/-/g, " "), opt.replace(/-/g, "")];
        for (const key of directKeys) {
          const v = norm(specs[key] ?? "");
          if (v && v !== "no" && v !== "false" && v !== "not supported" && v !== "n/a") return true;
        }
        // Also check multi-model keys (e.g. "Wi-Fi 2", "Bluetooth 2")
        for (const key of directKeys) {
          if (anyModel(key, (v) => {
            const vn = norm(v);
            return !!vn && vn !== "no" && vn !== "false" && vn !== "not supported" && vn !== "n/a";
          })) return true;
        }
        // Check combined connectivity field
        const combined = norm(
          specs["Connectivity"] ?? specs["Wireless Connectivity"] ??
          specs["Connectivity Technology"] ?? specs["Wireless Features"] ?? ""
        );
        if (combined.includes(o)) return true;
        if (o === "wi fi" && combined.includes("wifi")) return true;
        if (o === "usb c" && (combined.includes("type c") || combined.includes("usb type c"))) return true;
        // Camera admin stores USB Type-C as specs["USB Type"] = "USB Type-C …"
        if (o === "usb c") { const usbType = norm(specs["USB Type"] ?? ""); if (usbType.includes("type c") || usbType.includes("type-c")) return true; }
        return false;
      };
      if (!connOpts.some(matchesOpt)) return false;
    }

    // Shutter Speed — check across all models.
    if (shutterOpts.length > 0) {
      const raw = norm(specFirst(
        "Shutter Speed", "Maximum Shutter Speed", "Shutter Speed Range", "Electronic Shutter"
      ));
      if (!shutterOpts.some((opt) => {
        const o = norm(opt);
        return raw.includes(o) || o.includes(raw);
      })) return false;
    }

    return true;
  });
}

function applySpeakerFilters(items: ListCard[], speakerFilters: Record<string, string[]>): ListCard[] {
  const connOpts    = speakerFilters["connectivity"]      ?? [];
  const btOpts      = speakerFilters["bluetoothVersion"]  ?? [];
  const vaOpts      = speakerFilters["voiceAssistant"]    ?? [];
  const battOpts    = speakerFilters["batteryLife"]       ?? [];
  const waterOpts   = speakerFilters["waterResistance"]   ?? [];
  const colorOpts   = speakerFilters["color"]             ?? [];

  const hasAny = [connOpts, btOpts, vaOpts, battOpts, waterOpts, colorOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  const norm = (v: unknown) =>
    String(v ?? "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

  const parseHours = (v: unknown): number | null => {
    const m = String(v ?? "").match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };

  const parseBtVersion = (v: unknown): number | null => {
    const m = String(v ?? "").match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);
    if (!cached) return true; // Not yet fetched — show it until cache is ready
    const specs  = cached?.specs ?? {};

    // Connectivity — each option is a separate connectivity type
    if (connOpts.length > 0) {
      const has = (opt: string): boolean => {
        const o = norm(opt);
        if (o === "bluetooth")  return norm(specs["Bluetooth"]) === "yes";
        if (o === "wi fi")      return norm(specs["Wi-Fi"]) === "yes";
        if (o === "aux")        return norm(specs["AUX Input"]) === "yes";
        if (o === "usb")        { const uv = norm(specs["USB Port"]); return !!uv && uv !== "no"; }
        if (o === "hdmi arc")   return norm(specs["HDMI"]) === "yes";
        if (o === "optical")    return norm(specs["Optical Input"]) === "yes";
        if (o === "rca")        return norm(specs["RCA Input"]) === "yes";
        return false;
      };
      if (!connOpts.some(has)) return false;
    }

    // Bluetooth Version
    if (btOpts.length > 0) {
      const ver = parseBtVersion(specs["Bluetooth Version"]);
      if (ver === null) return false;
      if (!btOpts.some((opt) => {
        if (opt === "5.4 & Above") return ver >= 5.4;
        const target = parseBtVersion(opt);
        return target !== null && Math.abs(ver - target) < 0.05;
      })) return false;
    }

    // Voice Assistant
    if (vaOpts.length > 0) {
      const raw = norm(specs["Voice Assistant Support"] ?? "");
      if (!vaOpts.some((opt) => {
        const o = norm(opt);
        if (o === "none") return !raw || raw === "none" || raw === "no";
        return raw.includes(o);
      })) return false;
    }

    // Battery Life
    if (battOpts.length > 0) {
      const hrs = parseHours(specs["Battery Life"]);
      if (hrs === null) return false;
      if (!battOpts.some((opt) => {
        if (opt === "Up to 10 Hours") return hrs <= 10;
        if (opt === "10\u201320 Hours") return hrs > 10 && hrs <= 20;
        if (opt === "20\u201330 Hours") return hrs > 20 && hrs <= 30;
        if (opt === "Above 30 Hours")  return hrs > 30;
        return false;
      })) return false;
    }

    // Water Resistance
    if (waterOpts.length > 0) {
      const raw = norm(specs["Water Resistance Rating"] ?? "");
      if (!waterOpts.some((opt) => raw.includes(norm(opt)))) return false;
    }

    // Color — check spec then variant attributes
    if (colorOpts.length > 0) {
      const specColor = norm(specs["Color"] ?? "");
      const variantColors = cached?.variants.map((v) => norm(v.attributes.color ?? "")) ?? [];
      const allColors = specColor ? [specColor, ...variantColors] : variantColors;
      if (!colorOpts.some((opt) => allColors.some((c) => c.includes(norm(opt))))) return false;
    }

    return true;
  });
}

function applyLensFilters(items: ListCard[], lensFilters: Record<string, string[]>): ListCard[] {
  const mountOpts    = lensFilters["lensMount"]    ?? [];
  const focalOpts    = lensFilters["focalLength"]  ?? [];
  const typeOpts     = lensFilters["lensType"]     ?? [];
  const focusOpts    = lensFilters["focusType"]    ?? [];
  const apertureOpts = lensFilters["maxAperture"]  ?? [];

  const hasAny = [mountOpts, focalOpts, typeOpts, focusOpts, apertureOpts].some((a) => a.length > 0);
  if (!hasAny) return items;

  const norm = (v: unknown) =>
    String(v ?? "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

  // Parse first float from "f/5.6", "f5.6", "5.6", "f/3.5-5.6" → first f-number
  const parseAperture = (v: unknown): number | null => {
    const s = String(v ?? "");
    const mf = s.match(/f\/?([\d.]+)/i);
    if (mf) return parseFloat(mf[1]);
    const mn = s.match(/^([\d.]+)/);
    return mn ? parseFloat(mn[1]) : null;
  };

  // Parse focal range: "200-600 mm" → {min:200,max:600}; "50mm" → {min:50,max:50}
  const parseFocal = (v: unknown): { min: number; max: number } | null => {
    const s = String(v ?? "");
    const range = s.match(/([\d.]+)\s*[-–to]+\s*([\d.]+)/i);
    if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
    const single = s.match(/([\d.]+)/);
    if (single) { const f = parseFloat(single[1]); return { min: f, max: f }; }
    return null;
  };

  // Aperture bucket: half-stop ranges around each preset value
  const apertureBucket = (ap: number, opt: string): boolean => {
    if (opt === "f/5.6 & Smaller") return ap > 4.8;
    const target = parseAperture(opt);
    if (target === null) return false;
    const bounds: Record<number, [number, number]> = {
      1.2: [0,   1.3],
      1.4: [1.3, 1.6],
      1.8: [1.6, 1.9],
      2:   [1.9, 2.4],
      2.8: [2.4, 3.4],
      4:   [3.4, 4.8],
    };
    const b = bounds[target];
    return b ? ap > b[0] && ap <= b[1] : Math.abs(ap - target) < 0.05;
  };

  return items.filter((item) => {
    const cached = detailCache.get(item.slug);
    if (!cached) return true; // Not yet fetched — show until cache is ready
    const specs = cached?.specs ?? {};

    // All spec values normalised — used for broad scanning when key names are unknown
    const allSpecVals = Object.values(specs).map((v) => norm(v)).filter(Boolean);

    // Helper: read spec key across all multi-model indexes ("key", "key 2" … "key 5")
    const specAllModels = (baseKey: string): string[] => {
      const out: string[] = [];
      for (let i = 0; i < 5; i++) {
        const k = i === 0 ? baseKey : `${baseKey} ${i + 1}`;
        if (specs[k]) out.push(String(specs[k]));
      }
      return out;
    };
    // First non-empty value across a list of candidate key names
    const specFirst = (...baseKeys: string[]): string => {
      for (const base of baseKeys) {
        const vals = specAllModels(base);
        if (vals.length > 0) return vals[0];
      }
      return "";
    };

    // ── Compatible Mountings ─────────────────────────────────────────────────
    // Scan ALL spec values so any key name the admin used is covered.
    if (mountOpts.length > 0) {
      const knownMounts = [
        "canon rf", "canon ef", "canon ef s", "nikon z", "nikon f",
        "sony e", "sony fe", "fujifilm x", "fujifilm g", "l mount",
        "micro four thirds", "leica m", "pentax k",
      ];
      const nonOther = mountOpts.filter((o) => o !== "Other");
      const wantsOther = mountOpts.includes("Other");
      const matchesNamed = nonOther.some((opt) => {
        const o = norm(opt);
        return allSpecVals.some((raw) => {
          // Canon EF-S must not accidentally match Canon EF
          if (o === "canon ef")  return (raw.includes("canon ef") || raw.includes("ef mount") || raw.includes("ef-mount")) && !raw.includes("canon ef s") && !raw.includes("efs");
          if (o === "canon ef s") return raw.includes("canon ef s") || raw.includes("efs") || raw.includes("ef-s");
          if (o === "canon rf")  return raw.includes("canon rf")  || raw.includes("rf mount");
          if (o === "nikon z")   return raw.includes("nikon z")   || raw.includes("z mount");
          if (o === "nikon f")   return (raw.includes("nikon f") && !raw.includes("nikon fx")) || raw.includes("f mount") || raw.includes("nikon f mount");
          if (o === "sony e")    return (raw.includes("sony e") && !raw.includes("sony fe")) || raw === "e mount" || raw === "e";
          if (o === "sony fe")   return raw.includes("sony fe") || raw.includes("fe mount") || raw === "fe";
          if (o === "fujifilm x") return raw.includes("fujifilm x") || raw.includes("fujinon x") || raw.includes("fuji x") || raw.includes("x mount");
          return raw.includes(o);
        });
      });
      if (!matchesNamed) {
        if (wantsOther) {
          const isKnown = allSpecVals.some((raw) => knownMounts.some((m) => raw.includes(m)));
          if (allSpecVals.length === 0 || isKnown) return false;
        } else {
          return false;
        }
      }
    }

    // ── Focal Length ─────────────────────────────────────────────────────────
    // Try many candidate key names, then fall back to scanning all spec values
    // for anything that looks like a focal length (digits + optional "mm").
    if (focalOpts.length > 0) {
      let focalStr = specFirst(
        "Focal Length", "Focal Length (mm)", "Focal Length Range",
        "Focal Range", "Zoom Range", "Focal Length Range (mm)",
        "Equivalent Focal Length", "35mm Equivalent Focal Length", "Focal"
      );
      // If no known key matched, search all spec values for a focal-length pattern
      if (!focalStr) {
        focalStr = allSpecVals.find((v) => /[\d.]+\s*(mm|to|[-–])\s*[\d.]/.test(v) || /^\d+\s*mm$/.test(v)) ?? "";
      }
      const focal = parseFocal(focalStr);
      if (!focal) return false;
      if (!focalOpts.some((opt) => {
        if (opt === "8\u201315 mm")        return focal.min <= 15  && focal.max >= 8;
        if (opt === "16\u201324 mm")       return focal.min <= 24  && focal.max >= 16;
        if (opt === "24\u201370 mm")       return focal.min <= 70  && focal.max >= 24;
        if (opt === "70\u2013200 mm")      return focal.min <= 200 && focal.max >= 70;
        if (opt === "200\u2013400 mm")     return focal.min <= 400 && focal.max >= 200;
        if (opt === "400 mm & Above")  return focal.max >= 400;
        return false;
      })) return false;
    }

    // ── Lens Type ────────────────────────────────────────────────────────────
    // Check many key variants; also match common synonyms per type.
    if (typeOpts.length > 0) {
      const typeVals = [
        ...specAllModels("Lens Type"),
        ...specAllModels("Type"),
        ...specAllModels("Lens Series"),
        ...specAllModels("Category"),
        ...specAllModels("Lens Category"),
        ...specAllModels("Lens Style"),
        ...specAllModels("Optic Type"),
        norm(item.name),
      ].map(norm);

      const matchType = (opt: string): boolean => {
        const o = norm(opt);
        return typeVals.some((v) => {
          if (o === "wide angle" || o === "wide-angle")
            return v.includes("wide") || v.includes("ultra wide") || v.includes("wideangle");
          if (o === "telephoto")
            return v.includes("telephoto") || (v.includes("tele") && !v.includes("wide"));
          if (o === "standard")
            return v.includes("standard") || v.includes("normal lens") || v.includes("normal zoom");
          if (o === "macro")
            return v.includes("macro");
          if (o === "fisheye")
            return v.includes("fisheye") || v.includes("fish eye");
          return v.includes(o);
        });
      };

      if (!typeOpts.some(matchType)) return false;
    }

    // ── Autofocus ────────────────────────────────────────────────────────────
    // "Focus Type" / "Focus Mode" / "Autofocus" are all common key names.
    // Values may be "Autofocus", "AF/MF", "AF", "Yes", "Manual Focus", "No".
    if (focusOpts.length > 0) {
      const focusRaw = norm(specFirst(
        "Focus Type", "Focus Mode", "Focus", "Autofocus",
        "Focusing System", "AF System", "Autofocus System",
        "Autofocus Support", "Focus System"
      ));
      const hasAF = focusRaw.includes("autofocus") || focusRaw === "af"
        || focusRaw.startsWith("af/") || focusRaw.startsWith("af ")
        || focusRaw === "yes";
      const hasMF = focusRaw.includes("manual") || focusRaw === "mf"
        || focusRaw.endsWith("/mf") || focusRaw === "no";

      if (!focusOpts.some((opt) => {
        const o = norm(opt);
        if (o === "autofocus")    return hasAF;
        if (o === "manual focus") return hasMF;
        return focusRaw.includes(o);
      })) return false;
    }

    // ── Maximum Aperture ─────────────────────────────────────────────────────
    // Try common key names, then scan all spec values for "f/N.N" patterns.
    if (apertureOpts.length > 0) {
      let ap = parseAperture(specFirst(
        "Maximum Aperture", "Max Aperture", "Aperture",
        "Aperture Range", "Maximum f Number", "Max f Number",
        "Lens Aperture", "f Number", "Minimum f Number", "Aperture (Max)"
      ));
      // Fallback: scan all spec values for an aperture-like string
      if (ap === null) {
        for (const v of allSpecVals) {
          const m = v.match(/f\/?([\d.]+)/i);
          if (m) { ap = parseFloat(m[1]); break; }
        }
      }
      if (ap === null) return false;
      if (!apertureOpts.some((opt) => apertureBucket(ap!, opt))) return false;
    }

    return true;
  });
}

// Generic collapsible wrapper used by Price Range, Brand, Rating
function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2"
      >
        {label}
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && children}
    </div>
  );
}

// Collapsible checkbox filter section for phone-specific filters
function FilterSection({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
  };
  return (
    <CollapsibleSection label={label}>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="w-3.5 h-3.5 accent-[#129cd3] cursor-pointer rounded"
            />
            <span className="text-xs text-gray-600 group-hover:text-[#129cd3] transition-colors leading-snug">
              {opt}
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/**
 * Fetches variant details for all products, builds a globally flat list of
 * {product, variant} pairs, sorts them by finalPrice, then renders individual
 * ProductCards. Used when price sort is active so the order is truly global.
 */
function PriceSortedGrid({ products, dir }: { products: ListCard[]; dir: "asc" | "desc" }) {
  type FlatItem = { product: ListCard; variant: Variant | null };
  const [flat, setFlat] = useState<FlatItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      products.map(async (p) => {
        const cached = detailCache.get(p.slug);
        if (cached) return { product: p, variants: cached.variants };
        try {
          const d = await catalogApi.getProduct(p.slug);
          detailCache.set(p.slug, { stock: d.stock, variants: d.variants, specs: d.specs ?? {} });
          return { product: p, variants: d.variants };
        } catch {
          return { product: p, variants: [] };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const items: FlatItem[] = [];
      for (const { product, variants } of results) {
        if (variants.length === 0) {
          items.push({ product, variant: null });
        } else if (variants.some((v) => "lensIncluded" in v.attributes)) {
          // Camera: one card per lens type, best representative per group
          const groups = new Map<string, typeof variants>();
          for (const v of variants) {
            const color = String(v.attributes.color ?? "").toLowerCase().trim();
            const key = String(v.attributes.lensIncluded) === "Yes"
              ? `lens:${String(v.attributes.lens ?? "")}`.toLowerCase()
              : color ? `body-only:${color}` : "body-only";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(v);
          }
          for (const group of groups.values()) {
            const best =
              group.find((v) => v.stock > 0 && v.images.length > 0) ??
              group.find((v) => v.stock > 0) ??
              group.find((v) => v.images.length > 0) ??
              group[0];
            items.push({ product, variant: best });
          }
        } else {
          for (const v of variants) items.push({ product, variant: v });
        }
      }
      items.sort((a, b) => {
        const pa = a.variant ? a.variant.pricing.finalPrice : (a.product.lowestVariantPrice ?? a.product.finalPrice);
        const pb = b.variant ? b.variant.pricing.finalPrice : (b.product.lowestVariantPrice ?? b.product.finalPrice);
        return dir === "asc" ? pa - pb : pb - pa;
      });
      setFlat(items);
    });
    return () => { cancelled = true; };
  }, [products, dir]);

  // While fetching, fall back to product-level sorted cards
  if (flat.length === 0) {
    return (
      <>
        {products.map((p) => (
          <ProductCardExpander key={p.id} product={p} priceSortDir={dir} />
        ))}
      </>
    );
  }

  return (
    <>
      {flat.map(({ product, variant }, i) =>
        variant ? (
          <ProductCard key={`${product.id}-${variant.id}`} product={product} variantOverride={variant} />
        ) : (
          <ProductCard key={`${product.id}-${i}`} product={product} />
        )
      )}
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsPageFallback />}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageFallback() {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen" />
      <Footer />
    </>
  );
}

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("category");

  const selectedCategory = urlCategory;
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState(PRICE_FLOOR);
  const [maxPrice, setMaxPrice] = useState(PRICE_CEIL);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [sortLabel, setSortLabel] = useState<string>("Featured");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Phone-specific filters (shown only when phone category is selected)
  const [phoneFilters, setPhoneFilters] = useState<Record<string, string[]>>({});
  // TV-specific filters (shown only when TV category is selected)
  const [tvFilters, setTvFilters] = useState<Record<string, string[]>>({});
  // Camera-specific filters (shown only when camera category is selected)
  const [cameraFilters, setCameraFiltersState] = useState<Record<string, string[]>>({});
  // Lens-specific filters (shown only when lens category is selected)
  const [lensFilters, setLensFiltersState] = useState<Record<string, string[]>>({});
  // Speaker-specific filters (shown only when speaker category is selected)
  const [speakerFilters, setSpeakerFiltersState] = useState<Record<string, string[]>>({});
const [headerHeight, setHeaderHeight] = useState(0);

useEffect(() => {
  const header = document.querySelector("header");
  if (!header) return;

  const observer = new ResizeObserver(([entry]) => {
    setHeaderHeight(entry.contentRect.height);
  });

  observer.observe(header);
  return () => observer.disconnect();
}, []);

  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    catalogApi
      .getCategories(ac.signal)
      .then((all: CategoryNode[]) => {
        if (ac.signal.aborted) return;
        setCategoryOptions(
          reorderCategories(all.slice().sort((a, b) => a.sortOrder - b.sortOrder))
            .map((c) => ({ slug: c.slug.toLowerCase(), name: c.name })),
        );
      })
      .catch(() => {
        /* sidebar shows empty state */
      })
      .finally(() => {
        if (!ac.signal.aborted) setCategoriesLoading(false);
      });
    return () => ac.abort();
  }, []);

  const selectCategory = (slug: string | null) => {
    const normalized = slug ? slug.toLowerCase() : null;
    const params = new URLSearchParams(searchParams.toString());
    if (normalized) params.set("category", normalized);
    else params.delete("category");
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products");
    // Reset category-specific filters when changing category
    setPhoneFilters({});
    setTvFilters({});
    setCameraFiltersState({});
    setLensFiltersState({});
    setSpeakerFiltersState({});
  };

  useEffect(() => {
    const ac = new AbortController();
    const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;

    catalogApi
      .listProducts(
        {
          category: selectedCategory ?? undefined,
          brand: selectedBrand ?? undefined,
          // NOTE: priceMin/priceMax intentionally omitted — backend filters by variant MRP
          // (basePrice) instead of selling price (finalPrice), causing incorrect results for
          // discounted products. We apply both price bounds client-side below.
          minRating: minRating ?? undefined,
          sort: sortValue,
          limit: PAGE_LIMIT,
        },
        ac.signal,
      )
      .then((resp) => {
        if (ac.signal.aborted) return;
        setData(resp);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(
          isApiError(err) ? err.displayMessage : "Failed to load products",
        );
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [selectedCategory, selectedBrand, minPrice, maxPrice, minRating, sortLabel]);

  // cacheTick increments after detail pre-fetch completes so applyPhoneFilters re-runs.
  const [cacheTick, setCacheTick] = useState(0);

  const rawItems: ListCard[] = data?.items ?? [];

  // Client-side price filter applied at the product level.
  // ProductCardExpander handles per-variant min/max filtering and hides individual
  // out-of-range variant cards, so the list-level filter only needs to coarsely exclude
  // products where NO variant could possibly be in range.
  //
  // Key nuance for lens/camera products: the API's lowestVariantPrice = variant basePrice
  // (net price after GST, not the selling price). The actual selling price lives in
  // priceOverride and is only available after detail fetch. finalPrice from the list API
  // is often 0 for these products. So we must not use finalPrice=0 as evidence that the
  // product is below minPrice — we need the cached variant prices instead.
  const priceFilteredItems = rawItems.filter((p) => {
    const isPriceActive = minPrice > PRICE_FLOOR || maxPrice < PRICE_CEIL;
    if (!isPriceActive) return true;

    // ── Highest-accuracy path: use actual selling prices from variant detail cache ──
    // After the lens/camera/TV detail pre-fetch completes, cached variant finalPrices
    // (from priceOverride) are available and should take precedence over list-level values.
    const cached = detailCache.get(p.slug);
    if (cached && cached.variants.length > 0) {
      const variantPrices = cached.variants
        .map((v) => v.pricing.finalPrice)
        .filter((pr) => pr > 0);
      if (variantPrices.length > 0) {
        const lowestActual  = Math.min(...variantPrices);
        const highestActual = Math.max(...variantPrices);
        if (maxPrice < PRICE_CEIL && lowestActual > maxPrice) return false;
        if (minPrice > PRICE_FLOOR && highestActual < minPrice) return false;
        return true;
      }
    }

    // ── Fallback: use list-API lowestVariantPrice (= net basePrice, not selling price) ──
    if (p.lowestVariantPrice !== null) {
      const lvp = p.lowestVariantPrice > 0 ? p.lowestVariantPrice : null;
      if (lvp !== null) {
        if (maxPrice < PRICE_CEIL && lvp > maxPrice) return false;
        // Only exclude on minPrice when finalPrice > 0 independently confirms the price
        // is low. When finalPrice = 0 (actual price is in priceOverride / not yet known),
        // include the product and let ProductCardExpander filter at variant level.
        if (minPrice > PRICE_FLOOR && lvp < minPrice && p.finalPrice > 0 && p.finalPrice < minPrice) return false;
        return true;
      }
    }

    // ── Single-price product path ─────────────────────────────────────────────────────
    const price = p.finalPrice > 0 ? p.finalPrice : null;
    if (!price) return true; // unknown price — include
    if (minPrice > PRICE_FLOOR && price < minPrice) return false;
    if (maxPrice < PRICE_CEIL && price > maxPrice) return false;
    return true;
  });

  const isPhoneCategory = selectedCategory?.toLowerCase() === "phone";
  const hasPhoneFilters = Object.values(phoneFilters).some((v) => v.length > 0);
  const isTvCategory =
    selectedCategory?.toLowerCase().includes("tv") ||
    selectedCategory?.toLowerCase().includes("television") ||
    false;
  const hasTvFilters = Object.values(tvFilters).some((v) => v.length > 0);
  const isLensCategory = !!selectedCategory?.toLowerCase().includes("lens");
  const isCameraCategory = !isLensCategory && !!selectedCategory?.toLowerCase().includes("camera");
  const isSpeakerCategory = !!selectedCategory?.toLowerCase().includes("speaker");
  const isSmartDeviceCategory = !isTvCategory && !!selectedCategory?.toLowerCase().includes("smart");
  const hasCameraFilters  = Object.values(cameraFilters).some((v) => v.length > 0);
  const hasLensFilters    = Object.values(lensFilters).some((v) => v.length > 0);
  const hasSpeakerFilters = Object.values(speakerFilters).some((v) => v.length > 0);
  // Pre-fetch detail for phones only when a spec filter is active (large catalogue).
  // Pre-fetch detail for TVs, cameras, lenses, speakers, and smart devices as soon as
  // the category is selected — these use per-variant cards and need detail immediately.
  const needsDetailFetch = (isPhoneCategory && hasPhoneFilters) || isTvCategory || isCameraCategory || isLensCategory || isSpeakerCategory || isSmartDeviceCategory;

  // When spec filters are active, pre-fetch detail for items not yet cached.
  useEffect(() => {
    if (!needsDetailFetch || priceFilteredItems.length === 0) return;
    const uncached = priceFilteredItems.filter((item) => !detailCache.has(item.slug));
    if (uncached.length === 0) return;
    let cancelled = false;
    // Use apiLimiter so we don't fire all detail fetches in parallel — a burst of
    // parallel requests on a shared IP (CGNAT) triggers ThrottlerException, causing
    // some fetches to fail silently and leaving specs uncached. Uncached products
    // pass the resolution filter unconditionally (if (!cached) return true), making
    // the filter appear broken even when resolution values are set in admin.
    Promise.all(
      uncached.map((item) =>
        apiLimiter(() => catalogApi.getProduct(item.slug)).then((d) => {
          detailCache.set(item.slug, { stock: d.stock, variants: d.variants, specs: d.specs ?? {} });
        }).catch(() => {})
      )
    ).then(() => {
      if (!cancelled) setCacheTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [needsDetailFetch, priceFilteredItems]);

  // cacheTick read to make React re-render after pre-fetch.
  void cacheTick;

  // Dynamic camera filter options — derived from cached product specs so only real values appear.
  const cameraFilterOptions = useMemo(() => {
    const specAllFromSpecs = (specs: Record<string, unknown>, baseKey: string): string[] => {
      const out: string[] = [];
      for (let i = 0; i < 5; i++) {
        const k = i === 0 ? baseKey : `${baseKey} ${i + 1}`;
        if (specs[k]) out.push(String(specs[k]).trim());
      }
      return out.filter(Boolean);
    };
    const n = (v: string) => v.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

    const afNums    = new Set<number>();
    const mounts    = new Set<string>();
    const sensors   = new Set<string>();
    const shutters  = new Set<string>();
    const connFound = new Set<string>();
    const resBkts   = new Set<string>();
    const kitFound  = new Set<string>();

    const CONN_OPTS = ["Wi-Fi", "Bluetooth", "NFC", "USB-C"];
    const RES_BUCKETS: [string, (mp: number) => boolean][] = [
      ["Under 20 MP", (mp) => mp < 20],
      ["20\u201324 MP", (mp) => mp >= 20 && mp <= 24],
      ["24\u201330 MP", (mp) => mp > 24 && mp <= 30],
      ["30\u201345 MP", (mp) => mp > 30 && mp <= 45],
      ["Above 45 MP", (mp) => mp > 45],
    ];

    for (const item of rawItems) {
      const cached = detailCache.get(item.slug);
      if (!cached) continue;
      const specs = cached.specs;

      // Autofocus Points
      ["Autofocus Points", "AF Points", "Number of Focus Points",
       "Phase Detection AF Points", "Auto Focus Points", "Total Focus Points"]
        .flatMap((k) => specAllFromSpecs(specs, k))
        .forEach((v) => { const ms = v.match(/\d+/g); if (ms) ms.forEach((m) => afNums.add(parseInt(m))); });

      // Lens Mount
      specAllFromSpecs(specs, "Lens Mount").forEach((v) => mounts.add(v));
      if (specs["Mount"])              mounts.add(String(specs["Mount"]).trim());
      if (specs["Mount Type"])         mounts.add(String(specs["Mount Type"]).trim());

      // Sensor Technology
      specAllFromSpecs(specs, "Sensor Type").forEach((v) => sensors.add(v));
      if (specs["Image Sensor"])       sensors.add(String(specs["Image Sensor"]).trim());
      if (specs["Sensor"])             sensors.add(String(specs["Sensor"]).trim());
      if (specs["Image Sensor Type"])  sensors.add(String(specs["Image Sensor Type"]).trim());

      // Shutter Speed
      ["Shutter Speed", "Maximum Shutter Speed", "Shutter Speed Range", "Electronic Shutter"]
        .flatMap((k) => specAllFromSpecs(specs, k))
        .forEach((v) => shutters.add(v));

      // Connectivity
      for (const opt of CONN_OPTS) {
        const o = n(opt);
        const directKeys = [opt, opt.replace(/-/g, " "), opt.replace(/-/g, "")];
        let found = directKeys.some((key) => {
          const v = n(String(specs[key] ?? ""));
          return v && v !== "no" && v !== "false" && v !== "not supported" && v !== "n/a";
        });
        if (!found) {
          const combined = n(String(
            specs["Connectivity"] ?? specs["Wireless Connectivity"] ??
            specs["Connectivity Technology"] ?? specs["Wireless Features"] ?? ""
          ));
          found = combined.includes(o)
            || (o === "wi fi" && combined.includes("wifi"))
            || (o === "usb c" && (combined.includes("type c") || combined.includes("usb type c")));
        }
        if (!found && o === "usb c") {
          const usbType = n(String(specs["USB Type"] ?? ""));
          found = usbType.includes("type c") || usbType.includes("type-c");
        }
        if (found) connFound.add(opt);
      }

      // Resolution (Megapixels)
      const mpRaw = ["Effective Resolution (MP)", "Maximum Resolution", "Effective Megapixels",
        "Resolution", "Megapixels", "Sensor Resolution", "Effective Pixels", "Maximum Megapixels"]
        .flatMap((k) => specAllFromSpecs(specs, k))
        .find(Boolean) ?? "";
      const mp = parseSpec(mpRaw);
      if (mp !== null) RES_BUCKETS.forEach(([label, test]) => { if (test(mp)) resBkts.add(label); });

      // Kit Type
      const variants = cached.variants;
      const lensVariants = variants.filter((v) => String(v.attributes.lensIncluded) === "Yes");
      const uniqueLenses = new Set(lensVariants.map((v) => String(v.attributes.lens ?? "").toLowerCase().trim()));
      if (variants.some((v) => String(v.attributes.lensIncluded) !== "Yes")) kitFound.add("Body Only");
      if (uniqueLenses.size === 1) kitFound.add("With Kit Lens");
      if (uniqueLenses.size >= 2)  kitFound.add("Twin Lens Kit");
    }

    return {
      autofocusPoints: Array.from(afNums).sort((a, b) => a - b).map(String),
      lensMount:       Array.from(mounts).filter(Boolean).sort(),
      sensorTech:      Array.from(sensors).filter(Boolean).sort(),
      shutterSpeed:    Array.from(shutters).filter(Boolean).sort(),
      connectivity:    CONN_OPTS.filter((o) => connFound.has(o)),
      resolution:      RES_BUCKETS.map(([l]) => l).filter((l) => resBkts.has(l)),
      kitType:         ["Body Only", "With Kit Lens", "Twin Lens Kit"].filter((k) => kitFound.has(k)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraCategory, rawItems, cacheTick]);
  const sortValue = sortOptions.find((o) => o.label === sortLabel)?.value;
  const specFiltered: ListCard[] = isPhoneCategory
    ? applyPhoneFilters(priceFilteredItems, phoneFilters)
    : isTvCategory
    ? applyTvFilters(priceFilteredItems, tvFilters)
    : isCameraCategory
    ? applyCameraFilters(priceFilteredItems, cameraFilters)
    : isLensCategory
    ? applyLensFilters(priceFilteredItems, lensFilters)
    : isSpeakerCategory
    ? applySpeakerFilters(priceFilteredItems, speakerFilters)
    : priceFilteredItems;
  // Re-sort client-side by effective price (lowestVariantPrice ?? finalPrice) so products
  // with basePrice=0 (variant-only pricing) appear in the correct position.
  const items: ListCard[] =
    sortValue === "price-asc" || sortValue === "price-desc"
      ? [...specFiltered].sort((a, b) => {
          const pa = a.lowestVariantPrice ?? a.finalPrice;
          const pb = b.lowestVariantPrice ?? b.finalPrice;
          return sortValue === "price-asc" ? pa - pb : pb - pa;
        })
      : specFiltered;
  const total = data?.total ?? 0;
  const brandFacets: BrandFacet[] = data?.facets.brands ?? [];

  // Count visible cards: for products with fetched variants, count variant cards.
  // Products not yet fetched count as 1 card each.
  const visibleCardCount = items.reduce((sum, p) => {
    const cached = detailCache.get(p.slug);
    if (!cached || cached.variants.length === 0) return sum + 1;
    // Camera: one card per lens-type group
    const isCamera = cached.variants.some((v) => "lensIncluded" in v.attributes);
    if (isCamera) {
      const groups = new Set(cached.variants.map((v) =>
        String(v.attributes.lensIncluded) === "Yes"
          ? `lens:${String(v.attributes.lens ?? "")}`.toLowerCase()
          : `body-only:${String(v.attributes.color ?? "").toLowerCase().trim()}`
      ));
      return sum + groups.size;
    }
    return sum + cached.variants.length;
  }, 0);

  // Build a per-variant filter for TV size so ProductCardExpander shows only matching sizes
  const tvSizeOpts = tvFilters["screenSize"] ?? [];
  const tvVariantFilter = isTvCategory && tvSizeOpts.length > 0
    ? (v: import("@/lib/api").Variant) => {
        const sv = v.attributes["size"];
        if (!sv) return true; // no size attribute — show the card
        const m = String(sv).match(/^(\d+(?:\.\d+)?)/);
        if (!m) return true;
        const inch = Number(m[1]);
        return tvSizeOpts.some((opt) => matchTvScreenSize(inch, opt));
      }
    : undefined;

  // Build a per-variant filter for phones so ProductCardExpander shows only variants
  // matching the selected RAM / storage options (other spec filters are product-level).
  const phoneRamOpts = phoneFilters["ram"] ?? [];
  const phoneStorOpts = phoneFilters["storage"] ?? [];
  const phoneVariantFilter = isPhoneCategory && (phoneRamOpts.length > 0 || phoneStorOpts.length > 0)
    ? (v: import("@/lib/api").Variant) => {
        if (phoneRamOpts.length > 0) {
          const r = parseGb(v.attributes["ram"]);
          if (r !== null && !phoneRamOpts.some((opt) => matchRamGb(r, opt))) return false;
        }
        if (phoneStorOpts.length > 0) {
          const s = parseGb(v.attributes["storage"]);
          if (s !== null && !phoneStorOpts.some((opt) => matchStorageGb(s, opt))) return false;
        }
        return true;
      }
    : undefined;

  const setPhoneFilter = (key: string, values: string[]) => {
    setPhoneFilters((prev) => ({ ...prev, [key]: values }));
  };
  const setTvFilter = (key: string, values: string[]) => {
    setTvFilters((prev) => ({ ...prev, [key]: values }));
  };
  const setCameraFilter = (key: string, values: string[]) => {
    setCameraFiltersState((prev) => ({ ...prev, [key]: values }));
  };
  const setLensFilter = (key: string, values: string[]) => {
    setLensFiltersState((prev) => ({ ...prev, [key]: values }));
  };
  const setSpeakerFilter = (key: string, values: string[]) => {
    setSpeakerFiltersState((prev) => ({ ...prev, [key]: values }));
  };

  const filterSidebar = (
    <aside className="w-full space-y-6">
      {/* Categories */}
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
          Category
        </h3>
        <div className="space-y-2">
          {categoriesLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : categoryOptions.length === 0 ? (
            <p className="text-xs text-gray-400">No categories available.</p>
          ) : (
            categoryOptions.map((cat) => (
              <label key={cat.slug} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory === cat.slug}
                  onChange={() => selectCategory(cat.slug)}
                  onClick={() => selectCategory(selectedCategory === cat.slug ? null : cat.slug)}
                  className="w-4 h-4 accent-[#129cd3] cursor-pointer"
                />
                <span className="text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                  {cat.name}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Price Range — collapsible */}
      <CollapsibleSection label="Price Range">
        {/* Predefined quick-pick ranges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {priceBuckets.map((b) => {
            const active = minPrice === b.min && maxPrice === b.max;
            return (
              <button
                key={b.label}
                onClick={() => {
                  setMinPrice(b.min);
                  setMaxPrice(b.max);
                }}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  active
                    ? "border-[#129cd3] bg-[#e8f7fc] text-[#129cd3] font-medium"
                    : "border-gray-200 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3]"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Dual-handle slider */}
        <div className="relative h-5">
          <div className="absolute top-1/2 -translate-y-1/2 h-1 w-full rounded bg-gray-200" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-[#129cd3]"
            style={{
              left: `${(Math.min(minPrice, SLIDER_MAX) / SLIDER_MAX) * 100}%`,
              right: `${100 - (Math.min(maxPrice, SLIDER_MAX) / SLIDER_MAX) * 100}%`,
            }}
          />
          <input
            type="range"
            min={PRICE_FLOOR}
            max={SLIDER_MAX}
            step={PRICE_STEP}
            value={Math.min(minPrice, SLIDER_MAX)}
            onChange={(e) =>
              setMinPrice(Math.min(Number(e.target.value), Math.min(maxPrice, SLIDER_MAX)))
            }
            className="price-range absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{ zIndex: minPrice >= maxPrice ? 4 : 3 }}
            aria-label="Minimum price"
          />
          <input
            type="range"
            min={PRICE_FLOOR}
            max={SLIDER_MAX}
            step={PRICE_STEP}
            value={Math.min(maxPrice, SLIDER_MAX)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxPrice(v >= SLIDER_MAX ? PRICE_CEIL : Math.max(v, minPrice));
            }}
            className="price-range absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{ zIndex: 3 }}
            aria-label="Maximum price"
          />
        </div>

        <div className="flex items-center justify-between text-xs mt-2">
          <span className="font-semibold text-[#129cd3]">
            ₹{minPrice.toLocaleString("en-IN")}
          </span>
          <span className="font-semibold text-[#129cd3]">
            {maxPrice >= PRICE_CEIL
              ? "₹2,00,000+"
              : `₹${Math.min(maxPrice, SLIDER_MAX).toLocaleString("en-IN")}`}
          </span>
        </div>
      </CollapsibleSection>

      {/* Brands — collapsible */}
      <CollapsibleSection label="Brand">
        <div className="space-y-2">
          {brandFacets.length === 0 ? (
            <p className="text-xs text-gray-400">No brands available.</p>
          ) : (
            brandFacets.map((b) => (
              <label key={b.name} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="brand"
                  checked={selectedBrand === b.name}
                  onChange={() => setSelectedBrand(b.name)}
                  onClick={() => setSelectedBrand(selectedBrand === b.name ? null : b.name)}
                  className="w-4 h-4 accent-[#129cd3] cursor-pointer"
                />
                <span className="text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                  {b.name}{" "}
                  <span className="text-xs text-gray-400">({b.count})</span>
                </span>
              </label>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Phone-specific filters — shown only for phone category */}
      {isPhoneCategory && PHONE_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={phoneFilters[group.key] ?? []}
          onChange={(vals) => setPhoneFilter(group.key, vals)}
        />
      ))}

      {/* TV-specific filters — shown only for TV category */}
      {isTvCategory && TV_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={tvFilters[group.key] ?? []}
          onChange={(vals) => setTvFilter(group.key, vals)}
        />
      ))}

      {/* Camera-specific filters — shown only for camera category */}
      {isCameraCategory && CAMERA_FILTER_GROUPS.map((group) => {
        const opts = (cameraFilterOptions as Record<string, string[]>)[group.key] ?? group.options;
        if (opts.length === 0) return null;
        return (
          <FilterSection
            key={group.key}
            label={group.label}
            options={opts}
            selected={cameraFilters[group.key] ?? []}
            onChange={(vals) => setCameraFilter(group.key, vals)}
          />
        );
      })}

      {/* Lens-specific filters — shown only for lens category */}
      {isLensCategory && LENS_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={lensFilters[group.key] ?? []}
          onChange={(vals) => setLensFilter(group.key, vals)}
        />
      ))}

      {/* Speaker-specific filters — shown only for speaker category */}
      {isSpeakerCategory && SPEAKER_FILTER_GROUPS.map((group) => (
        <FilterSection
          key={group.key}
          label={group.label}
          options={group.options}
          selected={speakerFilters[group.key] ?? []}
          onChange={(vals) => setSpeakerFilter(group.key, vals)}
        />
      ))}

      {/* Rating — always last */}
      <CollapsibleSection label="Rating">
        <div className="space-y-2">
          {ratingOptions.map((r) => (
            <label
              key={r}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="radio"
                name="rating"
                checked={minRating === r}
                onChange={() => setMinRating(r)}
                onClick={() => setMinRating(minRating === r ? null : r)}
                className="w-4 h-4 accent-[#129cd3] cursor-pointer"
              />
              <span className="flex items-center gap-1 text-sm text-gray-600 group-hover:text-[#129cd3] transition-colors">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={
                      i < r
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200 fill-gray-200"
                    }
                  />
                ))}
                <span className="ml-1 text-xs text-gray-500">&amp; up</span>
              </span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Clear Filters */}
      {(selectedBrand !== null ||
        minRating !== null ||
        minPrice !== PRICE_FLOOR ||
        maxPrice !== PRICE_CEIL ||
        hasPhoneFilters ||
        hasTvFilters ||
        hasCameraFilters ||
        hasLensFilters ||
        hasSpeakerFilters) && (
        <button
          onClick={() => {
            setSelectedBrand(null);
            setMinRating(null);
            setMinPrice(PRICE_FLOOR);
            setMaxPrice(PRICE_CEIL);
            setPhoneFilters({});
            setTvFilters({});
            setCameraFiltersState({});
            setLensFiltersState({});
            setSpeakerFiltersState({});
          }}
          className="w-full py-2 border border-[#129cd3] text-[#129cd3] text-sm rounded hover:bg-[#e8f7fc] transition-colors"
        >
          Clear All Filters
        </button>
      )}
    </aside>
  );

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <span>/</span>
            <span className="text-gray-800 font-medium">All Products</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 text-gray-600 hover:border-[#129cd3] hover:text-[#129cd3] transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden flex items-center gap-2 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded hover:border-[#129cd3] hover:text-[#129cd3] transition-colors"
              >
                <SlidersHorizontal size={15} /> Filters
              </button>
              <p className="text-sm text-gray-600 whitespace-nowrap">
                {loading ? (
                  <span className="text-gray-400">Loading…</span>
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-semibold text-gray-800">{visibleCardCount}</span>
                    {total > items.length && (
                      <> of <span className="font-semibold text-gray-800">{total}</span></>
                    )}{" "}
                    results
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-600 hidden sm:block">Sort by:</span>
              <div className="relative">
                <select
                  value={sortLabel}
                  onChange={(e) => setSortLabel(e.target.value)}
                  className="appearance-none border border-gray-300 text-sm px-3 py-2 pr-8 rounded outline-none hover:border-[#129cd3] focus:border-[#129cd3] bg-white text-gray-700 cursor-pointer"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            {/* Sidebar — desktop */}
            <div className="hidden lg:block w-56 flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg p-5 sticky top-24 z-[999] max-h-[calc(100vh-7rem)] overflow-y-auto">
                {filterSidebar}
              </div>
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="lg:hidden">
                <div
                  className="fixed inset-0 z-[9998] bg-black/40"
                  style={{ top: headerHeight }}
                  onClick={() => setSidebarOpen(false)}
                />
                <div
                  className="fixed left-0 bottom-0 z-[9998] bg-white w-72 overflow-y-auto shadow-xl"
                  style={{ top: headerHeight }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <h2 className="font-bold text-gray-800">Filters</h2>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Close filters"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-5">
                    {filterSidebar}
                  </div>
                </div>
              </div>
            )}

            {/* Product Grid */}
            <div className="flex-1">
              {error ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <p className="text-lg font-medium text-red-500 mb-1">Could not load products</p>
                  <p className="text-sm text-gray-400">{error}</p>
                </div>
              ) : loading ? (
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" style={{ gap: "clamp(7px, 1vw, 16px)" }}>
                  {[...Array(8)].map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                  {/* Illustration */}
                  <div className="mb-6">
                    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto opacity-60">
                      <circle cx="60" cy="60" r="56" fill="#f0f9ff" stroke="#bae6fd" strokeWidth="2"/>
                      <rect x="32" y="42" width="56" height="42" rx="4" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
                      <rect x="38" y="50" width="20" height="3" rx="1.5" fill="#7dd3fc"/>
                      <rect x="38" y="57" width="32" height="3" rx="1.5" fill="#bae6fd"/>
                      <rect x="38" y="64" width="26" height="3" rx="1.5" fill="#bae6fd"/>
                      <circle cx="80" cy="44" r="14" fill="#fff" stroke="#7dd3fc" strokeWidth="1.5"/>
                      <line x1="74" y1="38" x2="86" y2="50" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"/>
                      <line x1="86" y1="38" x2="74" y2="50" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  {/* Heading */}
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    {selectedCategory
                      ? "No Products Available"
                      : "No Products Found"}
                  </h3>
                  {/* Subtitle */}
                  <p className="text-sm text-gray-400 max-w-xs mb-7">
                    {(selectedBrand !== null || minRating !== null || minPrice !== PRICE_FLOOR || maxPrice !== PRICE_CEIL || hasPhoneFilters || hasTvFilters || hasCameraFilters || hasLensFilters || hasSpeakerFilters)
                      ? "No products match your current filters. Try clearing some filters or browsing a different category."
                      : selectedCategory
                      ? "There are no products available in this category right now. Please check back later."
                      : "We couldn't find any products. Try browsing our categories to discover what's available."}
                  </p>
                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    {(selectedBrand !== null || minRating !== null || minPrice !== PRICE_FLOOR || maxPrice !== PRICE_CEIL || hasPhoneFilters || hasTvFilters || hasCameraFilters || hasLensFilters || hasSpeakerFilters) && (
                      <button
                        onClick={() => {
                          setSelectedBrand(null);
                          setMinRating(null);
                          setMinPrice(PRICE_FLOOR);
                          setMaxPrice(PRICE_CEIL);
                          setPhoneFilters({});
                          setTvFilters({});
                          setCameraFiltersState({});
                          setLensFiltersState({});
                          setSpeakerFiltersState({});
                        }}
                        className="px-6 py-2.5 rounded-lg border border-[#129cd3] text-[#129cd3] text-sm font-medium hover:bg-[#e8f7fc] transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                    <Link
                      href="/products"
                      className="px-6 py-2.5 rounded-lg bg-[#129cd3] text-white text-sm font-medium hover:bg-[#0f87b8] transition-colors"
                    >
                      Browse All Products
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" style={{ gap: "clamp(7px, 1vw, 16px)" }}>
                  {sortValue === "price-asc" || sortValue === "price-desc" ? (
                    <PriceSortedGrid products={items} dir={sortValue === "price-asc" ? "asc" : "desc"} />
                  ) : (
                    items.map((product) => {
                      // When a phone RAM/storage filter is active, render matching variant
                      // cards directly from the cache instead of relying on prop propagation
                      // through ProductCardExpander's internal variants state.
                      if (phoneVariantFilter) {
                        const cached = detailCache.get(product.slug);
                        if (cached && cached.variants.length > 0) {
                          const matched = cached.variants.filter(phoneVariantFilter);
                          if (matched.length === 0) return null;
                          // Wrap in a keyed Fragment so React can correctly reconcile this
                          // group against the previous ProductCardExpander (same key).
                          return (
                            <React.Fragment key={product.id}>
                              {matched.map((v) => (
                                <ProductCard
                                  key={v.id}
                                  product={product}
                                  variantOverride={v}
                                />
                              ))}
                            </React.Fragment>
                          );
                        }
                      }
                      return (
                        <ProductCardExpander
                          key={product.id}
                          product={product}
                          priceMin={minPrice > PRICE_FLOOR ? minPrice : undefined}
                          priceMax={maxPrice < PRICE_CEIL ? maxPrice : undefined}
                          variantFilter={tvVariantFilter ?? phoneVariantFilter}
                        />
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
