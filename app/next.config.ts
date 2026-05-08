import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Immediately activate new service worker so rebuilt chunks don't get
  // served from the old cache after a deployment.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback as Record<string, boolean | undefined> | undefined),
        fs: false,
        path: false,
        os: false,
        stream: false,
        zlib: false,
      };
    }
    return config;
  },
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

  serverExternalPackages: ["pdf-parse", "mammoth", "adm-zip", "csv-parse"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
  turbopack: {},
};

export default withPWA(nextConfig);
