"use client";

import { Bell, Menu, Search } from "lucide-react";
import React from "react";
import { useAdminMobile } from "./AdminMobileContext";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  const { onMenuToggle, isMobile } = useAdminMobile();

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — shown below 1200px (floating drawer mode) */}
        {isMobile && <button
          onClick={onMenuToggle}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>}
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-48 lg:w-72 focus-within:ring-2 focus-within:ring-[#129cd3]/30 transition">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search anything…"
            className="bg-transparent outline-none text-sm text-gray-700 flex-1 placeholder:text-gray-400"
          />
        </div>
        <button className="relative w-9 h-9 md:w-10 md:h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 transition-colors flex-shrink-0">
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
