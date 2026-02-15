import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
    ],
  },
  env: {
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
  },
};

export default nextConfig;
