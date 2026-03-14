import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    middlewareClientMaxBodySize: 20 * 1024 * 1024, // 20MB
  },
};

export default nextConfig;
