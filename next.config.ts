import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages へデプロイする場合、必要に応じて output: 'standalone' などに変更
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
