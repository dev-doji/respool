import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The wallet libraries import optional packages that only matter on React Native or in Node logging. The
  // website never uses them, so mark them as absent instead of printing "module not found" on every build.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    return config;
  },
};

export default nextConfig;
