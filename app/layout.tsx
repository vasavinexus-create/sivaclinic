import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SivaCare — Clinic & Pharmacy",
  description: "Multi-tenant clinic, consultation, pharmacy, inventory and accounts management.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
