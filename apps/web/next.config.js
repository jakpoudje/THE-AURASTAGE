/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@aurastage/contracts", "@aurastage/engines"],
};

module.exports = nextConfig;
