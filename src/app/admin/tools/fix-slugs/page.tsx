"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi } from "@/lib/api";

function toKebab(s: string) {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type Result = { id: string; name: string; oldSlug: string; newSlug: string; status: "updated" | "skipped" | "error"; error?: string };
type VResult = { productName: string; variantSku: string; removedSlug: string; status: "cleared" | "skipped" | "error"; error?: string };

export default function FixSlugsPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState<{ updated: number; skipped: number; errors: number } | null>(null);

  const [tvRunning, setTvRunning] = useState(false);
  const [tvResults, setTvResults] = useState<VResult[]>([]);
  const [tvSummary, setTvSummary] = useState<{ cleared: number; skipped: number; errors: number } | null>(null);

  const run = async () => {
    setRunning(true);
    setResults([]);
    setSummary(null);

    const out: Result[] = [];
    let offset = 0;
    const limit = 100;

    // Fetch all active products in pages
    while (true) {
      const page = await adminApi.listProducts({ status: "ACTIVE", limit, offset });
      for (const p of page.items) {
        const specSlug = typeof p.specs?.["Slug"] === "string" ? toKebab(p.specs["Slug"]) : "";
        const newSlug = specSlug || toKebab(p.name);

        if (!newSlug || newSlug === p.slug) {
          out.push({ id: p.id, name: p.name, oldSlug: p.slug, newSlug: p.slug, status: "skipped" });
          continue;
        }

        try {
          await adminApi.updateProduct(p.id, { slug: newSlug });
          out.push({ id: p.id, name: p.name, oldSlug: p.slug, newSlug, status: "updated" });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          out.push({ id: p.id, name: p.name, oldSlug: p.slug, newSlug, status: "error", error: msg });
        }

        // Update UI incrementally
        setResults([...out]);
      }

      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }

    const updated = out.filter(r => r.status === "updated").length;
    const skipped = out.filter(r => r.status === "skipped").length;
    const errors  = out.filter(r => r.status === "error").length;
    setSummary({ updated, skipped, errors });
    setResults(out);
    setRunning(false);
  };

  const runTvVariantFix = async () => {
    setTvRunning(true);
    setTvResults([]);
    setTvSummary(null);

    const out: VResult[] = [];

    // Find TV categories
    const categories = await adminApi.listCategories();
    const tvCats = categories.filter((c) =>
      c.slug?.toLowerCase().includes("tv") || c.name?.toLowerCase().includes("tv") || c.name?.toLowerCase().includes("television")
    );

    for (const cat of tvCats) {
      let offset = 0;
      while (true) {
        const page = await adminApi.listProducts({ categoryId: cat.id, status: "ACTIVE", limit: 50, offset });
        for (const p of page.items) {
          const detail = await adminApi.getProduct(p.id);
          for (const v of detail.variants) {
            const attrSlug = typeof v.attributes?.slug === "string" ? v.attributes.slug.trim() : "";
            if (!attrSlug) {
              out.push({ productName: p.name, variantSku: v.sku, removedSlug: "", status: "skipped" });
              continue;
            }
            // Clear attributes.slug by sending full attributes without the slug key
            const cleanedAttrs = { ...v.attributes };
            delete cleanedAttrs.slug;
            try {
              await adminApi.updateVariant(p.id, v.id, { attributes: cleanedAttrs });
              out.push({ productName: p.name, variantSku: v.sku, removedSlug: attrSlug, status: "cleared" });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              out.push({ productName: p.name, variantSku: v.sku, removedSlug: attrSlug, status: "error", error: msg });
            }
            setTvResults([...out]);
          }
        }
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) break;
      }
    }

    const cleared = out.filter(r => r.status === "cleared").length;
    const skipped = out.filter(r => r.status === "skipped").length;
    const errors  = out.filter(r => r.status === "error").length;
    setTvSummary({ cleared, skipped, errors });
    setTvResults(out);
    setTvRunning(false);
  };

  return (
    <>
      <AdminHeader title="Fix Product Slugs" subtitle="One-time tool: updates active product slugs from their Slug spec row." />
      <div className="p-5 max-w-4xl space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          This tool scans all <strong>ACTIVE</strong> products and sets each product&apos;s slug to the value in its <code className="bg-amber-100 px-1 rounded">Slug</code> spec field (if present), otherwise derives it from the product name. Products whose slug is already correct are skipped.
        </div>

        <button
          onClick={run}
          disabled={running}
          className="px-5 py-2.5 bg-[#129cd3] hover:bg-[#0e87b8] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {running ? "Running…" : "Run slug fix"}
        </button>

        {summary && (
          <div className="flex gap-4 text-sm font-semibold">
            <span className="text-green-700">{summary.updated} updated</span>
            <span className="text-gray-500">{summary.skipped} skipped</span>
            {summary.errors > 0 && <span className="text-red-600">{summary.errors} errors</span>}
          </div>
        )}

        {results.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Product</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Old slug</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">New slug</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.id} className={r.status === "updated" ? "bg-green-50" : r.status === "error" ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-500 max-w-[200px] truncate">{r.oldSlug}</td>
                    <td className="px-3 py-2 font-mono text-gray-800 max-w-[200px] truncate">{r.newSlug}</td>
                    <td className="px-3 py-2">
                      {r.status === "updated" && <span className="text-green-700 font-semibold">Updated</span>}
                      {r.status === "skipped" && <span className="text-gray-400">Skipped</span>}
                      {r.status === "error"   && <span className="text-red-600 font-semibold" title={r.error}>Error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Section 2: Clear bad TV variant slugs ── */}
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-1">Clear TV Variant Slugs</h2>
            <p className="text-sm text-gray-500">Removes the auto-generated <code className="bg-gray-100 px-1 rounded text-xs">attributes.slug</code> from all TV variants. These bad slugs caused &ldquo;Product Not Found&rdquo; when clicking TV variant cards. Run this once to clean up existing data.</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>Warning:</strong> This clears <code className="bg-red-100 px-1 rounded">attributes.slug</code> from every TV variant. If you have intentionally set any TV variant slugs via SlugSearch, those will also be removed. After running, re-set them in the product editor.
          </div>
          <button
            onClick={runTvVariantFix}
            disabled={tvRunning}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {tvRunning ? "Running…" : "Clear TV variant slugs"}
          </button>

          {tvSummary && (
            <div className="flex gap-4 text-sm font-semibold">
              <span className="text-green-700">{tvSummary.cleared} cleared</span>
              <span className="text-gray-500">{tvSummary.skipped} skipped (no slug)</span>
              {tvSummary.errors > 0 && <span className="text-red-600">{tvSummary.errors} errors</span>}
            </div>
          )}

          {tvResults.filter(r => r.status !== "skipped").length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Product</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Variant SKU</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Removed slug</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tvResults.filter(r => r.status !== "skipped").map((r, i) => (
                    <tr key={i} className={r.status === "cleared" ? "bg-green-50" : r.status === "error" ? "bg-red-50" : ""}>
                      <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{r.productName}</td>
                      <td className="px-3 py-2 font-mono text-gray-500 max-w-[200px] truncate">{r.variantSku}</td>
                      <td className="px-3 py-2 font-mono text-gray-500 max-w-[200px] truncate">{r.removedSlug}</td>
                      <td className="px-3 py-2">
                        {r.status === "cleared" && <span className="text-green-700 font-semibold">Cleared</span>}
                        {r.status === "error"   && <span className="text-red-600 font-semibold" title={r.error}>Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
