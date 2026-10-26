import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Allow LAN and mobile devices to access dev resources & HMR */
  allowedDevOrigins: [
    '172.18.232.119',
    'localhost:3000',
    '127.0.0.1:3000',
    '*.local',
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
