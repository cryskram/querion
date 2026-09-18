import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/incompatible packages that must not be bundled by the server build.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  eslint: {
    // Linting is run explicitly via `npm run lint`; never block a deploy build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
