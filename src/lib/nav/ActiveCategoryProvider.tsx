"use client";

import { createContext, useContext, useState } from "react";

export { placeCameraLensAfterCamera } from "./categoryUtils";

type Ctx = {
  activeCategory: string | null;
  setActiveCategory: (slug: string | null) => void;
};

const ActiveCategoryContext = createContext<Ctx>({
  activeCategory: null,
  setActiveCategory: () => {},
});

export function ActiveCategoryProvider({ children }: { children: React.ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  return (
    <ActiveCategoryContext.Provider value={{ activeCategory, setActiveCategory }}>
      {children}
    </ActiveCategoryContext.Provider>
  );
}

export const useActiveCategory = () => useContext(ActiveCategoryContext);
