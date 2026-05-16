"use client";

import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { FileText, ArrowRight } from "lucide-react";

export default function InvoicesPage() {
  return (
    <>
      <AdminHeader
        title="Invoices & Billing"
        subtitle="Invoices live alongside each order — view them from Orders"
      />

      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-xl mx-auto">
          <div className="w-14 h-14 bg-[#e8f7fc] rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={26} className="text-[#129cd3]" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">
            Invoice list rolls into Orders
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Each order auto-generates its GST invoice. Open an order to view its
            invoice number, download the signed PDF, or re-queue the PDF
            worker.
          </p>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Go to Orders <ArrowRight size={14} />
          </Link>
          <p className="text-xs text-gray-400 mt-6">
            A standalone invoices list will land if and when the API exposes
            invoice search distinct from orders. For now, the order detail
            (<code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">/admin/orders/[id]</code>)
            is the source of truth.
          </p>
        </div>
      </div>
    </>
  );
}
