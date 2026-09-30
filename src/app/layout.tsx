import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CartProvider } from "@/components/shop/CartProvider";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { SiteHeader } from "@/components/shop/SiteHeader";

export const metadata: Metadata = {
  title: {
    default: "Virtual Fit - try it on before you buy it",
    template: "%s � Virtual Fit",
  },
  description:
    "A demo clothing store with a real virtual fitting room: browser-based, body-aware garment fitting with an AI fashion assistant.",
  applicationName: "Virtual Fit",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <CartProvider>
          {/* Global navbar - present on every page, including login/register/admin */}
          <SiteHeader />
          <div className="flex-1 flex flex-col min-h-0 w-full">{children}</div>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
