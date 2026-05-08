"use client";

import { useCallback, useEffect, useState } from "react";
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
  Loader2,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import type { AdminPartner, KycStatus } from "@/lib/api";

type Tab = "customers" | "partners" | "admins";

// Customers and admins endpoints aren't built yet (api-integration.md §8).
// Keep static fixtures so the existing tabs stay usable for visual review.
const customers = [
  { id: 1, name: "Rahul Sharma", email: "rahul.s@gmail.com", phone: "+91 98765 43210", orders: 12, spent: 184500, joined: "2025-11-14", status: "Active" },
  { id: 2, name: "Priya Menon", email: "priyam@gmail.com", phone: "+91 99872 11001", orders: 8, spent: 92380, joined: "2025-12-02", status: "Active" },
  { id: 3, name: "Arjun Reddy", email: "arjun.r@outlook.com", phone: "+91 90004 87231", orders: 24, spent: 412800, joined: "2025-08-21", status: "Active" },
];

const admins = [
  { id: 1, name: "Avijit Ghosh", email: "admin@dextechlabs.com", role: "Super Admin", lastLogin: "2026-04-24 09:12", ip: "103.212.45.19", status: "Active" },
];

function formatPrice(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function kycLabel(s: KycStatus): string {
  if (s === "VERIFIED") return "Approved";
  if (s === "PENDING") return "Pending";
  if (s === "REJECTED") return "Rejected";
  return "—";
}

const kycBadge = (kyc: KycStatus) => {
  if (kyc === "VERIFIED") return { cls: "bg-emerald-50 text-emerald-600 border-emerald-200", Icon: CheckCircle2 };
  if (kyc === "PENDING") return { cls: "bg-amber-50 text-amber-600 border-amber-200", Icon: Clock };
  if (kyc === "REJECTED") return { cls: "bg-red-50 text-red-600 border-red-200", Icon: XCircle };
  return { cls: "bg-gray-100 text-gray-600 border-gray-200", Icon: Clock };
};

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("partners");
  const [query, setQuery] = useState("");
  const [partnerStatus, setPartnerStatus] = useState<KycStatus>("PENDING");
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [partnersTotal, setPartnersTotal] = useState(0);
  const [partnersErr, setPartnersErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Show the spinner while a fetch is in flight: while the request key
  // we last finished loading for doesn't match the current request key.
  const requestKey = `${tab}|${partnerStatus}|${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loadingPartners = tab === "partners" && loadedKey !== requestKey;

  useEffect(() => {
    if (tab !== "partners") return;
    const myKey = requestKey;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.listPartners({ status: partnerStatus, limit: 100 });
        if (cancelled) return;
        setPartners(data.items);
        setPartnersTotal(data.total);
        setPartnersErr(null);
      } catch (err) {
        if (cancelled) return;
        setPartnersErr(isApiError(err) ? err.displayMessage : "Failed to load partners.");
      } finally {
        if (!cancelled) setLoadedKey(myKey);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, partnerStatus, requestKey]);

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await adminApi.approvePartner(id);
      reload();
    } catch (err) {
      setPartnersErr(isApiError(err) ? err.displayMessage : "Approve failed.");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt("Reason for rejection (3-500 chars):");
    if (!reason || reason.trim().length < 3) return;
    setActingId(id);
    try {
      await adminApi.rejectPartner(id, reason.trim());
      reload();
    } catch (err) {
      setPartnersErr(isApiError(err) ? err.displayMessage : "Reject failed.");
    } finally {
      setActingId(null);
    }
  };

  const counts = {
    customers: customers.length,
    partners: partnersTotal,
    admins: admins.length,
  };

  const filteredPartners = partners.filter((p) =>
    [p.companyName, p.name, p.email, p.gstNumber]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(query.toLowerCase())),
  );

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Customers</p>
              <p className="text-xl font-bold text-gray-800">—</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Retail Partners ({kycLabel(partnerStatus)})</p>
              <p className="text-xl font-bold text-gray-800">{partnersTotal}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Admins</p>
              <p className="text-xl font-bold text-gray-800">—</p>
            </div>
          </div>
        </div>

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
            {tab === "partners" ? (
              <select
                value={partnerStatus}
                onChange={(e) => setPartnerStatus(e.target.value as KycStatus)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
              >
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="NONE">None</option>
              </select>
            ) : (
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white">
                <option>All status</option>
              </select>
            )}
          </div>

          {partnersErr && tab === "partners" && (
            <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {partnersErr}
            </div>
          )}

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
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
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
                    <th className="text-left font-semibold px-5 py-3">Contact</th>
                    <th className="text-left font-semibold px-5 py-3">KYC</th>
                    <th className="text-left font-semibold px-5 py-3">Submitted</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPartners && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                        <Loader2 className="inline animate-spin mr-2" size={16} /> Loading partners…
                      </td>
                    </tr>
                  )}
                  {!loadingPartners && filteredPartners.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                        No partners in {kycLabel(partnerStatus)} state.
                      </td>
                    </tr>
                  )}
                  {!loadingPartners && filteredPartners.map((p) => {
                    const k = kycBadge(p.kycStatus);
                    const KI = k.Icon;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-800">{p.companyName ?? "—"}</p>
                          <p className="text-xs text-gray-500">Owner: {p.name}</p>
                          {p.kycStatus === "REJECTED" && p.kycRejectedReason && (
                            <p className="text-[11px] text-red-500 mt-1 italic">Reason: {p.kycRejectedReason}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{p.gstNumber ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-gray-600">
                          <p>{p.email ?? "—"}</p>
                          <p className="text-gray-400">{p.phone ?? "—"}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${k.cls}`}>
                            <KI size={11} /> {kycLabel(p.kycStatus)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {p.kycStatus === "PENDING" && (
                              <>
                                <button
                                  onClick={() => handleApprove(p.id)}
                                  disabled={actingId === p.id}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {actingId === p.id ? "…" : "Approve"}
                                </button>
                                <button
                                  onClick={() => handleReject(p.id)}
                                  disabled={actingId === p.id}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                                >
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
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
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
