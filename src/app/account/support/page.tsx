"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isApiError, ticketsApi } from "@/lib/api";
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_MAX_COUNT,
  TICKET_ATTACHMENT_TYPES,
} from "@/lib/api/endpoints/tickets";
import type { Ticket, TicketStatus } from "@/lib/api";
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  MapPin,
  User,
  Headphones,
  LogOut,
  ChevronRight,
  Plus,
  Loader2,
  X,
  MessageCircle,
  Paperclip,
} from "lucide-react";

type PendingAttachment = { key: string; name: string };

const sidebarItems = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, href: "/account" },
  { key: "orders", label: "Orders", icon: <ShoppingBag size={18} />, href: "/account/orders" },
  { key: "wishlist", label: "Wishlist", icon: <Heart size={18} />, href: "/wishlist" },
  { key: "addresses", label: "Addresses", icon: <MapPin size={18} />, href: "/account/addresses" },
  { key: "profile", label: "Profile", icon: <User size={18} />, href: "/account/profile" },
  { key: "support", label: "Support", icon: <Headphones size={18} />, href: "/account/support" },
  { key: "logout", label: "Logout", icon: <LogOut size={18} />, href: "/login" },
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
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CustomerSupportPage() {
  const router = useRouter();
  const { user, status } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newAttachments, setNewAttachments] = useState<PendingAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/account/support");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    ticketsApi
      .list({ limit: 100 })
      .then((resp) => {
        if (!cancelled) setTickets(resp.rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.displayMessage : "Could not load tickets",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleAttachSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;
      if (newAttachments.length >= TICKET_ATTACHMENT_MAX_COUNT) {
        setCreateError(
          `You can attach up to ${TICKET_ATTACHMENT_MAX_COUNT} files.`,
        );
        return;
      }
      if (!TICKET_ATTACHMENT_TYPES.includes(file.type as never)) {
        setCreateError("Attachment must be a JPG, PNG, WebP, or PDF.");
        return;
      }
      if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
        setCreateError("Attachment must be 5 MB or smaller.");
        return;
      }
      setAttachBusy(true);
      setCreateError(null);
      try {
        const { objectKey } = await ticketsApi.uploadAttachment(file);
        setNewAttachments((prev) => [
          ...prev,
          { key: objectKey, name: file.name },
        ]);
      } catch (err) {
        setCreateError(
          isApiError(err) ? err.displayMessage : "Attachment upload failed",
        );
      } finally {
        setAttachBusy(false);
      }
    },
    [newAttachments.length],
  );

  const handleAttachRemove = (key: string) => {
    setNewAttachments((prev) => prev.filter((a) => a.key !== key));
  };

  const handleCreate = useCallback(async () => {
    if (!newSubject.trim()) {
      setCreateError("Subject is required.");
      return;
    }
    if (!newBody.trim()) {
      setCreateError("Please describe your issue.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const t = await ticketsApi.create({
        subject: newSubject.trim(),
        body: newBody.trim(),
        attachments: newAttachments.length
          ? newAttachments.map((a) => a.key)
          : undefined,
      });
      setShowNew(false);
      setNewSubject("");
      setNewBody("");
      setNewAttachments([]);
      router.push(`/account/support/${encodeURIComponent(t.id)}`);
    } catch (err) {
      setCreateError(
        isApiError(err) ? err.displayMessage : "Could not create ticket",
      );
    } finally {
      setCreateBusy(false);
    }
  }, [newSubject, newBody, newAttachments, router]);

  const userName = user?.name ?? "Account";
  const userContact = user?.email ?? user?.phone ?? "";
  const userInitial = (user?.name?.[0] ?? "A").toUpperCase();

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
            <span className="text-gray-800 font-medium">Support</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#129cd3] px-5 py-5 text-white">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2">
                  <span className="text-[#129cd3] font-bold text-lg">{userInitial}</span>
                </div>
                <p className="font-semibold">{userName}</p>
                <p className="text-[#b8e8f5] text-xs">{userContact}</p>
              </div>
              <nav className="py-2">
                {sidebarItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      item.key === "support"
                        ? "bg-[#e8f7fc] text-[#129cd3] border-r-4 border-[#129cd3]"
                        : item.key === "logout"
                        ? "text-red-500 hover:bg-red-50"
                        : "text-gray-600 hover:bg-gray-50 hover:text-[#129cd3]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-lg font-bold text-gray-800">Support Tickets</h1>
              <button
                onClick={() => {
                  setShowNew(true);
                  setCreateError(null);
                  setNewSubject("");
                  setNewBody("");
                  setNewAttachments([]);
                }}
                className="flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus size={16} /> New Ticket
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-600">
                {error}
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <MessageCircle size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  No support tickets yet
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Have a question or an issue? Open a ticket and our team will
                  follow up.
                </p>
                <button
                  onClick={() => setShowNew(true)}
                  className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Open a Ticket
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/account/support/${encodeURIComponent(t.id)}`}
                      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-[#129cd3] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-bold text-gray-800 line-clamp-1">
                          {t.subject}
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[t.status]}`}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                        {t.body}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>
                          {t.messageCount} repl{t.messageCount === 1 ? "y" : "ies"}
                        </span>
                        <span>Opened {formatDateTime(t.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />

      {/* New ticket modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !createBusy && setShowNew(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">New Ticket</h2>
              <button
                onClick={() => !createBusy && setShowNew(false)}
                disabled={createBusy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Brief summary of your issue"
                  maxLength={140}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Describe your issue
                </label>
                <textarea
                  rows={6}
                  maxLength={5000}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Tell us what happened, the order number if applicable, and what you've tried…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#129cd3] focus:ring-1 focus:ring-[#129cd3] text-gray-800 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Attachments{" "}
                  <span className="font-normal text-gray-400">
                    (up to {TICKET_ATTACHMENT_MAX_COUNT}, optional)
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {newAttachments.map((a) => (
                    <span
                      key={a.key}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-gray-100 text-gray-700"
                    >
                      <Paperclip size={11} />
                      {a.name.length > 28 ? `${a.name.slice(0, 25)}…` : a.name}
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
                  {newAttachments.length < TICKET_ATTACHMENT_MAX_COUNT && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={attachBusy}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-dashed border-gray-300 text-gray-600 hover:text-[#129cd3] hover:border-[#129cd3] transition-colors disabled:opacity-50"
                    >
                      {attachBusy ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Paperclip size={11} />
                      )}
                      Add file
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleAttachSelect}
                  />
                </div>
              </div>
            </div>

            {createError && (
              <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {createError}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCreate}
                disabled={createBusy}
                className="flex-1 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {createBusy && <Loader2 size={16} className="animate-spin" />}
                Submit Ticket
              </button>
              <button
                onClick={() => setShowNew(false)}
                disabled={createBusy}
                className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
