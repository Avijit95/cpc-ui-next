"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

export type SortOrder = "asc" | "desc";

export type SortState = {
  field: string;
  order: SortOrder;
};

type Props = {
  field: string;
  currentSort: SortState;
  onSort: (next: SortState) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
};

export default function SortableHeader({
  field,
  currentSort,
  onSort,
  align = "left",
  className = "",
  children,
}: Props) {
  const active = currentSort.field === field;
  const nextOrder: SortOrder =
    active && currentSort.order === "desc" ? "asc" : "desc";

  return (
    <th
      className={`text-${align} font-semibold px-5 py-3 ${className}`}
      aria-sort={
        active ? (currentSort.order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort({ field, order: nextOrder })}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-[#129cd3] ${
          active ? "text-[#129cd3]" : "text-gray-500"
        }`}
      >
        <span>{children}</span>
        {active ? (
          currentSort.order === "asc" ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-gray-300" />
        )}
      </button>
    </th>
  );
}
