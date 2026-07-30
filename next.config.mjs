/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Widget script must be embeddable cross-origin from any merchant storefront.
        source: "/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
