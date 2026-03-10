import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
};

export default nextConfig;
