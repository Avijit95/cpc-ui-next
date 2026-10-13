// Minimal types for @cashfreepayments/cashfree-js (the package ships none).
declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeCheckoutResult = {
    error?: { message?: string };
    redirect?: boolean;
  };

  export type Cashfree = {
    checkout(options: {
      paymentSessionId: string;
      redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | HTMLElement;
    }): Promise<CashfreeCheckoutResult>;
  };

  // Resolves to null when called server side.
  export function load(options: {
    mode: "sandbox" | "production";
  }): Promise<Cashfree | null>;
}
