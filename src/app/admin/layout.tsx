"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminGuard from "@/components/admin/AdminGuard";
import AdminMobileContext from "@/components/admin/AdminMobileContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  // isMobile = below 1200px → sidebar is a floating drawer
  const [isMobile, setIsMobile] = useState(false);
  // mobileOpen = drawer open state
  const [mobileOpen, setMobileOpen] = useState(false);

  // Below 1200px: drawer mode. At 1200px+: fixed sidebar.
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      if (w < 1200) {
        setIsMobile(true);
        setMobileOpen(false);
      } else {
        setIsMobile(false);
        setMobileOpen(false);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // Close drawer when route changes
  // Close drawer when route changes
useEffect(() => {
  const closeDrawer = () => setMobileOpen(false);
  closeDrawer();
}, [pathname]);

  if (isLogin) return <>{children}</>;

  // Sidebar is a floating overlay below 1200px — no left padding needed.
  const contentPadding = isMobile ? "pl-0" : "pl-64";

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      <AdminSidebar
        floating={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={`${contentPadding} h-screen overflow-y-auto flex flex-col transition-[padding] duration-200`}
      >
        <AdminMobileContext.Provider value={{ onMenuToggle: () => setMobileOpen((o) => !o), isMobile }}>
          <AdminGuard>{children}</AdminGuard>
        </AdminMobileContext.Provider>
      </div>
    </div>
  );
}
