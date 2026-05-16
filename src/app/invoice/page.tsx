"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ChevronLeft, FileText } from "lucide-react";

function InvoiceRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  useEffect(() => {
    if (orderId) {
      router.replace(`/account/orders/${encodeURIComponent(orderId)}#invoice`);
    }
  }, [orderId, router]);

  if (orderId) {
    return (
      <p className="text-sm text-gray-600 mt-6">Redirecting to your order…</p>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
      <FileText size={36} className="mx-auto text-gray-300 mb-4" />
      <h1 className="text-lg font-bold text-gray-800 mb-1">Invoice download</h1>
      <p className="text-sm text-gray-600 mb-5">
        Invoices live alongside each order. Open an order to download its
        invoice PDF.
      </p>
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
      >
        Go to My Orders
      </Link>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <>
      <Header />
      <main className="bg-gray-100 min-h-screen py-10">
        <div className="max-w-3xl mx-auto px-4">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#129cd3] transition-colors mb-6"
          >
            <ChevronLeft size={16} /> Back to My Orders
          </Link>
          <Suspense
            fallback={
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">
                Loading…
              </div>
            }
          >
            <InvoiceRedirectInner />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
