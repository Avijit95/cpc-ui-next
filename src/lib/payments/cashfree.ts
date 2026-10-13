import type { PaymentInitiateResponse } from "@/lib/api/types";

// Hand the browser off to Cashfree's hosted checkout in the same tab. Cashfree
// sends the buyer back to /checkout/result once the payment ends. Throws if
// the checkout can't be opened, so callers can show their usual error.
export async function openCashfreeCheckout({
  paymentSessionId,
  mode,
}: PaymentInitiateResponse): Promise<void> {
  const { load } = await import("@cashfreepayments/cashfree-js");
  const cashfree = await load({ mode });
  if (!cashfree) throw new Error("Could not load Cashfree checkout");
  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_self",
  });
  if (result?.error) {
    throw new Error(result.error.message ?? "Could not open Cashfree checkout");
  }
}
