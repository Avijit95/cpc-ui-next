"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import {
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
  Ban,
  RotateCcw,
} from "lucide-react";
import { adminApi, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type {
  AdminPartner,
  AdminUserRow,
  KycStatus,
  Role,
  UserStatus,
} from "@/lib/api";

type Tab = "customers" | "partners" | "admins";

function formatPrice() {
  return ""; // placeholder; not used since customer orders/spent come from a different (not-yet-shipped) endpoint
}

void formatPrice;

function kycLabel(s: KycStatus): string {
  if (s === "VERIFIED") return "Approved";
  if (s === "PENDING") return "Pending";
  if (s === "REJECTED") return "Rejected";
  return "—";
}

const kycBadge = (kyc: KycStatus) => {
  if (kyc === "VERIFIED")
    return { cls: "bg-emerald-50 text-emerald-600 border-emerald-200", Icon: CheckCircle2 };
  if (kyc === "PENDING")
    return { cls: "bg-amber-50 text-amber-600 border-amber-200", Icon: Clock };
  if (kyc === "REJECTED")
    return { cls: "bg-red-50 text-red-600 border-red-200", Icon: XCircle };
  return { cls: "bg-gray-100 text-gray-600 border-gray-200", Icon: Clock };
};

const userStatusBadge = (s: UserStatus) =>
  s === "ACTIVE"
    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
    : s === "SUSPENDED"
    ? "bg-red-50 text-red-600 border-red-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("customers");
  const [query, setQuery] = useState("");

  // Live users — used by customers + admins tabs.
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [usersBusy, setUsersBusy] = useState<string | null>(null);

  // Partners tab (Sprint 1) — still uses the dedicated partners endpoint.
  const [partnerStatus, setPartnerStatus] = useState<KycStatus>("PENDING");
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [partnersTotal, setPartnersTotal] = useState(0);
  const [partnersErr, setPartnersErr] = useState<string | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Customers / admins fetch.
  useEffect(() => {
    if (tab === "partners") return;
    let cancelled = false;
    const role: Role = tab === "customers" ? "CUSTOMER" : "ADMIN";
    adminApi
      .listAdminUsers({
        role,
        q: query.trim() || undefined,
        limit: 50,
      })
      .then((resp) => {
        if (cancelled) return;
        setUsers(resp.rows);
        setUsersTotal(resp.total);
        setUsersErr(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsersErr(
            isApiError(err) ? err.displayMessage : "Could not load users",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, query, reloadKey]);

  // Partners tab.
  useEffect(() => {
    if (tab !== "partners") return;
    let cancelled = false;
    adminApi
      .listPartners({ status: partnerStatus, limit: 100 })
      .then((data) => {
        if (cancelled) return;
        setPartners(data.items);
        setPartnersTotal(data.total);
        setPartnersErr(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPartnersErr(
          isApiError(err) ? err.displayMessage : "Failed to load partners.",
        );
      })
      .finally(() => {
        if (!cancelled) setPartnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, partnerStatus, reloadKey]);

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

  const handleSuspend = async (target: AdminUserRow) => {
    if (target.id === me?.id) {
      setUsersErr("You can't suspend yourself.");
      return;
    }
    const next: "ACTIVE" | "SUSPENDED" =
      target.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setUsersBusy(target.id);
    try {
      await adminApi.patchUserStatus(target.id, { status: next });
      reload();
    } catch (err) {
      setUsersErr(
        isApiError(err) ? err.displayMessage : "Could not update status",
      );
    } finally {
      setUsersBusy(null);
    }
  };

  const handlePromoteAdmin = async (target: AdminUserRow) => {
    if (target.id === me?.id) {
      setUsersErr("You can't change your own role.");
      return;
    }
    if (
      !window.confirm(
        `Make ${target.name} an ADMIN? They'll have full access to /admin/* on their next request.`,
      )
    )
      return;
    setUsersBusy(target.id);
    try {
      await adminApi.patchUserRole(target.id, { role: "ADMIN" });
      reload();
    } catch (err) {
      setUsersErr(
        isApiError(err) ? err.displayMessage : "Could not promote user",
      );
    } finally {
      setUsersBusy(null);
    }
  };

  const handleDemoteToCustomer = async (target: AdminUserRow) => {
    if (target.id === me?.id) {
      setUsersErr("You can't change your own role.");
      return;
    }
    if (
      !window.confirm(`Demote ${target.name} from ADMIN back to CUSTOMER?`)
    )
      return;
    setUsersBusy(target.id);
    try {
      await adminApi.patchUserRole(target.id, { role: "CUSTOMER" });
      reload();
    } catch (err) {
      setUsersErr(
        isApiError(err) ? err.displayMessage : "Could not demote user",
      );
    } finally {
      setUsersBusy(null);
    }
  };

  const counts = {
    customers: tab === "customers" ? usersTotal : "—",
    partners: partnersTotal,
    admins: tab === "admins" ? usersTotal : "—",
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
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e8f7fc] text-[#129cd3] flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Customers</p>
              <p className="text-xl font-bold text-gray-800">{counts.customers}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">
                Retail Partners ({kycLabel(partnerStatus)})
              </p>
              <p className="text-xl font-bold text-gray-800">{partnersTotal}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Admins</p>
              <p className="text-xl font-bold text-gray-800">{counts.admins}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2">
            {(["customers", "partners", "admins"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === tab) return;
                  setTab(t);
                  setUsersLoading(t !== "partners");
                  setPartnersLoading(t === "partners");
                }}
                className={`px-5 py-3.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                  tab === t
                    ? "border-[#129cd3] text-[#129cd3]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t}
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
            {tab === "partners" && (
              <select
                value={partnerStatus}
                onChange={(e) => {
                  setPartnerStatus(e.target.value as KycStatus);
                  setPartnersLoading(true);
                }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none hover:border-[#129cd3] bg-white"
              >
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="NONE">None</option>
              </select>
            )}
          </div>

          {usersErr && tab !== "partners" && (
            <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {usersErr}
            </div>
          )}
          {partnersErr && tab === "partners" && (
            <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {partnersErr}
            </div>
          )}

          <div className="overflow-x-auto">
            {tab === "customers" && (
              <UsersTable
                rows={users}
                loading={usersLoading}
                busyId={usersBusy}
                onSuspend={handleSuspend}
                onPromote={handlePromoteAdmin}
                meId={me?.id ?? null}
              />
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
                  {partnersLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-sm text-gray-500"
                      >
                        <Loader2
                          className="inline animate-spin mr-2"
                          size={16}
                        />{" "}
                        Loading partners…
                      </td>
                    </tr>
                  )}
                  {!partnersLoading && filteredPartners.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-sm text-gray-500"
                      >
                        No partners in {kycLabel(partnerStatus)} state.
                      </td>
                    </tr>
                  )}
                  {!partnersLoading &&
                    filteredPartners.map((p) => {
                      const k = kycBadge(p.kycStatus);
                      const KI = k.Icon;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-gray-800">
                              {p.companyName ?? "—"}
                            </p>
                            <p className="text-xs text-gray-500">Owner: {p.name}</p>
                            {p.kycStatus === "REJECTED" &&
                              p.kycRejectedReason && (
                                <p className="text-[11px] text-red-500 mt-1 italic">
                                  Reason: {p.kycRejectedReason}
                                </p>
                              )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-600">
                            {p.gstNumber ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-600">
                            <p>{p.email ?? "—"}</p>
                            <p className="text-gray-400">{p.phone ?? "—"}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${k.cls}`}
                            >
                              <KI size={11} /> {kycLabel(p.kycStatus)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </td>
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
              <UsersTable
                rows={users}
                loading={usersLoading}
                busyId={usersBusy}
                onSuspend={handleSuspend}
                onDemote={handleDemoteToCustomer}
                meId={me?.id ?? null}
                showAdminBadge
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function UsersTable({
  rows,
  loading,
  busyId,
  onSuspend,
  onPromote,
  onDemote,
  meId,
  showAdminBadge,
}: {
  rows: AdminUserRow[];
  loading: boolean;
  busyId: string | null;
  onSuspend: (u: AdminUserRow) => Promise<void>;
  onPromote?: (u: AdminUserRow) => Promise<void>;
  onDemote?: (u: AdminUserRow) => Promise<void>;
  meId: string | null;
  showAdminBadge?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
        <tr>
          <th className="text-left font-semibold px-5 py-3">User</th>
          <th className="text-left font-semibold px-5 py-3">Contact</th>
          <th className="text-left font-semibold px-5 py-3">Joined</th>
          <th className="text-left font-semibold px-5 py-3">Last login</th>
          <th className="text-left font-semibold px-5 py-3">Status</th>
          <th className="px-5 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {loading && (
          <tr>
            <td
              colSpan={6}
              className="px-5 py-10 text-center text-sm text-gray-500"
            >
              <Loader2 className="inline animate-spin mr-2" size={16} /> Loading…
            </td>
          </tr>
        )}
        {!loading && rows.length === 0 && (
          <tr>
            <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
              No users match.
            </td>
          </tr>
        )}
        {!loading &&
          rows.map((u) => {
            const isMe = u.id === meId;
            const initials = (u.name || "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#e8f7fc] text-[#129cd3] font-bold text-xs flex items-center justify-center">
                      {initials || "?"}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {u.name}
                        {isMe && (
                          <span className="ml-2 text-[10px] font-semibold text-[#129cd3] bg-[#e8f7fc] border border-[#129cd3]/30 px-1.5 py-0.5 rounded-full">
                            you
                          </span>
                        )}
                        {showAdminBadge && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                            <Shield size={9} /> {u.role}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{u.email ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-gray-600">
                  <p>{u.email ?? "—"}</p>
                  <p className="text-gray-400">{u.phone ?? "—"}</p>
                </td>
                <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                  {formatDate(u.lastLoginAt)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${userStatusBadge(u.status)}`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    {!isMe && u.status !== "DELETED" && (
                      <>
                        {onPromote && u.role === "CUSTOMER" && (
                          <button
                            onClick={() => onPromote(u)}
                            disabled={busyId === u.id}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 disabled:opacity-50"
                          >
                            Make admin
                          </button>
                        )}
                        {onDemote && u.role === "ADMIN" && (
                          <button
                            onClick={() => onDemote(u)}
                            disabled={busyId === u.id}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded bg-gray-50 text-gray-600 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                          >
                            Demote
                          </button>
                        )}
                        <button
                          onClick={() => onSuspend(u)}
                          disabled={busyId === u.id}
                          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded border disabled:opacity-50 ${
                            u.status === "SUSPENDED"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                          }`}
                        >
                          {busyId === u.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : u.status === "SUSPENDED" ? (
                            <RotateCcw size={11} />
                          ) : (
                            <Ban size={11} />
                          )}
                          {u.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}
