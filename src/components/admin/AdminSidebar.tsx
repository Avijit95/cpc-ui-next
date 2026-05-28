"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  FolderTree,
  Tag,
  ShoppingBag,
  FileText,
  BarChart3,
  Image as ImageIcon,
  LifeBuoy,
  Shield,
  LogOut,
  ChevronRight,
  Loader2,
  Star,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

const navGroups = [
  {
    label: "MAIN",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "MANAGEMENT",
    items: [
      { href: "/admin/users", label: "Users & Roles", icon: Users },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
      { href: "/admin/brands", label: "Brands", icon: Tag },
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/pricing", label: "Pricing & Discounts", icon: Tag },
      { href: "/admin/deals", label: "Today Deals", icon: Zap },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "BILLING",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { href: "/admin/invoices", label: "Invoices", icon: FileText },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/cms", label: "CMS", icon: ImageIcon },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
      { href: "/admin/logs", label: "Security & Logs", icon: Shield },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/admin/login");
    }
  };

  const adminName = user?.name || "Admin User";
  const adminEmail = user?.email || "";
  const initial = (adminName[0] || "A").toUpperCase();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0f172a] text-gray-300 flex flex-col z-30">
      <div className="px-6 py-5 border-b border-white/10">
        <Link href="/admin" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#129cd3] rounded-lg flex items-center justify-center text-white font-bold">
            C
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">CPC Admin</p>
            <p className="text-gray-400 text-[10px]">Control Panel</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-[#129cd3] text-white shadow-[0_4px_12px_rgba(18,156,211,0.3)]"
                          : "hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                      {active && <ChevronRight size={14} className="ml-auto" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#129cd3] flex items-center justify-center text-white text-sm font-bold">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              {adminName}
            </p>
            <p className="text-gray-400 text-[10px] truncate">
              {adminEmail}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 disabled:text-gray-500 disabled:hover:bg-transparent rounded-lg transition-colors"
        >
          {signingOut ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <LogOut size={14} />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
