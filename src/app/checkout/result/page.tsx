"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { paymentsApi } from "@/lib/api";
import { useStock } from "@/lib/stock/StockProvider";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

// How many times to poll status before giving up to a "still processing" state.
const MAX_POLLS = 8;
const POLL_INTERVAL_MS = 2000;

type View = "verifying" | "success" | "failed" | "pending";

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <PaymentResultInner />
    </Suspense>
  );
}

function PaymentResultInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { status: authStatus } = useAuth();

  const [view, setView] = useState<View>("verifying");
  const [retrying, setRetrying] = useState(false);
  const pollsRef = useRef(0);
  const { adjustStock } = useStock();

  // Auth gate — the status endpoint requires the buyer's session.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      const back = orderId
        ? `/checkout/result?orderId=${encodeURIComponent(orderId)}`
        : "/account/orders";
      router.replace(`/login?next=${encodeURIComponent(back)}`);
    }
  }, [authStatus, orderId, router]);

  // Poll server-verified payment status until it resolves.
  useEffect(() => {
    if (authStatus !== "authenticated" || !orderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const { status } = await paymentsApi.status(orderId);
        if (cancelled) return;
        if (status === "SUCCESS") {
          setView("success");
          // Reduce client-side stock store for each ordered item so product
          // pages reflect the purchase across the session.
          try {
            const raw = sessionStorage.getItem(`cpc_order_${orderId}`);
            if (raw) {
              const items: { variantId: string | null; slug: string; qty: number }[] =
                JSON.parse(raw);
              for (const item of items) {
                const key = item.variantId ? `v:${item.variantId}` : `p:${item.slug}`;
                adjustStock(key, -item.qty);
              }
              sessionStorage.removeItem(`cpc_order_${orderId}`);
            }
          } catch { /* sessionStorage or JSON issue — skip */ }
          // Brief confirmation, then land on the order detail page.
          timer = setTimeout(() => {
            router.replace(`/account/orders/${encodeURIComponent(orderId)}`);
          }, 1500);
          return;
        }
        if (status === "FAILED") {
          setView("failed");
          return;
        }
        // Still PENDING — keep polling up to the cap.
        pollsRef.current += 1;
        if (pollsRef.current >= MAX_POLLS) {
          setView("pending");
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        pollsRef.current += 1;
        if (pollsRef.current >= MAX_POLLS) {
          setView("pending");
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authStatus, orderId, router]);

  const handleRetry = useCallback(async () => {
    if (!orderId) return;
    setRetrying(true);
    try {
      const { redirectUrl } = await paymentsApi.initiate(orderId);
      window.location.href = redirectUrl;
    } catch {
      setRetrying(false);
      router.replace(`/account/orders/${encodeURIComponent(orderId)}`);
    }
  }, [orderId, router]);

  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-md p-8 text-center">
          {!orderId ? (
            <>
              <XCircle size={40} className="mx-auto text-red-500 mb-3" />
              <h1 className="text-lg font-bold text-gray-800 mb-1">
                Something went wrong
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                We couldn&apos;t find your order reference.
              </p>
              <Link
                href="/account/orders"
                className="inline-flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                View my orders
              </Link>
            </>
          ) : view === "verifying" || view === "success" ? (
            <>
              {view === "verifying" ? (
                <Loader2
                  size={40}
                  className="mx-auto text-[#129cd3] mb-3 animate-spin"
                />
              ) : (
                <CheckCircle size={40} className="mx-auto text-green-600 mb-3" />
              )}
              <h1 className="text-lg font-bold text-gray-800 mb-1">
                {view === "verifying"
                  ? "Verifying your payment…"
                  : "Payment successful"}
              </h1>
              <p className="text-sm text-gray-500">
                {view === "verifying"
                  ? "Please wait while we confirm your payment. Do not close this window."
                  : "Redirecting you to your order…"}
              </p>
            </>
          ) : view === "failed" ? (
            <>
              <XCircle size={40} className="mx-auto text-red-500 mb-3" />
              <h1 className="text-lg font-bold text-gray-800 mb-1">
                Payment not completed
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                Your payment didn&apos;t go through. You can try again or view
                your order.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="inline-flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] disabled:opacity-60 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors"
                >
                  {retrying && <Loader2 size={16} className="animate-spin" />}
                  Try payment again
                </button>
                <Link
                  href={`/account/orders/${encodeURIComponent(orderId)}`}
                  className="text-xs text-gray-600 hover:text-[#129cd3] transition-colors py-1"
                >
                  View order
                </Link>
              </div>
            </>
          ) : (
            <>
              <Loader2 size={40} className="mx-auto text-[#129cd3] mb-3" />
              <h1 className="text-lg font-bold text-gray-800 mb-1">
                Still processing
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                Your payment is taking longer than usual to confirm. We&apos;ll
                update your order as soon as it&apos;s done.
              </p>
              <Link
                href={`/account/orders/${encodeURIComponent(orderId)}`}
                className="inline-flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                View order
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
