"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminGuard from "@/components/admin/AdminGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The login page renders its own full-screen layout — skip the sidebar + auth guard.
  const isLogin = pathname === "/admin/login";
  const [collapsed, setCollapsed] = useState(false);

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      <AdminSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      {/* Dedicated scroll container so tall pages scroll reliably (the sticky
          AdminHeader sticks within this, not the window). */}
      <div
        className={`${
          collapsed ? "pl-16" : "pl-64"
        } h-screen overflow-y-auto flex flex-col transition-[padding] duration-200`}
      >
        <AdminGuard>{children}</AdminGuard>
      </div>
    </div>
  );
}
