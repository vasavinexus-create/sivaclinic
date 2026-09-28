import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.8', 'localhost'],

  images: {
    unoptimized: true,
  },
  turbopack: {
    root: "d:/git/CASH LEDGER/single app/sivaclinic - Copy",
  },
};

export default nextConfig;
