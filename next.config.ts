import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    // useSearchParams を Suspense なしでも許可（CSR専用ページ向け）
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;
