"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminApi, isApiError } from "@/lib/api";
import type { Ticket, TicketDetail, TicketStatus } from "@/lib/api";
import {
  LifeBuoy,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  StickyNote,
  Search,
  Paperclip,
} from "lucide-react";

const STATUS_FILTERS: { value: TicketStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-red-50 text-red-600 border-red-200",
  IN_PROGRESS: "bg-amber-50 text-amber-600 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [replyIsInternal, setReplyIsInternal] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  // Debounce search input (250ms).
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Initial + filter-change list fetch.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listTickets({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        q: searchQuery || undefined,
        limit: 100,
      })
      .then((resp) => {
        if (cancelled) return;
        setTickets(resp.rows);
        setTotal(resp.total);
        setListError(null);
        // Auto-select first ticket when list refreshes.
        if (resp.rows.length > 0) {
          setSelectedId((prev) => prev ?? resp.rows[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setListError(
            isApiError(err) ? err.displayMessage : "Could not load tickets",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, searchQuery]);

  // Detail fetch when selection changes. We do NOT synchronously clear
  // `detail` to null here — that would trip React 19's set-state-in-effect
  // lint. Instead the fetched detail overwrites in place, and the rendered
  // view keys off `loadingDetail` to mask stale content during a switch.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    adminApi
      .getTicket(selectedId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setDetailError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(
            isApiError(err) ? err.displayMessage : "Could not load ticket",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const d = await adminApi.getTicket(selectedId);
      setDetail(d);
      // Also patch the list row so status/messageCount stay in sync without
      // a full list re-fetch.
      setTickets((prev) =>
        prev.map((t) =>
          t.id === d.id
            ? {
                ...t,
                status: d.status,
                assigneeId: d.assigneeId,
                messageCount: d.messageCount,
                lastMessageAt: d.lastMessageAt,
                updatedAt: d.updatedAt,
              }
            : t,
        ),
      );
    } catch {
      // Quiet.
    }
  }, [selectedId]);

  const onSelectTicket = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setLoadingDetail(true);
    setReplyBody("");
    setReplyIsInternal(false);
    setReplyError(null);
  };

  const handleStatusChange = useCallback(
    async (next: TicketStatus) => {
      if (!detail || detail.status === next) return;
      setStatusBusy(true);
      try {
        await adminApi.updateTicket(detail.id, { status: next });
        await refreshDetail();
      } catch (err) {
        setDetailError(
          isApiError(err) ? err.displayMessage : "Could not update status",
        );
      } finally {
        setStatusBusy(false);
      }
    },
    [detail, refreshDetail],
  );

  const handleReply = useCallback(async () => {
    if (!detail || !replyBody.trim()) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      await adminApi.postTicketMessage(detail.id, {
        body: replyBody.trim(),
        isInternalNote: replyIsInternal || undefined,
      });
      setReplyBody("");
      setReplyIsInternal(false);
      await refreshDetail();
    } catch (err) {
      setReplyError(
        isApiError(err) ? err.displayMessage : "Could not send reply",
      );
    } finally {
      setReplyBusy(false);
    }
  }, [detail, replyBody, replyIsInternal, refreshDetail]);

  const statusCounts = STATUS_FILTERS.slice(1).reduce<Record<string, number>>(
    (acc, f) => {
      acc[f.value] = tickets.filter((t) => t.status === f.value).length;
      return acc;
    },
    {},
  );

  return (
    <>
      <AdminHeader
        title="Support"
        subtitle="Live support tickets — reply, change status, add internal notes"
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Open"
            value={statusCounts.OPEN ?? 0}
            icon={AlertCircle}
            tint="bg-red-100 text-red-600"
            active={statusFilter === "OPEN"}
            onClick={() => setStatusFilter("OPEN")}
          />
          <SummaryCard
            label="In progress"
            value={statusCounts.IN_PROGRESS ?? 0}
            icon={Clock}
            tint="bg-amber-100 text-amber-600"
            active={statusFilter === "IN_PROGRESS"}
            onClick={() => setStatusFilter("IN_PROGRESS")}
          />
          <SummaryCard
            label="Resolved"
            value={statusCounts.RESOLVED ?? 0}
            icon={CheckCircle2}
            tint="bg-emerald-100 text-emerald-600"
            active={statusFilter === "RESOLVED"}
            onClick={() => setStatusFilter("RESOLVED")}
          />
          <SummaryCard
            label="All tickets"
            value={total}
            icon={LifeBuoy}
            tint="bg-[#e8f7fc] text-[#129cd3]"
            active={statusFilter === "ALL"}
            onClick={() => setStatusFilter("ALL")}
          />
        </div>

        {listError && (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
            {listError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          {/* List */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by subject"
                  className="bg-transparent outline-none text-sm text-gray-700 flex-1"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TicketStatus | "ALL")
                }
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {loadingList ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-gray-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">
                No tickets match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[640px]">
                {tickets.map((t) => {
                  const active = selectedId === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => onSelectTicket(t.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          active ? "bg-[#e8f7fc]" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] text-[#129cd3] font-semibold truncate">
                            {t.id.slice(0, 8)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[t.status]}`}
                          >
                            {STATUS_LABEL[t.status]}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800 line-clamp-1">
                          {t.subject}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-500 truncate">
                            {t.user?.name ?? "—"}
                          </span>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap ml-2">
                            {t.messageCount} msg
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail + thread */}
          <div className="bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
            {!selectedId ? (
              <div className="p-10 text-center text-sm text-gray-500">
                Select a ticket from the list.
              </div>
            ) : loadingDetail ? (
              <div className="p-10 flex items-center justify-center text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading ticket…
              </div>
            ) : detailError ? (
              <div className="m-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {detailError}
              </div>
            ) : !detail ? null : (
              <>
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[11px] text-[#129cd3] font-semibold">
                        {detail.id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[detail.status]}`}
                      >
                        {STATUS_LABEL[detail.status]}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">
                      {detail.subject}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {detail.user?.name ?? "—"} · opened{" "}
                      {formatDateTime(detail.createdAt)}
                    </p>
                  </div>
                  <select
                    value={detail.status}
                    onChange={(e) =>
                      handleStatusChange(e.target.value as TicketStatus)
                    }
                    disabled={statusBusy}
                    className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#129cd3] bg-white text-gray-700 disabled:opacity-50"
                  >
                    {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as TicketStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[500px] bg-gray-50/40">
                  {/* Initial body as the first message */}
                  <ThreadMessage
                    body={detail.body}
                    authorName={detail.user?.name ?? "Customer"}
                    isInternal={false}
                    role="customer"
                    createdAt={detail.createdAt}
                    attachments={detail.attachments}
                    attachmentUrls={detail.attachmentUrls}
                  />
                  {detail.messages.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs">
                      No replies yet.
                    </p>
                  ) : (
                    detail.messages.map((m) => (
                      <ThreadMessage
                        key={m.id}
                        body={m.body}
                        authorName={m.author?.name ?? "—"}
                        authorRole={m.author?.role}
                        isInternal={m.isInternalNote}
                        role={m.author?.role === "CUSTOMER" ? "customer" : "agent"}
                        createdAt={m.createdAt}
                        attachments={m.attachments}
                        attachmentUrls={m.attachmentUrls}
                      />
                    ))
                  )}
                </div>

                <div className="border-t border-gray-100 p-4 space-y-2">
                  {replyError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {replyError}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      placeholder={
                        replyIsInternal
                          ? "Internal note (not visible to customer)…"
                          : "Type a reply…"
                      }
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      className={`flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-none ${
                        replyIsInternal
                          ? "border-amber-300 bg-amber-50/40"
                          : "border-gray-200"
                      }`}
                    />
                    <button
                      onClick={handleReply}
                      disabled={replyBusy || !replyBody.trim()}
                      className="bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold"
                    >
                      {replyBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}{" "}
                      {replyIsInternal ? "Add note" : "Reply"}
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replyIsInternal}
                      onChange={(e) => setReplyIsInternal(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    <StickyNote size={12} className="text-amber-500" />
                    Internal note (not visible to customer)
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof LifeBuoy;
  tint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white border rounded-xl p-4 text-left transition-colors ${
        active ? "border-[#129cd3]" : "border-gray-200 hover:border-[#129cd3]"
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tint}`}>
        <Icon size={16} />
      </div>
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className="text-xl font-bold text-gray-800 mt-0.5">{value.toLocaleString()}</p>
    </button>
  );
}

function ThreadMessage({
  body,
  authorName,
  authorRole,
  isInternal,
  role,
  createdAt,
  attachments,
  attachmentUrls,
}: {
  body: string;
  authorName: string;
  authorRole?: string;
  isInternal: boolean;
  role: "customer" | "agent";
  createdAt: string;
  attachments?: string[];
  attachmentUrls?: string[];
}) {
  const onDark = role === "agent" && !isInternal;
  return (
    <div className={`max-w-[75%] ${role === "agent" ? "ml-auto" : "mr-auto"}`}>
      {isInternal && (
        <p className="text-[10px] font-bold uppercase text-amber-600 mb-1 flex items-center gap-1 px-1">
          <StickyNote size={10} /> Internal note
        </p>
      )}
      <div
        className={`rounded-xl p-3.5 ${
          isInternal
            ? "bg-amber-50 border border-amber-200 text-amber-900"
            : role === "agent"
            ? "bg-[#129cd3] text-white"
            : "bg-white border border-gray-200 text-gray-700"
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        {attachmentUrls && attachmentUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachmentUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded ${
                  onDark
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Paperclip size={11} />
                {attachmentLabel(attachments?.[i], i)}
              </a>
            ))}
          </div>
        )}
      </div>
      <p
        className={`text-[10px] text-gray-400 mt-1 px-1 ${role === "agent" ? "text-right" : ""}`}
      >
        {authorName}
        {authorRole && authorRole !== "CUSTOMER"
          ? ` (${authorRole.toLowerCase()})`
          : ""}{" "}
        · {formatDateTime(createdAt)}
      </p>
    </div>
  );
}

function attachmentLabel(key: string | undefined, i: number): string {
  if (!key) return `Attachment ${i + 1}`;
  const base = key.split("/").pop() ?? key;
  return base.length > 32 ? `${base.slice(0, 29)}…` : base;
}
