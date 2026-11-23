import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Build autocontido para deploy (Docker/Cloud Run etc.)
  output: 'standalone',
};

export default nextConfig;
