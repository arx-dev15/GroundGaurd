/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@groundguard/types', '@groundguard/contracts'],
  devIndicators: false,
};

export default nextConfig;
