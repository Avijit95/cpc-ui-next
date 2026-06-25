"use client";

import { createContext, useCallback, useContext, useState } from "react";

type StockContextValue = {
  stocks: Record<string, number>;
  setStock: (key: string, stock: number) => void;
  adjustStock: (key: string, delta: number) => void;
};

const StockContext = createContext<StockContextValue | null>(null);

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [stocks, setStocks] = useState<Record<string, number>>({});

  const setStock = useCallback((key: string, stock: number) => {
    setStocks((prev) => (prev[key] === stock ? prev : { ...prev, [key]: stock }));
  }, []);

  const adjustStock = useCallback((key: string, delta: number) => {
    setStocks((prev) => {
      const cur = prev[key];
      if (cur === undefined) return prev;
      const next = Math.max(0, cur + delta);
      return next === cur ? prev : { ...prev, [key]: next };
    });
  }, []);

  return (
    <StockContext.Provider value={{ stocks, setStock, adjustStock }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStock must be used within <StockProvider>");
  return ctx;
}
