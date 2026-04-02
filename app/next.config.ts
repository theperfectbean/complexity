import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Ensure pdfjs-dist worker (dynamically loaded, not auto-traced) is included in standalone builds
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
  turbopack: {},
};

export default withPWA(nextConfig);
