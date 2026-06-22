"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import DateRangeFilter, {
  type DateRange,
} from "@/components/admin/list/DateRangeFilter";
import ExportCsvButton from "@/components/admin/list/ExportCsvButton";
import SortByDropdown, {
  type SortOption,
} from "@/components/admin/list/SortByDropdown";
import type { SortState } from "@/components/admin/list/SortableHeader";
import { adminApi, isApiError, ticketsApi } from "@/lib/api";
import { formatTimestamp, formatUpdated } from "@/lib/format-date";
import { useUrlState } from "@/lib/use-url-state";

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
  { label: "Subject (A → Z)", sortBy: "subject", sortOrder: "asc" },
  { label: "Status", sortBy: "status", sortOrder: "asc" },
];
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_MAX_COUNT,
  TICKET_ATTACHMENT_TYPES,
} from "@/lib/api/endpoints/tickets";
import type {
  AdminUserRow,
  Ticket,
  TicketDetail,
  TicketStatus,
} from "@/lib/api";
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
  X,
} from "lucide-react";

type PendingAttachment = { key: string; name: string };

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

export default function AdminSupportPage() {
  const [url, setUrl] = useUrlState({
    status: "ALL" as TicketStatus | "ALL",
    q: "",
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const statusFilter = url.status;
  const searchQuery = url.q;
  const sort: SortState = useMemo(
    () => ({ field: url.sortBy, order: url.sortOrder }),
    [url.sortBy, url.sortOrder],
  );
  const dateRange: DateRange = useMemo(
    () => ({
      createdFrom: url.createdFrom || undefined,
      createdTo: url.createdTo || undefined,
      updatedFrom: url.updatedFrom || undefined,
      updatedTo: url.updatedTo || undefined,
    }),
    [url.createdFrom, url.createdTo, url.updatedFrom, url.updatedTo],
  );
  const setStatusFilter = useCallback(
    (next: TicketStatus | "ALL") => setUrl({ status: next }),
    [setUrl],
  );
  const setSort = useCallback(
    (s: SortState) => setUrl({ sortBy: s.field, sortOrder: s.order }),
    [setUrl],
  );
  const setDateRange = useCallback(
    (r: DateRange) =>
      setUrl({
        createdFrom: r.createdFrom ?? "",
        createdTo: r.createdTo ?? "",
        updatedFrom: r.updatedFrom ?? "",
        updatedTo: r.updatedTo ?? "",
      }),
    [setUrl],
  );
  const [searchInput, setSearchInput] = useState(url.q);
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>(
    [],
  );
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  // Cached admin list — used to populate the assignee picker. Loaded once
  // on page mount (small N, refresh on hard reload is fine).
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [assigneeBusy, setAssigneeBusy] = useState(false);

  // Load admin list once on mount for the assignee picker.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listAdminUsers({ role: "ADMIN", limit: 100 })
      .then((resp) => {
        if (!cancelled) setAdminUsers(resp.rows);
      })
      .catch(() => {
        if (!cancelled) setAdminUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce search input (250ms) → URL.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchQuery) return;
    const t = window.setTimeout(() => {
      setUrl({ q: trimmed });
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput, searchQuery, setUrl]);

  // Initial + filter-change list fetch.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listTickets({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        q: searchQuery || undefined,
        sortBy: sort.field,
        sortOrder: sort.order,
        createdFrom: dateRange.createdFrom,
        createdTo: dateRange.createdTo,
        updatedFrom: dateRange.updatedFrom,
        updatedTo: dateRange.updatedTo,
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
  }, [statusFilter, searchQuery, sort, dateRange]);

  const exportQuery = useMemo(
    () => ({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      q: searchQuery || undefined,
      sortBy: sort.field,
      sortOrder: sort.order,
      createdFrom: dateRange.createdFrom,
      createdTo: dateRange.createdTo,
      updatedFrom: dateRange.updatedFrom,
      updatedTo: dateRange.updatedTo,
    }),
    [statusFilter, searchQuery, sort, dateRange],
  );

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
    setPendingAttachments([]);
  };

  const handleAttachSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;
      if (pendingAttachments.length >= TICKET_ATTACHMENT_MAX_COUNT) {
        setReplyError(
          `Attach up to ${TICKET_ATTACHMENT_MAX_COUNT} files per message.`,
        );
        return;
      }
      if (!TICKET_ATTACHMENT_TYPES.includes(file.type as never)) {
        setReplyError("Attachment must be a JPG, PNG, WebP, or PDF.");
        return;
      }
      if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
        setReplyError("Attachment must be 5 MB or smaller.");
        return;
      }
      setAttachBusy(true);
      setReplyError(null);
      try {
        const { objectKey } = await ticketsApi.uploadAttachment(file);
        setPendingAttachments((prev) => [
          ...prev,
          { key: objectKey, name: file.name },
        ]);
      } catch (err) {
        setReplyError(
          isApiError(err) ? err.displayMessage : "Attachment upload failed",
        );
      } finally {
        setAttachBusy(false);
      }
    },
    [pendingAttachments.length],
  );

  const handleAttachRemove = (key: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.key !== key));
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

  const handleAssigneeChange = useCallback(
    async (next: string | null) => {
      if (!detail || (detail.assigneeId ?? null) === next) return;
      setAssigneeBusy(true);
      try {
        await adminApi.updateTicket(detail.id, { assigneeId: next });
        await refreshDetail();
      } catch (err) {
        setDetailError(
          isApiError(err) ? err.displayMessage : "Could not update assignee",
        );
      } finally {
        setAssigneeBusy(false);
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
        attachments: pendingAttachments.length
          ? pendingAttachments.map((a) => a.key)
          : undefined,
      });
      setReplyBody("");
      setReplyIsInternal(false);
      setPendingAttachments([]);
      await refreshDetail();
    } catch (err) {
      setReplyError(
        isApiError(err) ? err.displayMessage : "Could not send reply",
      );
    } finally {
      setReplyBusy(false);
    }
  }, [detail, replyBody, replyIsInternal, pendingAttachments, refreshDetail]);

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
        actions={
          <ExportCsvButton
            path="/admin/tickets/export.csv"
            query={exportQuery}
            filename="support-tickets"
          />
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as TicketStatus | "ALL")
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#129cd3] bg-white text-gray-700"
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <DateRangeFilter value={dateRange} onApply={setDateRange} />
              </div>
              <SortByDropdown
                options={SORT_OPTIONS}
                currentSort={sort}
                onSort={setSort}
              />
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
                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                          <span>Added {formatTimestamp(t.createdAt)}</span>
                          <span>
                            {formatUpdated(t.createdAt, t.updatedAt) === "—"
                              ? ""
                              : `Upd ${formatUpdated(t.createdAt, t.updatedAt)}`}
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
                      {formatTimestamp(detail.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 items-stretch w-full sm:w-auto sm:min-w-[150px]">
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
                    <AssigneePicker
                      ticketAssigneeId={detail.assigneeId}
                      ticketAssigneeName={detail.assignee?.name ?? null}
                      admins={adminUsers}
                      busy={assigneeBusy}
                      onChange={handleAssigneeChange}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[500px] bg-gray-50">
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
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pendingAttachments.map((a) => (
                        <span
                          key={a.key}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-gray-100 text-gray-700"
                        >
                          <Paperclip size={11} />
                          {a.name.length > 32
                            ? `${a.name.slice(0, 29)}…`
                            : a.name}
                          <button
                            type="button"
                            onClick={() => handleAttachRemove(a.key)}
                            className="text-gray-500 hover:text-red-500"
                            aria-label="Remove attachment"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={
                        attachBusy ||
                        pendingAttachments.length >= TICKET_ATTACHMENT_MAX_COUNT
                      }
                      title="Attach a file (JPG/PNG/WebP/PDF, max 5 MB)"
                      className="w-10 h-10 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:text-[#129cd3] hover:border-[#129cd3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {attachBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Paperclip size={14} />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={handleAttachSelect}
                    />
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
                      className="bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold w-full sm:w-auto"
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
        className={`rounded-2xl p-3.5 shadow-sm ${
          isInternal
            ? "bg-amber-50 border border-amber-200 text-amber-900"
            : role === "agent"
            ? "bg-[#129cd3] text-white rounded-br-md"
            : "bg-white border border-gray-200 text-gray-700 rounded-bl-md"
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
        · {formatTimestamp(createdAt)}
      </p>
    </div>
  );
}

function attachmentLabel(key: string | undefined, i: number): string {
  if (!key) return `Attachment ${i + 1}`;
  const base = key.split("/").pop() ?? key;
  return base.length > 32 ? `${base.slice(0, 29)}…` : base;
}

function AssigneePicker({
  ticketAssigneeId,
  ticketAssigneeName,
  admins,
  busy,
  onChange,
}: {
  ticketAssigneeId: string | null;
  ticketAssigneeName: string | null;
  admins: AdminUserRow[];
  busy: boolean;
  onChange: (next: string | null) => void;
}) {
  // If the current assignee isn't in the loaded admins list (e.g., they
  // were demoted from ADMIN), surface them as a disabled extra option so
  // the dropdown reflects actual state.
  const inList = ticketAssigneeId
    ? admins.some((a) => a.id === ticketAssigneeId)
    : true;
  return (
    <select
      value={ticketAssigneeId ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={busy || admins.length === 0}
      title="Assignee"
      className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#129cd3] bg-white text-gray-700 disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {admins.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {ticketAssigneeId && !inList && (
        <option value={ticketAssigneeId} disabled>
          {ticketAssigneeName ?? "Former admin"} (not admin)
        </option>
      )}
    </select>
  );
}
