"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Loader2,
  MessageSquare,
  Package,
  RefreshCcw,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { adminApi } from "@/lib/api";

type NotifKind = "order" | "stock" | "partner" | "ticket";

type NotifItem = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  href: string;
};

// Seen state: map of notif id → title (title includes the count, so changes re-trigger badge)
type SeenEntry = { id: string; title: string };
const SEEN_KEY = "admin_notif_seen";

function getSeenEntries(): SeenEntry[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenEntry[]) : [];
  } catch {
    return [];
  }
}

function saveSeenEntries(entries: SeenEntry[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(entries));
  } catch {}
}

/** Count notifications whose id or title differs from what was last seen. */
function countUnseen(items: NotifItem[], seen: SeenEntry[]): number {
  const seenMap = new Map(seen.map((e) => [e.id, e.title]));
  return items.filter((item) => seenMap.get(item.id) !== item.title).length;
}

const REFRESH_MS = 2 * 60 * 1000;

function kindMeta(kind: NotifKind) {
  switch (kind) {
    case "order":
      return { bg: "bg-blue-50", text: "text-blue-500", Icon: ShoppingBag };
    case "stock":
      return { bg: "bg-orange-50", text: "text-orange-500", Icon: Package };
    case "partner":
      return { bg: "bg-purple-50", text: "text-purple-500", Icon: Users };
    case "ticket":
      return { bg: "bg-yellow-50", text: "text-yellow-600", Icon: MessageSquare };
  }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [badge, setBadge] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // fetchNotifications has NO dependency on `open` — fixes the interval recreation bug
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, orders, tickets] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.listOrders({ status: "CONFIRMED", limit: 1 }),
        adminApi.listTickets({ status: "OPEN", limit: 1 }),
      ]);

      const notifs: NotifItem[] = [];

      if (orders.total > 0) {
        notifs.push({
          id: "confirmed-orders",
          kind: "order",
          title: `${orders.total} order${orders.total === 1 ? "" : "s"} to process`,
          body: "Confirmed orders waiting to be shipped",
          href: "/admin/orders?status=CONFIRMED",
        });
      }

      if (dashboard.lowStockAlerts.count > 0) {
        const { count, items: si } = dashboard.lowStockAlerts;
        const preview = si.slice(0, 2).map((i) => i.label).join(", ");
        const more = count > 2 ? ` +${count - 2} more` : "";
        notifs.push({
          id: "low-stock",
          kind: "stock",
          title: `${count} low stock alert${count === 1 ? "" : "s"}`,
          body: preview + more,
          href: "/admin/products",
        });
      }

      if (dashboard.pendingPartners > 0) {
        const n = dashboard.pendingPartners;
        notifs.push({
          id: "pending-partners",
          kind: "partner",
          title: `${n} partner${n === 1 ? "" : "s"} awaiting approval`,
          body: "KYC review pending",
          href: "/admin/users",
        });
      }

      if (tickets.total > 0) {
        const n = tickets.total;
        notifs.push({
          id: "open-tickets",
          kind: "ticket",
          title: `${n} open support ticket${n === 1 ? "" : "s"}`,
          body: "Customer requests awaiting response",
          href: "/admin/support?status=OPEN",
        });
      }

      setItems(notifs);
      // Badge = unseen count based on localStorage, not on whether dropdown is open
      setBadge(countUnseen(notifs, getSeenEntries()));
      setLastFetched(new Date());
    } catch {
      // Non-critical — silent fail
    } finally {
      setLoading(false);
    }
  }, []); // stable — no deps

  // Initial load + periodic refresh (interval is created only once)
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !dropRef.current?.contains(target) &&
        !btnRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Mark all currently loaded items as seen
      saveSeenEntries(items.map((i) => ({ id: i.id, title: i.title })));
      setBadge(0);
    }
  }

  return (
    <div className="relative order-2 sm:order-3 flex-shrink-0">
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative w-9 h-9 md:w-10 md:h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 transition-colors"
      >
        <Bell size={16} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropRef}
          className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Notifications</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchNotifications}
                disabled={loading}
                title="Refresh"
                className="text-gray-400 hover:text-[#129cd3] transition-colors disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCcw size={13} />
                )}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-gray-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={22} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">All clear — no alerts</p>
              </div>
            ) : (
              items.map((item) => {
                const { bg, text, Icon } = kindMeta(item.kind);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 mt-0.5`}
                    >
                      <Icon size={14} className={text} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {item.body}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          {lastFetched && (
            <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-right">
              Updated{" "}
              {lastFetched.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
