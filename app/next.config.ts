import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/search/:threadId",
        destination: "/chat/:threadId",
        permanent: true,
      },
    ];
  },

  serverExternalPackages: ["pdf-parse", "mammoth"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
  turbopack: {},
};

export default withPWA(nextConfig);
