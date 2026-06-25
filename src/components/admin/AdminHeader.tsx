"use client";

import { Bell, Menu, Search } from "lucide-react";
import React from "react";
import { useAdminMobile } from "./AdminMobileContext";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
}

export default function AdminHeader({ title, subtitle, actions, searchValue, onSearch, searchPlaceholder }: AdminHeaderProps) {
  const { onMenuToggle, isMobile } = useAdminMobile();

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex flex-wrap items-center justify-between sticky top-0 z-20 gap-x-3 gap-y-2">
      {/* Title row — full width below sm forces right side to wrap */}
      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
        {isMobile && (
          <button
            onClick={onMenuToggle}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Right side — wraps internally on mobile */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 md:gap-3 w-full sm:w-auto sm:flex-shrink-0">
        {/* Search — flex-1 on mobile, fixed width on sm+ | order-1 always */}
        <div className="flex order-1 flex-1 sm:flex-none sm:w-48 lg:w-72 items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-[#129cd3]/30 transition">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            value={onSearch !== undefined ? (searchValue ?? "") : undefined}
            onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
            placeholder={searchPlaceholder ?? "Search anything…"}
            className="bg-transparent outline-none text-sm text-gray-700 flex-1 placeholder:text-gray-400"
          />
        </div>
        {/* Bell — order-2 on mobile (same row as search), order-3 on sm+ (rightmost) */}
        <button className="relative order-2 sm:order-3 w-9 h-9 md:w-10 md:h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 transition-colors flex-shrink-0">
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>
        {/* Actions — order-3 on mobile (own full-width row, right-aligned), order-2 on sm+ */}
        {actions && (
          <div className="flex items-center gap-2 order-3 sm:order-2 basis-full sm:basis-auto justify-end sm:justify-start">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
