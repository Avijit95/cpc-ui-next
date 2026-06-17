"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cartApi, isApiError } from "@/lib/api";
import type { CartView, PricedCartLine } from "@/lib/api";

type CartContextValue = {
  items: PricedCartLine[];
  count: number; // total quantity across lines (header badge)
  loading: boolean;
  error: string | null;
  setCart: (view: CartView) => void;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [items, setItems] = useState<PricedCartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCart = useCallback((view: CartView) => setItems(view.items), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await cartApi.view();
      setItems(v.items);
    } catch (err) {
      setError(isApiError(err) ? err.displayMessage : "Failed to load cart");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on auth change.
  useEffect(() => {
    if (status === "unauthenticated") {
      // Async-defer the reset so we don't synchronously setState in the effect body.
      queueMicrotask(() => {
        setItems([]);
        setError(null);
        setLoading(false);
      });
      return;
    }
    if (status !== "authenticated") return;

    let cancelled = false;
    cartApi
      .view()
      .then((v) => {
        if (cancelled) return;
        setItems(v.items);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(isApiError(err) ? err.displayMessage : "Failed to load cart");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const count = useMemo(
    () => items.reduce((sum, it) => sum + it.qty, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({ items, count, loading, error, setCart, refresh }),
    [items, count, loading, error, setCart, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
