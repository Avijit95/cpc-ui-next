"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type {
  PartnersReport,
  ProductsReport,
  ProductsReportSort,
  ReportExportDetail,
  ReportExportRow,
  ReportGroupBy,
  SalesReport,
} from "@/lib/api";
import {
  Download,
  Loader2,
  RefreshCcw,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type Tab = "sales" | "partners" | "products";

const TABS: { value: Tab; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "partners", label: "Partners" },
  { value: "products", label: "Products" },
];

const GROUP_OPTIONS: ReportGroupBy[] = ["day", "week", "month"];
const SORT_OPTIONS: ProductsReportSort[] = ["top", "slow"];

const EXPORT_POLL_INTERVAL_MS = 1500;
const EXPORT_POLL_MAX_ATTEMPTS = 30;

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isoStart(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoToday(): string {
  return new Date().toISOString();
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("sales");

  // Default range: last 30 days.
  const [from, setFrom] = useState(() => isoStart(30).slice(0, 10));
  const [to, setTo] = useState(() => isoToday().slice(0, 10));
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("day");
  const [sort, setSort] = useState<ProductsReportSort>("top");

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [partners, setPartners] = useState<PartnersReport | null>(null);
  const [products, setProducts] = useState<ProductsReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exports, setExports] = useState<ReportExportRow[]>([]);
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);

  // Initial + filter-change load. Logic inlined into the effect so the
  // React 19 set-state-in-effect lint can see only the cancelled-flag pattern.
  useEffect(() => {
    let cancelled = false;
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();
    const promise =
      tab === "sales"
        ? adminApi
            .getSalesReport({ from: fromIso, to: toIso, groupBy })
            .then((r) => {
              if (!cancelled) setSales(r);
            })
        : tab === "partners"
        ? adminApi
            .getPartnersReport({ from: fromIso, to: toIso })
            .then((r) => {
              if (!cancelled) setPartners(r);
            })
        : adminApi
            .getProductsReport({
              from: fromIso,
              to: toIso,
              sort,
              limit: 50,
            })
            .then((r) => {
              if (!cancelled) setProducts(r);
            });
    promise
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load report",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, from, to, groupBy, sort]);

  // Refresh exports list — used both on mount and after each new enqueue.
  const refreshExports = useCallback(async () => {
    try {
      const r = await adminApi.listReportExports();
      setExports(r.rows);
    } catch {
      // Quiet — non-critical.
    }
  }, []);

  // Mount-only initial load. Inlined for the same lint reason as above.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listReportExports()
      .then((r) => {
        if (!cancelled) setExports(r.rows);
      })
      .catch(() => {
        // Non-critical.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = useCallback(async () => {
    setEnqueueBusy(true);
    setEnqueueError(null);
    try {
      let enqueued: ReportExportDetail;
      if (tab === "sales") {
        enqueued = await adminApi.enqueueSalesExport({
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          groupBy,
        });
      } else if (tab === "partners") {
        enqueued = await adminApi.enqueuePartnersExport({
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        });
      } else {
        enqueued = await adminApi.enqueueProductsExport({
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          sort,
          limit: 50,
        });
      }
      // Optimistically prepend so the new row shows up immediately.
      setExports((prev) => [enqueued, ...prev]);
      // Poll for completion in the background.
      void pollExport(enqueued.id, refreshExports);
    } catch (err) {
      setEnqueueError(
        isApiError(err) ? err.displayMessage : "Could not enqueue export",
      );
    } finally {
      setEnqueueBusy(false);
    }
  }, [tab, from, to, groupBy, sort, refreshExports]);

  return (
    <>
      <AdminHeader
        title="Analytics"
        subtitle="Sales, partners, and product reports"
      />

      <div className="p-6 space-y-5">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 gap-6">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                if (t.value === tab) return;
                setTab(t.value);
                setLoading(true);
              }}
              className={`pb-3 text-sm font-semibold transition-colors ${
                tab === t.value
                  ? "text-[#129cd3] border-b-2 border-[#129cd3]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setLoading(true);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setLoading(true);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
            />
          </div>
          {tab === "sales" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Group by</label>
              <select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as ReportGroupBy);
                  setLoading(true);
                }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
              >
                {GROUP_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tab === "products" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sort</label>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as ProductsReportSort);
                  setLoading(true);
                }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "top" ? "Top sellers" : "Slow movers"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto">
            <button
              onClick={handleExport}
              disabled={enqueueBusy}
              className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {enqueueBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Export CSV
            </button>
          </div>
        </div>

        {enqueueError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {enqueueError}
          </div>
        )}

        {/* Report body */}
        {loading ? (
          <div className="space-y-3">
            <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
            <div className="h-64 bg-white rounded-xl border border-gray-200 animate-pulse" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
            {error}
          </div>
        ) : tab === "sales" && sales ? (
          <SalesView report={sales} />
        ) : tab === "partners" && partners ? (
          <PartnersView report={partners} />
        ) : tab === "products" && products ? (
          <ProductsView report={products} />
        ) : null}

        {/* Recent exports */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Recent exports</h3>
            <button
              onClick={refreshExports}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#129cd3]"
            >
              <RefreshCcw size={12} /> Refresh
            </button>
          </div>
          {exports.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 text-center">
              No exports yet. Hit “Export CSV” to enqueue one.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {exports.map((row) => (
                <ExportRow key={row.id} row={row} onRefresh={refreshExports} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function SalesView({ report }: { report: SalesReport }) {
  const totals = report.buckets.reduce(
    (acc, b) => ({
      orderCount: acc.orderCount + b.orderCount,
      grandTotal: acc.grandTotal + b.grandTotal,
      subtotal: acc.subtotal + b.subtotal,
      gstTotal: acc.gstTotal + b.gstTotal,
    }),
    { orderCount: 0, grandTotal: 0, subtotal: 0, gstTotal: 0 },
  );
  const maxBar = Math.max(1, ...report.buckets.map((b) => b.grandTotal));
  return (
    <div className="space-y-5">
      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SmallCard label="Orders" value={totals.orderCount.toLocaleString()} />
        <SmallCard label="Revenue" value={formatPrice(totals.grandTotal)} />
        <SmallCard label="Subtotal" value={formatPrice(totals.subtotal)} />
        <SmallCard label="GST" value={formatPrice(totals.gstTotal)} />
      </div>

      {/* Bar chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h4 className="text-sm font-bold text-gray-800 mb-1">
          Revenue by {report.groupBy}
        </h4>
        <p className="text-xs text-gray-500 mb-4">
          {report.buckets.length} bucket
          {report.buckets.length === 1 ? "" : "s"}
        </p>
        {report.buckets.length === 0 ? (
          <p className="text-sm text-gray-500">No data in range.</p>
        ) : (
          <div className="flex items-end gap-2 h-56 overflow-x-auto">
            {report.buckets.map((b) => (
              <div
                key={b.bucket}
                className="flex-1 min-w-[24px] flex flex-col items-center gap-1"
              >
                <div
                  className="w-full bg-gradient-to-t from-[#129cd3] to-[#8dd4ee] rounded-t"
                  style={{
                    height: `${(b.grandTotal / maxBar) * 100}%`,
                    minHeight: b.grandTotal > 0 ? "4px" : "0",
                  }}
                  title={`${b.bucket}: ${formatPrice(b.grandTotal)}`}
                />
                <span className="text-[10px] text-gray-400">
                  {b.bucket.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bucket table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left font-semibold px-5 py-3">Bucket</th>
                <th className="text-right font-semibold px-5 py-3">Orders</th>
                <th className="text-right font-semibold px-5 py-3">Subtotal</th>
                <th className="text-right font-semibold px-5 py-3">Discount</th>
                <th className="text-right font-semibold px-5 py-3">GST</th>
                <th className="text-right font-semibold px-5 py-3">Shipping</th>
                <th className="text-right font-semibold px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.buckets.map((b) => (
                <tr key={b.bucket} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                    {b.bucket}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {b.orderCount}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {formatPrice(b.subtotal)}
                  </td>
                  <td className="px-5 py-3 text-right text-green-600">
                    {b.discountTotal > 0 ? `−${formatPrice(b.discountTotal)}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {formatPrice(b.gstTotal)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {formatPrice(b.shippingTotal)}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">
                    {formatPrice(b.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PartnersView({ report }: { report: PartnersReport }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h4 className="text-sm font-bold text-gray-800">
          {report.partners.length} partner{report.partners.length === 1 ? "" : "s"}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Partner</th>
              <th className="text-left font-semibold px-5 py-3">Company</th>
              <th className="text-right font-semibold px-5 py-3">Orders</th>
              <th className="text-right font-semibold px-5 py-3">Gross</th>
              <th className="text-right font-semibold px-5 py-3">Discount</th>
              <th className="text-right font-semibold px-5 py-3">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.partners.map((p) => (
              <tr key={p.partnerId} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="font-semibold text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.email ?? "—"}</p>
                </td>
                <td className="px-5 py-3 text-gray-700">{p.companyName ?? "—"}</td>
                <td className="px-5 py-3 text-right text-gray-700">{p.orderCount}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-800">
                  {formatPrice(p.gross)}
                </td>
                <td className="px-5 py-3 text-right text-green-600">
                  {p.discountTotal > 0 ? `−${formatPrice(p.discountTotal)}` : "—"}
                </td>
                <td className="px-5 py-3 text-right text-gray-500 whitespace-nowrap">
                  {formatDate(p.lastOrderAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductsView({ report }: { report: ProductsReport }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-800">
          {report.sort === "top" ? "Top sellers" : "Slow movers"} ·{" "}
          {report.products.length} product{report.products.length === 1 ? "" : "s"}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Product</th>
              <th className="text-right font-semibold px-5 py-3">Stock</th>
              <th className="text-right font-semibold px-5 py-3">Units sold</th>
              <th className="text-right font-semibold px-5 py-3">Gross</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.products.map((p) => (
              <tr key={p.productId} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-700">{p.name}</td>
                <td className="px-5 py-3 text-right text-gray-700">{p.stock}</td>
                <td className="px-5 py-3 text-right text-gray-700">{p.unitsSold}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-800">
                  {formatPrice(p.gross)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SmallCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  );
}

function ExportRow({
  row,
  onRefresh,
}: {
  row: ReportExportRow;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchUrl = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const fresh = await adminApi.getReportExport(row.id);
      setUrl(fresh.downloadUrl);
      // If still not ready, surface that.
      if (!fresh.downloadUrl) {
        setErr("Download URL not ready yet.");
      }
    } catch (e) {
      setErr(isApiError(e) ? e.displayMessage : "Could not fetch URL.");
    } finally {
      setBusy(false);
    }
  }, [row.id]);

  const StatusIcon =
    row.status === "READY"
      ? CheckCircle2
      : row.status === "FAILED"
      ? XCircle
      : Clock;
  const statusTint =
    row.status === "READY"
      ? "text-emerald-600"
      : row.status === "FAILED"
      ? "text-red-500"
      : "text-amber-500";

  return (
    <li className="px-5 py-3 flex items-center gap-3 text-sm">
      <StatusIcon size={14} className={`${statusTint} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 capitalize">
          {row.reportType} export
        </p>
        <p className="text-xs text-gray-500">
          {row.status}
          {row.rowCount !== null ? ` · ${row.rowCount} rows` : ""}
          {row.error ? ` · ${row.error}` : ""}
          {" · "}
          {formatDate(row.createdAt)}
        </p>
      </div>
      {row.status === "READY" ? (
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] transition-colors"
          >
            <Download size={13} /> Download
          </a>
        ) : (
          <button
            onClick={fetchUrl}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#129cd3] border border-[#129cd3] px-3 py-1.5 rounded-lg hover:bg-[#e8f7fc] disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ChevronRight size={13} />
            )}
            Get link
          </button>
        )
      ) : row.status === "FAILED" ? null : (
        <button
          onClick={onRefresh}
          className="text-xs text-gray-500 hover:text-[#129cd3]"
        >
          <RefreshCcw size={13} />
        </button>
      )}
      {err && <p className="text-xs text-red-500 ml-2">{err}</p>}
    </li>
  );
}

async function pollExport(id: string, onRefresh: () => Promise<void>) {
  for (let i = 0; i < EXPORT_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, EXPORT_POLL_INTERVAL_MS));
    try {
      const fresh = await adminApi.getReportExport(id);
      if (fresh.status === "READY" || fresh.status === "FAILED") {
        await onRefresh();
        return;
      }
    } catch {
      return; // Bail silently on error.
    }
  }
  await onRefresh();
}
