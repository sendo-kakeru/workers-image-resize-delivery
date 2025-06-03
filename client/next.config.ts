import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: [
      process.env.NEXT_PUBLIC_CDN_URL
        ? new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname
        : "",
    ],
  },
};

export default nextConfig;
