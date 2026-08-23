import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Product assets allow files up to 20 MiB; reserve a small margin for multipart form metadata.
      bodySizeLimit: "22mb",
    },
    // proxy.ts participates in requests; keep its buffering ceiling aligned with the Server Action limit.
    proxyClientMaxBodySize: "22mb",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
