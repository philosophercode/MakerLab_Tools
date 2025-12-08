import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'v5.airtableusercontent.com', // Common AirTable image host
      },
      {
        protocol: 'https',
        hostname: 'dl.airtable.com',
      }
    ],
  },
};

export default nextConfig;
