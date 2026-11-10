import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.8', 'localhost'],

  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
