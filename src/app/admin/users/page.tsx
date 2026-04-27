"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  UserPlus,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  Shield,
  Users,
  Store,
  ShieldCheck,
  Search,
} from "lucide-react";

type Tab = "customers" | "partners" | "admins";

const customers = [
  { id: 1, name: "Rahul Sharma", email: "rahul.s@gmail.com", phone: "+91 98765 43210", orders: 12, spent: 184500, joined: "2025-11-14", status: "Active" },
  { id: 2, name: "Priya Menon", email: "priyam@gmail.com", phone: "+91 99872 11001", orders: 8, spent: 92380, joined: "2025-12-02", status: "Active" },
  { id: 3, name: "Arjun Reddy", email: "arjun.r@outlook.com", phone: "+91 90004 87231", orders: 24, spent: 412800, joined: "2025-08-21", status: "Active" },
  { id: 4, name: "Neha Kapoor", email: "nehak@yahoo.in", phone: "+91 77891 55430", orders: 3, spent: 28790, joined: "2026-01-19", status: "Inactive" },
  { id: 5, name: "Vikram Singh", email: "vsingh@gmail.com", phone: "+91 88124 90021", orders: 17, spent: 236400, joined: "2025-09-10", status: "Active" },
];

const partners = [
  { id: 1, business: "Mobile Mart Hyderabad", owner: "Kiran Kumar", gstin: "36ABCDE1234F1Z5", city: "Hyderabad", kyc: "Approved", status: "Active", onboarded: "2025-07-02" },
  { id: 2, business: "TechZone Retail", owner: "Manish Jain", gstin: "07XYZPQ9876R1Z2", city: "Delhi", kyc: "Pending", status: "Under Review", onboarded: "2026-04-10" },
  { id: 3, business: "Digital World", owner: "Sunita Rao", gstin: "29DEFGH5678K1Z8", city: "Bengaluru", kyc: "Approved", status: "Active", onboarded: "2025-03-18" },
  { id: 4, business: "ElectroHub", owner: "Farhan Ali", gstin: "27MNOPQ4321T1Z3", city: "Mumbai", kyc: "Rejected", status: "Blocked", onboarded: "2026-02-25" },
];

const admins = [
  { id: 1, name: "Avijit Ghosh", email: "admin@dextechlabs.com", role: "Super Admin", lastLogin: "2026-04-24 09:12", ip: "103.212.45.19", status: "Active" },
  { id: 2, name: "Ramesh Iyer", email: "ramesh@cpc.com", role: "Product Manager", lastLogin: "2026-04-24 08:42", ip: "49.38.102.11", status: "Active" },
  { id: 3, name: "Aditi Verma", email: "aditi@cpc.com", role: "Order Manager", lastLogin: "2026-04-23 18:28", ip: "49.38.102.14", status: "Active" },
  { id: 4, name: "Sahil Mehta", email: "sahil@cpc.com", role: "Support Agent", lastLogin: "2026-04-22 17:55", ip: "103.212.45.22", status: "Suspended" },
];

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

const kycBadge = (kyc: string) => {
  if (kyc === "Approved") return { cls: "bg-emerald-50 text-emerald-600 border-emerald-200", Icon: CheckCircle2 };
  if (kyc === "Pending") return { cls: "bg-amber-50 text-amber-600 border-amber-200", Icon: Clock };
  return { cls: "bg-red-50 text-red-600 border-red-200", Icon: XCircle };
};

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("customers");
  const [query, setQuery] = useState("");

  const counts = {
    customers: customers.length,
    partners: partners.length,
    admins: admins.length,
  };

  return (
    <>
      <AdminHeader
        title="Users & Roles"
        subtitle="Manage customers, retail partners and admin accounts"
        actions={
          <button className="inline-flex items-center gap-1.5 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <UserPlus size={14} /> Add user
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Customers</p>
              <p className="text-xl font-bold text-gray-800">14,392</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Retail Partners</p>
              <p className="text-xl font-bold text-gray-800">286</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Admins</p>
              <p className="text-xl font-bold text-gray-800">12</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2">
            {(["customers", "partners", "admins"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-3.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                  tab === t
                    ? "border-[#129cd3] text-[#129cd3]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t} <span className="text-xs text-gray-400 ml-1">({counts[t]})</span>
              </button>
            ))}
          </div>

          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-80 max-w-full">
              <Search size={14} className="text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="bg-transparent outline-none text-sm text-gray-700 flex-1"
              />
            </div>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white">
              <option>All status</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Blocked</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            {tab === "customers" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Customer</th>
                    <th className="text-left font-semibold px-5 py-3">Contact</th>
                    <th className="text-left font-semibold px-5 py-3">Orders</th>
                    <th className="text-left font-semibold px-5 py-3">Total Spent</th>
                    <th className="text-left font-semibold px-5 py-3">Joined</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers
                    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
                    .map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#e8f7fc] text-[#129cd3] font-bold text-xs flex items-center justify-center">
                              {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{c.name}</p>
                              <p className="text-xs text-gray-500">{c.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{c.phone}</td>
                        <td className="px-5 py-3 text-gray-700">{c.orders}</td>
                        <td className="px-5 py-3 font-semibold">{formatPrice(c.spent)}</td>
                        <td className="px-5 py-3 text-gray-500">{c.joined}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              c.status === "Active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button className="text-gray-400 hover:text-[#129cd3]">
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {tab === "partners" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Business</th>
                    <th className="text-left font-semibold px-5 py-3">GSTIN</th>
                    <th className="text-left font-semibold px-5 py-3">City</th>
                    <th className="text-left font-semibold px-5 py-3">KYC</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="text-left font-semibold px-5 py-3">Onboarded</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {partners
                    .filter((p) => p.business.toLowerCase().includes(query.toLowerCase()))
                    .map((p) => {
                      const k = kycBadge(p.kyc);
                      const KI = k.Icon;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-gray-800">{p.business}</p>
                            <p className="text-xs text-gray-500">Owner: {p.owner}</p>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-600">{p.gstin}</td>
                          <td className="px-5 py-3 text-gray-700">{p.city}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${k.cls}`}>
                              <KI size={11} /> {p.kyc}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-700">{p.status}</td>
                          <td className="px-5 py-3 text-gray-500">{p.onboarded}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              {p.kyc === "Pending" && (
                                <>
                                  <button className="text-[11px] font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100">
                                    Approve
                                  </button>
                                  <button className="text-[11px] font-semibold px-2.5 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100">
                                    Reject
                                  </button>
                                </>
                              )}
                              <button className="text-gray-400 hover:text-[#129cd3]">
                                <MoreHorizontal size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}

            {tab === "admins" && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">Admin</th>
                    <th className="text-left font-semibold px-5 py-3">Role</th>
                    <th className="text-left font-semibold px-5 py-3">Last Login</th>
                    <th className="text-left font-semibold px-5 py-3">IP Address</th>
                    <th className="text-left font-semibold px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {admins
                    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
                    .map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-800">{a.name}</p>
                          <p className="text-xs text-gray-500">{a.email}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-200">
                            <Shield size={11} /> {a.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{a.lastLogin}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{a.ip}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              a.status === "Active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-red-50 text-red-600 border-red-200"
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button className="text-gray-400 hover:text-[#129cd3]">
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
