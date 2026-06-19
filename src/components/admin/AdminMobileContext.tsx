"use client";

import { createContext, useContext } from "react";

const AdminMobileContext = createContext<{ onMenuToggle: () => void; isMobile: boolean }>({
  onMenuToggle: () => {},
  isMobile: false,
});

export function useAdminMobile() {
  return useContext(AdminMobileContext);
}

export default AdminMobileContext;
