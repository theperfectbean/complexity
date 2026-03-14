import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
};

export default nextConfig;
