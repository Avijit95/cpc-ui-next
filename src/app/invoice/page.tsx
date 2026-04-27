import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ChevronLeft, Printer } from "lucide-react";

const invoiceItems = [
  { name: "iPhone 15 Pro Max", qty: 1, unitPrice: 134900, total: 134900 },
  { name: "Samsung Galaxy S24 Ultra", qty: 2, unitPrice: 129999, total: 259998 },
  { name: "JBL Charge 5", qty: 1, unitPrice: 15999, total: 15999 },
];

function formatPrice(price: number) {
  return "₹" + price.toLocaleString("en-IN");
}

const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
const discount = 5000;
const shipping = 0;
const grandTotal = subtotal - discount + shipping;

export default function InvoicePage() {
  return (
    <>
      <Header />
      <main className="bg-gray-100 min-h-screen py-10">
        <div className="max-w-3xl mx-auto px-4">
          {/* Action bar */}
          <div className="flex items-center justify-between mb-6">
            <a href="/cart" className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#129cd3] transition-colors">
              <ChevronLeft size={16} /> Back to Cart
            </a>
            <button className="flex items-center gap-2 text-sm text-[#129cd3] hover:text-[#0e87b5] font-medium">
              <Printer size={15} /> Print Invoice
            </button>
          </div>

          {/* Invoice Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Invoice Header */}
            <div className="bg-[#129cd3] px-8 py-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-wide">INVOICE</h1>
                  <p className="text-[#b8e8f5] text-sm mt-1">#INV-2024-001</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">CPC Electronics</p>
                  <p className="text-[#b8e8f5] text-xs mt-1">123 Tech Park, Sector 5</p>
                  <p className="text-[#b8e8f5] text-xs">Mumbai, Maharashtra – 400001</p>
                  <p className="text-[#b8e8f5] text-xs">GSTIN: 27ABCDE1234F1Z5</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6 space-y-6">
              {/* Invoice meta */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Invoice No.</p>
                  <p className="font-semibold text-gray-800">INV-2024-001</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Order ID</p>
                  <p className="font-semibold text-gray-800">ORD-20240315-0042</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Invoice Date</p>
                  <p className="font-semibold text-gray-800">15 Mar 2024</p>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Bill To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-2">Bill To</p>
                  <p className="font-bold text-gray-800">John Doe</p>
                  <p className="text-gray-600">john.doe@example.com</p>
                  <p className="text-gray-600">+91 98765 43210</p>
                  <p className="text-gray-600 mt-1">
                    42, Palm Avenue, Bandra West,<br />
                    Mumbai, Maharashtra – 400050
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-2">Ship To</p>
                  <p className="font-bold text-gray-800">John Doe</p>
                  <p className="text-gray-600">
                    42, Palm Avenue, Bandra West,<br />
                    Mumbai, Maharashtra – 400050
                  </p>
                  <p className="text-gray-600 mt-1">
                    <span className="text-green-600 font-medium">Estimated Delivery:</span> 18–20 Mar 2024
                  </p>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Items Table */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase mb-3">Order Items</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-center px-4 py-3">Qty</th>
                        <th className="text-right px-4 py-3">Unit Price</th>
                        <th className="text-right px-4 py-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map((item, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{item.qty}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatPrice(item.unitPrice)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatPrice(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-800 font-medium">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-green-600 font-medium">−{formatPrice(discount)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Shipping</span>
                    <span className="text-green-600 font-medium">FREE</span>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-200 mt-1">
                    <span className="font-bold text-gray-800 text-base">Grand Total</span>
                    <span className="font-bold text-[#129cd3] text-lg">{formatPrice(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
                <p className="font-semibold text-gray-700 mb-1">Terms & Conditions</p>
                <p>Payment is due within 30 days. Goods once sold will not be accepted back. This is a computer-generated invoice and does not require a signature.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href="/payment"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#129cd3] hover:bg-[#0e87b5] text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                >
                  Proceed to Payment →
                </a>
                <a
                  href="/cart"
                  className="flex-1 flex items-center justify-center gap-2 border-2 border-[#129cd3] text-[#129cd3] hover:bg-[#e8f7fc] font-semibold py-3.5 rounded-xl transition-colors text-sm"
                >
                  ← Back to Cart
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
