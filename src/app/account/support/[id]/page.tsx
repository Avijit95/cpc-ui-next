"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isApiError, ticketsApi } from "@/lib/api";
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_MAX_COUNT,
  TICKET_ATTACHMENT_TYPES,
} from "@/lib/api/endpoints/tickets";
import type { TicketDetail, TicketStatus } from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";

type PendingAttachment = { key: string; name: string };

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
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CustomerTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, status } = useAuth();
  const id = params.id;

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>(
    [],
  );
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?next=/account/support/${encodeURIComponent(id)}`,
      );
    }
  }, [status, id, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    ticketsApi
      .get(id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load ticket",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, id]);

  const refresh = useCallback(async () => {
    try {
      const d = await ticketsApi.get(id);
      setDetail(d);
    } catch {
      // Best-effort.
    }
  }, [id]);

  const handleAttachSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;
      if (pendingAttachments.length >= TICKET_ATTACHMENT_MAX_COUNT) {
        setReplyError(
          `You can attach up to ${TICKET_ATTACHMENT_MAX_COUNT} files per message.`,
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

  const handleReply = useCallback(async () => {
    if (!detail || !replyBody.trim()) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      await ticketsApi.postMessage(detail.id, {
        body: replyBody.trim(),
        attachments: pendingAttachments.length
          ? pendingAttachments.map((a) => a.key)
          : undefined,
      });
      setReplyBody("");
      setPendingAttachments([]);
      await refresh();
    } catch (err) {
      setReplyError(
        isApiError(err) ? err.displayMessage : "Could not send reply",
      );
    } finally {
      setReplyBusy(false);
    }
  }, [detail, replyBody, pendingAttachments, refresh]);

  const userName = user?.name ?? "You";
  const replyDisabled =
    !detail || detail.status === "CLOSED" || detail.status === "RESOLVED";

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-[#129cd3]">Home</Link>
            <ChevronRight size={12} />
            <Link href="/account" className="hover:text-[#129cd3]">My Account</Link>
            <ChevronRight size={12} />
            <Link href="/account/support" className="hover:text-[#129cd3]">Support</Link>
            <ChevronRight size={12} />
            <span className="text-gray-800 font-medium">Ticket</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
          <Link
            href="/account/support"
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#129cd3] transition-colors"
          >
            <ChevronLeft size={13} /> Back to all tickets
          </Link>

          {loading ? (
            <div className="space-y-4">
              <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
              <div className="h-64 bg-white rounded-xl border border-gray-200 animate-pulse" />
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
              {error}
            </div>
          ) : !detail ? null : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h1 className="text-lg font-bold text-gray-800">
                    {detail.subject}
                  </h1>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLE[detail.status]}`}
                  >
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Opened {formatDateTime(detail.createdAt)} ·{" "}
                  {detail.messageCount} repl{detail.messageCount === 1 ? "y" : "ies"}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-5 space-y-4 bg-gray-50/40 max-h-[560px] overflow-y-auto">
                  {/* Initial body as the first message */}
                  <ThreadMessage
                    body={detail.body}
                    authorName={userName}
                    isMine
                    createdAt={detail.createdAt}
                    attachments={detail.attachments}
                    attachmentUrls={detail.attachmentUrls}
                  />
                  {detail.messages.map((m) => (
                    <ThreadMessage
                      key={m.id}
                      body={m.body}
                      authorName={m.author?.name ?? "Support"}
                      isMine={m.author?.id === user?.id}
                      createdAt={m.createdAt}
                      attachments={m.attachments}
                      attachmentUrls={m.attachmentUrls}
                    />
                  ))}
                </div>

                <div className="border-t border-gray-100 p-4 space-y-2">
                  {replyError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {replyError}
                    </div>
                  )}
                  {replyDisabled ? (
                    <p className="text-xs text-gray-500 text-center py-2">
                      This ticket is {STATUS_LABEL[detail.status].toLowerCase()}. Open a
                      new ticket if you need further help.
                    </p>
                  ) : (
                    <div className="space-y-2">
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
                      <div className="flex items-end gap-2">
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
                          placeholder="Type a reply…"
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] resize-none"
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
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function ThreadMessage({
  body,
  authorName,
  isMine,
  createdAt,
  attachments,
  attachmentUrls,
}: {
  body: string;
  authorName: string;
  isMine: boolean;
  createdAt: string;
  attachments?: string[];
  attachmentUrls?: string[];
}) {
  return (
    <div className={`max-w-[80%] ${isMine ? "ml-auto" : "mr-auto"}`}>
      <div
        className={`rounded-xl p-3.5 ${
          isMine
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
                  isMine
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
        className={`text-[10px] text-gray-400 mt-1 px-1 ${isMine ? "text-right" : ""}`}
      >
        {authorName} · {formatDateTime(createdAt)}
      </p>
    </div>
  );
}

function attachmentLabel(key: string | undefined, i: number): string {
  if (!key) return `Attachment ${i + 1}`;
  const base = key.split("/").pop() ?? key;
  return base.length > 32 ? `${base.slice(0, 29)}…` : base;
}
