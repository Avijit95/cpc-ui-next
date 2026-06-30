"use client";

import { createContext, useCallback, useContext, useState } from "react";

// ── Persistent confirmed-purchase records ─────────────────────────────────────
// Each entry is written once (idempotent on orderId+key) so refreshing the
// payment-result page or hard-refreshing the browser never double-counts.
const LS_KEY = "cpc_purchase_records";

interface PurchaseRecord {
  key: string;    // "v:{variantId}" or "p:{slug}"
  qty: number;
  orderId: string;
}

function loadRecords(): PurchaseRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PurchaseRecord[]) : [];
  } catch { return []; }
}

/** Returns total qty confirmed-purchased for a stock key. */
function totalConfirmedQty(key: string): number {
  return loadRecords()
    .filter((r) => r.key === key)
    .reduce((sum, r) => sum + r.qty, 0);
}

/** Appends a purchase record; returns false if already recorded (no-op). */
function addRecord(record: PurchaseRecord): boolean {
  try {
    const records = loadRecords();
    if (records.some((r) => r.orderId === record.orderId && r.key === record.key)) {
      return false;
    }
    records.push(record);
    localStorage.setItem(LS_KEY, JSON.stringify(records));
    return true;
  } catch { return false; }
}

// ── Context ───────────────────────────────────────────────────────────────────
type StockContextValue = {
  stocks: Record<string, number>;
  /** Seed a key from an API value. Applies any confirmed purchase deductions. */
  setStock: (key: string, stock: number) => void;
  /** In-memory adjustment (cart reservation). Not persisted across refreshes. */
  adjustStock: (key: string, delta: number) => void;
  /** Record a confirmed purchase for a key. Persisted to localStorage. */
  recordPurchase: (key: string, qty: number, orderId: string) => void;
};

const StockContext = createContext<StockContextValue | null>(null);

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [stocks, setStocks] = useState<Record<string, number>>({});

  // Called by pages to seed stock from the API response.
  // Subtracts any confirmed purchases so the value survives page refresh.
  const setStock = useCallback((key: string, stock: number) => {
    const confirmed = totalConfirmedQty(key);
    const effective = confirmed > 0 ? Math.max(0, stock - confirmed) : stock;
    setStocks((prev) => (prev[key] === effective ? prev : { ...prev, [key]: effective }));
  }, []);

  // In-memory adjustment (add-to-cart, cart qty change). Resets on refresh.
  const adjustStock = useCallback((key: string, delta: number) => {
    setStocks((prev) => {
      const cur = prev[key];
      if (cur === undefined) return prev;
      const next = Math.max(0, cur + delta);
      return next === cur ? prev : { ...prev, [key]: next };
    });
  }, []);

  // Record a confirmed purchase (after successful payment).
  // Persists to localStorage and updates the in-memory store immediately.
  const recordPurchase = useCallback((key: string, qty: number, orderId: string) => {
    const isNew = addRecord({ key, qty, orderId });
    if (!isNew) return; // already recorded (e.g. StrictMode double-fire)
    setStocks((prev) => {
      const cur = prev[key];
      if (cur === undefined) return prev;
      const next = Math.max(0, cur - qty);
      return next === cur ? prev : { ...prev, [key]: next };
    });
  }, []);

  return (
    <StockContext.Provider value={{ stocks, setStock, adjustStock, recordPurchase }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStock must be used within <StockProvider>");
  return ctx;
}
