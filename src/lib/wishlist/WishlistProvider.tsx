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
import { isApiError, wishlistApi } from "@/lib/api";
import type { WishlistCardItem } from "@/lib/api";

type WishlistContextValue = {
  items: WishlistCardItem[];
  loading: boolean;
  error: string | null;
  isWishlisted: (productId: string) => boolean;
  add: (productId: string, variantId?: string) => Promise<void>;
  removeByProductId: (productId: string) => Promise<void>;
  removeByItemId: (wishlistItemId: string) => Promise<void>;
  setItems: (items: WishlistCardItem[]) => void;
  refresh: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [items, setItems] = useState<WishlistCardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await wishlistApi.view();
      setItems(v.items);
    } catch (err) {
      setError(
        isApiError(err) ? err.displayMessage : "Failed to load wishlist",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on auth change.
  useEffect(() => {
    if (status === "authenticated") {
      void refresh();
    } else if (status === "unauthenticated") {
      setItems([]);
      setError(null);
      setLoading(false);
    }
  }, [status, refresh]);

  const isWishlisted = useCallback(
    (productId: string) => items.some((it) => it.id === productId),
    [items],
  );

  const add = useCallback(
    async (productId: string, variantId?: string) => {
      const v = await wishlistApi.addItem({ productId, variantId });
      setItems(v.items);
    },
    [],
  );

  const removeByProductId = useCallback(
    async (productId: string) => {
      const target = items.find((it) => it.id === productId);
      if (!target) return;
      const v = await wishlistApi.removeItem(target.wishlistItemId);
      setItems(v.items);
    },
    [items],
  );

  const removeByItemId = useCallback(async (wishlistItemId: string) => {
    const v = await wishlistApi.removeItem(wishlistItemId);
    setItems(v.items);
  }, []);

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      loading,
      error,
      isWishlisted,
      add,
      removeByProductId,
      removeByItemId,
      setItems,
      refresh,
    }),
    [items, loading, error, isWishlisted, add, removeByProductId, removeByItemId, refresh],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx)
    throw new Error("useWishlist must be used within <WishlistProvider>");
  return ctx;
}
