import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "SivaCare — Clinic & Pharmacy",
  description: "Multi-tenant clinic, consultation, pharmacy, inventory and accounts management.",
  manifest: "/manifest.webmanifest",
  applicationName: "SivaCare",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SivaCare",
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [{ url: "/favicon.svg" }, { url: "/icons/sivacare.svg", type: "image/svg+xml" }],
    apple: "/icons/sivacare.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#126b5a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PwaRegister />{children}</body></html>;
}
