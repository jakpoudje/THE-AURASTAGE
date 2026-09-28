/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@aurastage/contracts", "@aurastage/engines"],
  // Phase 11 hardening (SRS §18): no framing (clickjacking), no MIME sniffing, no referrer leaks
  // (invite tokens live in the URL fragment, which browsers never send anyway).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
