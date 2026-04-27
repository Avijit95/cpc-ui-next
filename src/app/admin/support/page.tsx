"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { LifeBuoy, Clock, CheckCircle2, AlertCircle, Search, Send } from "lucide-react";

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";
type Priority = "Low" | "Medium" | "High" | "Urgent";

interface Ticket {
  id: string;
  subject: string;
  customer: string;
  email: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  updated: string;
  messages: { from: string; role: "customer" | "agent"; body: string; time: string }[];
}

const tickets: Ticket[] = [
  {
    id: "TKT-00182",
    subject: "Order not delivered yet",
    customer: "Rahul Sharma",
    email: "rahul.s@gmail.com",
    category: "Delivery",
    priority: "High",
    status: "Open",
    updated: "2026-04-24 09:42",
    messages: [
      { from: "Rahul Sharma", role: "customer", body: "Hi, my order CPC-10294 hasn't arrived despite the estimated delivery date being yesterday. Please check.", time: "2026-04-24 09:12" },
      { from: "Rahul Sharma", role: "customer", body: "Any update? This is urgent — I need it for a gift.", time: "2026-04-24 09:42" },
    ],
  },
  {
    id: "TKT-00181",
    subject: "Refund for cancelled order",
    customer: "Vikram Singh",
    email: "vsingh@gmail.com",
    category: "Refund",
    priority: "Medium",
    status: "In Progress",
    updated: "2026-04-23 16:10",
    messages: [
      { from: "Vikram Singh", role: "customer", body: "I cancelled CPC-10290 yesterday but haven't received a refund.", time: "2026-04-23 10:22" },
      { from: "Aditi Verma", role: "agent", body: "Hi Vikram, I've initiated the refund. It should reflect in 5-7 business days.", time: "2026-04-23 16:10" },
    ],
  },
  { id: "TKT-00180", subject: "Damaged camera on arrival", customer: "Neha Kapoor", email: "nehak@yahoo.in", category: "Product", priority: "Urgent", status: "Open", updated: "2026-04-23 11:04", messages: [] },
  { id: "TKT-00179", subject: "Coupon code not applied", customer: "Priya Menon", email: "priyam@gmail.com", category: "Billing", priority: "Low", status: "Resolved", updated: "2026-04-22 19:30", messages: [] },
  { id: "TKT-00178", subject: "Unable to log in", customer: "Arjun Reddy", email: "arjun.r@outlook.com", category: "Account", priority: "Medium", status: "Closed", updated: "2026-04-21 14:15", messages: [] },
];

const statusStyle: Record<TicketStatus, string> = {
  Open: "bg-red-50 text-red-600 border-red-200",
  "In Progress": "bg-amber-50 text-amber-600 border-amber-200",
  Resolved: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Closed: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityStyle: Record<Priority, string> = {
  Low: "text-gray-500",
  Medium: "text-blue-600",
  High: "text-amber-600",
  Urgent: "text-red-500",
};

export default function SupportPage() {
  const [selected, setSelected] = useState<Ticket>(tickets[0]);
  const [query, setQuery] = useState("");

  return (
    <>
      <AdminHeader
        title="Support"
        subtitle="Manage customer tickets and track resolution status"
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            { label: "Open", value: 24, icon: AlertCircle, tint: "bg-red-100 text-red-600" },
            { label: "In Progress", value: 18, icon: Clock, tint: "bg-amber-100 text-amber-600" },
            { label: "Resolved Today", value: 31, icon: CheckCircle2, tint: "bg-emerald-100 text-emerald-600" },
            { label: "Avg Response", value: "42m", icon: LifeBuoy, tint: "bg-[#e8f7fc] text-[#129cd3]" },
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

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          {/* Ticket list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tickets…"
                  className="bg-transparent outline-none text-sm text-gray-700 flex-1"
                />
              </div>
            </div>
            <ul className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[600px]">
              {tickets
                .filter(
                  (t) =>
                    t.subject.toLowerCase().includes(query.toLowerCase()) ||
                    t.customer.toLowerCase().includes(query.toLowerCase())
                )
                .map((t) => {
                  const active = selected.id === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelected(t)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          active ? "bg-[#e8f7fc]" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] text-[#129cd3] font-semibold">{t.id}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle[t.status]}`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800 line-clamp-1">{t.subject}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-500">{t.customer}</span>
                          <span className={`text-[11px] font-bold ${priorityStyle[t.priority]}`}>
                            ● {t.priority}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>

          {/* Ticket detail */}
          <div className="bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[11px] text-[#129cd3] font-semibold">{selected.id}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle[selected.status]}`}>
                    {selected.status}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">●</span>
                  <span className={`text-[11px] font-bold ${priorityStyle[selected.priority]}`}>
                    {selected.priority} priority
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-800">{selected.subject}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selected.customer} · {selected.email} · {selected.category}
                </p>
              </div>
              <select
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none hover:border-[#129cd3] bg-white"
                defaultValue={selected.status}
              >
                <option>Open</option>
                <option>In Progress</option>
                <option>Resolved</option>
                <option>Closed</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[500px] bg-gray-50/40">
              {selected.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">No messages yet.</p>
              ) : (
                selected.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[75%] ${m.role === "agent" ? "ml-auto" : "mr-auto"}`}
                  >
                    <div
                      className={`rounded-xl p-3.5 ${
                        m.role === "agent"
                          ? "bg-[#129cd3] text-white"
                          : "bg-white border border-gray-200 text-gray-700"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{m.body}</p>
                    </div>
                    <p className={`text-[10px] text-gray-400 mt-1 px-1 ${m.role === "agent" ? "text-right" : ""}`}>
                      {m.from} · {m.time}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-100 p-4 flex items-center gap-2">
              <input
                placeholder="Type a reply…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3]"
              />
              <button className="bg-[#129cd3] hover:bg-[#0e87b5] text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold">
                <Send size={14} /> Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
