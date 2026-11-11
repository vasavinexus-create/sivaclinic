import path from "path";
import type { NextConfig } from "next";

const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
if (!process.env.NODE_PATH || !process.env.NODE_PATH.includes(nodeModulesPath)) {
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${nodeModulesPath}${path.delimiter}${process.env.NODE_PATH}`
    : nodeModulesPath;
}

if (!(globalThis as any).__tw_resolve) {
  (globalThis as any).__tw_resolve = (_base: string, id: string) => {
    if (id === "tailwindcss" || id === "tailwindcss/index.css") {
      return path.join(process.cwd(), "node_modules", "tailwindcss", "index.css");
    }
    return null;
  };
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.8', 'localhost'],

  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/android/**',
          '**/.electron-cache/**',
          '**/.gradle-local/**',
          '**/build/**',
          '**/dist/**',
          '**/dist-electron/**',
          '**/out/**',
          '**/tmp/**',
          '**/work/**',
          '**/.git/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
