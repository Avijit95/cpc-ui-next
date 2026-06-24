"use client";

import { ArrowUpDown } from "lucide-react";
import type { SortState } from "./SortableHeader";

export type SortOption = {
  label: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
};

type Props = {
  options: readonly SortOption[];
  currentSort: SortState;
  onSort: (next: SortState) => void;
  className?: string;
};

function matchKey(opt: SortOption): string {
  return `${opt.sortBy}|${opt.sortOrder}`;
}

export default function SortByDropdown({ options, currentSort, onSort, className }: Props) {
  const current = `${currentSort.field}|${currentSort.order}`;
  const known = options.some((o) => matchKey(o) === current);

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <ArrowUpDown size={13} className="text-gray-400 flex-shrink-0" />
      <select
        value={known ? current : ""}
        onChange={(e) => {
          const [field, order] = e.target.value.split("|") as [
            string,
            "asc" | "desc",
          ];
          onSort({ field, order });
        }}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white text-gray-700 flex-1"
      >
        {!known && (
          <option value="" disabled>
            Sort by…
          </option>
        )}
        {options.map((o) => (
          <option key={matchKey(o)} value={matchKey(o)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
