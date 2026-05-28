"use client";

import { Calendar, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type DateRange = {
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

type Props = {
  value: DateRange;
  onApply: (next: DateRange) => void;
  // When true, hides the "Updated" pair (e.g. activity-logs).
  hideUpdated?: boolean;
};

function countActive(r: DateRange): number {
  return (
    Number(!!r.createdFrom) +
    Number(!!r.createdTo) +
    Number(!!r.updatedFrom) +
    Number(!!r.updatedTo)
  );
}

export default function DateRangeFilter({ value, onApply, hideUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = countActive(value);

  const toggle = () => {
    if (!open) setDraft(value); // sync draft on open so the form shows current filters
    setOpen((v) => !v);
  };

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };
  const clear = () => {
    const empty: DateRange = {};
    setDraft(empty);
    onApply(empty);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-2 outline-none bg-white ${
          active > 0
            ? "border-[#129cd3] text-[#129cd3]"
            : "border-gray-200 hover:border-[#129cd3]"
        }`}
      >
        <Calendar size={14} />
        <span>Dates</span>
        {active > 0 && (
          <span className="text-[10px] font-semibold bg-[#e8f7fc] text-[#129cd3] rounded-full px-1.5">
            {active}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
                Added between
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={draft.createdFrom ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, createdFrom: e.target.value || undefined }))
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#129cd3]"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={draft.createdTo ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, createdTo: e.target.value || undefined }))
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#129cd3]"
                />
              </div>
            </div>
            {!hideUpdated && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
                  Updated between
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={draft.updatedFrom ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        updatedFrom: e.target.value || undefined,
                      }))
                    }
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#129cd3]"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="date"
                    value={draft.updatedTo ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        updatedTo: e.target.value || undefined,
                      }))
                    }
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#129cd3]"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X size={12} /> Clear
            </button>
            <button
              type="button"
              onClick={apply}
              className="text-sm font-semibold bg-[#129cd3] hover:bg-[#0e87b5] text-white px-4 py-1.5 rounded-lg"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
