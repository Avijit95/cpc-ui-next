"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Shield, Activity, LogOut, Download, Search, Monitor, Smartphone } from "lucide-react";

type Severity = "info" | "warning" | "critical";

interface LogEntry {
  id: number;
  admin: string;
  email: string;
  action: string;
  target: string;
  ip: string;
  device: "desktop" | "mobile";
  location: string;
  timestamp: string;
  severity: Severity;
}

const logs: LogEntry[] = [
  { id: 1, admin: "Avijit Ghosh", email: "admin@dextechlabs.com", action: "Updated product", target: "iPhone 15 Pro Max", ip: "103.212.45.19", device: "desktop", location: "Hyderabad, IN", timestamp: "2026-04-24 09:42:18", severity: "info" },
  { id: 2, admin: "Ramesh Iyer", email: "ramesh@cpc.com", action: "Deleted coupon", target: "CAM500", ip: "49.38.102.11", device: "desktop", location: "Mumbai, IN", timestamp: "2026-04-24 09:28:05", severity: "warning" },
  { id: 3, admin: "Avijit Ghosh", email: "admin@dextechlabs.com", action: "Approved KYC", target: "Mobile Mart Hyderabad", ip: "103.212.45.19", device: "desktop", location: "Hyderabad, IN", timestamp: "2026-04-24 09:12:44", severity: "info" },
  { id: 4, admin: "Unknown", email: "—", action: "Failed login attempt", target: "admin@dextechlabs.com", ip: "185.220.101.42", device: "desktop", location: "Unknown", timestamp: "2026-04-24 02:18:09", severity: "critical" },
  { id: 5, admin: "Aditi Verma", email: "aditi@cpc.com", action: "Refunded order", target: "CPC-10290", ip: "49.38.102.14", device: "desktop", location: "Bengaluru, IN", timestamp: "2026-04-23 16:08:02", severity: "warning" },
  { id: 6, admin: "Sahil Mehta", email: "sahil@cpc.com", action: "Resolved ticket", target: "TKT-00179", ip: "103.212.45.22", device: "mobile", location: "Pune, IN", timestamp: "2026-04-23 14:50:33", severity: "info" },
  { id: 7, admin: "Ramesh Iyer", email: "ramesh@cpc.com", action: "Bulk price update", target: "148 products", ip: "49.38.102.11", device: "desktop", location: "Mumbai, IN", timestamp: "2026-04-23 11:04:12", severity: "warning" },
  { id: 8, admin: "Avijit Ghosh", email: "admin@dextechlabs.com", action: "Signed in", target: "Admin dashboard", ip: "103.212.45.19", device: "desktop", location: "Hyderabad, IN", timestamp: "2026-04-23 09:00:02", severity: "info" },
];

const loginActivity = [
  { admin: "Avijit Ghosh", device: "Chrome on Windows · Hyderabad", ip: "103.212.45.19", time: "2026-04-24 09:00", current: true },
  { admin: "Avijit Ghosh", device: "Safari on iPhone · Hyderabad", ip: "103.212.45.21", time: "2026-04-23 21:15", current: false },
  { admin: "Avijit Ghosh", device: "Firefox on MacOS · Hyderabad", ip: "103.212.45.19", time: "2026-04-22 08:42", current: false },
];

const severityStyle: Record<Severity, string> = {
  info: "bg-blue-50 text-blue-600 border-blue-200",
  warning: "bg-amber-50 text-amber-600 border-amber-200",
  critical: "bg-red-50 text-red-600 border-red-200",
};

export default function LogsPage() {
  const [severity, setSeverity] = useState<"All" | Severity>("All");
  const [query, setQuery] = useState("");

  const filtered = logs.filter((l) => {
    const s = severity === "All" || l.severity === severity;
    const q =
      l.admin.toLowerCase().includes(query.toLowerCase()) ||
      l.action.toLowerCase().includes(query.toLowerCase()) ||
      l.target.toLowerCase().includes(query.toLowerCase());
    return s && q;
  });

  return (
    <>
      <AdminHeader
        title="Security & Logs"
        subtitle="Admin activity trail, login sessions and security events"
        actions={
          <button className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-4 py-2 hover:border-[#129cd3] hover:text-[#129cd3]">
            <Download size={14} /> Export logs
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            { label: "Events today", value: "184", icon: Activity, tint: "bg-[#e8f7fc] text-[#129cd3]" },
            { label: "Critical", value: "2", icon: Shield, tint: "bg-red-100 text-red-600" },
            { label: "Active sessions", value: "8", icon: Monitor, tint: "bg-emerald-100 text-emerald-600" },
            { label: "Failed logins", value: "14", icon: LogOut, tint: "bg-amber-100 text-amber-600" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.tint}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{s.label}</p>
                  <p className="text-xl font-bold text-gray-800">{s.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Login activity */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800 text-base">Your login sessions</h3>
              <p className="text-xs text-gray-500">Sign out of all devices if you notice anything unusual</p>
            </div>
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <LogOut size={12} /> Sign out all
            </button>
          </div>
          <ul className="divide-y divide-gray-100">
            {loginActivity.map((s, i) => (
              <li key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                    {s.device.toLowerCase().includes("iphone") || s.device.toLowerCase().includes("mobile") ? (
                      <Smartphone size={15} />
                    ) : (
                      <Monitor size={15} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.device}</p>
                    <p className="text-xs text-gray-500 font-mono">{s.ip} · {s.time}</p>
                  </div>
                </div>
                {s.current ? (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                    This device
                  </span>
                ) : (
                  <button className="text-xs font-semibold text-red-500 hover:underline">Sign out</button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Activity log */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-gray-800 text-base">Activity log</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-72">
                <Search size={14} className="text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search admin, action or target…"
                  className="bg-transparent outline-none text-sm text-gray-700 flex-1"
                />
              </div>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white capitalize"
              >
                <option value="All">All severity</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Admin</th>
                  <th className="text-left font-semibold px-5 py-3">Action</th>
                  <th className="text-left font-semibold px-5 py-3">Target</th>
                  <th className="text-left font-semibold px-5 py-3">IP / Location</th>
                  <th className="text-left font-semibold px-5 py-3">Timestamp</th>
                  <th className="text-left font-semibold px-5 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-800">{l.admin}</p>
                      <p className="text-xs text-gray-500">{l.email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{l.action}</td>
                    <td className="px-5 py-3 text-gray-700">{l.target}</td>
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs text-gray-600">{l.ip}</p>
                      <p className="text-[11px] text-gray-400">{l.location}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.timestamp}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize ${severityStyle[l.severity]}`}>
                        {l.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
