import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Every page is static, so the Cloudflare Pages deploy is a plain export (EXPORT=1 npm run build). Normal builds are unchanged.
  ...(process.env.EXPORT === "1" ? { output: "export" as const, trailingSlash: false } : {}),
  // The wallet libraries import optional packages that only matter on React Native or in Node logging. The
  // website never uses them, so mark them as absent instead of printing "module not found" on every build.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    return config;
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
