import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/tool-images/**",
      },
      {
        pathname: "/logo-transparent.png",
      },
      {
        pathname: "/makerlab-logo-transparent.png",
      },
      {
        pathname: "/makerlab-logo-blackonly.png",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "v5.airtableusercontent.com",
      },
    ],
  },
};

export default nextConfig;
