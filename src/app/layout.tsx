import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { WishlistProvider } from "@/lib/wishlist/WishlistProvider";
import { CartProvider } from "@/lib/cart/CartProvider";
import { StockProvider } from "@/lib/stock/StockProvider";
import { ActiveCategoryProvider } from "@/lib/nav/ActiveCategoryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CellPhone Crowd — Smartphones, Cameras & Accessories",
  description: "Shop the latest smartphones, cameras, speakers and accessories at the best prices. Genuine products with fast delivery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <StockProvider><ActiveCategoryProvider>{children}</ActiveCategoryProvider></StockProvider>
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
