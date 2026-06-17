/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/dashboard/po/:path*", destination: "/import/po/:path*", permanent: true },
      { source: "/dashboard/shipments/:path*", destination: "/import/shipments/:path*", permanent: true },
      {
        source: "/dashboard/monitoring-data/:path*",
        destination: "/import/monitoring-data/:path*",
        permanent: true,
      },
      { source: "/dashboard/analytics/:path*", destination: "/import/analytics/:path*", permanent: true },
      { source: "/dashboard/management/:path*", destination: "/import/management/:path*", permanent: true },
      { source: "/dashboard/users/:path*", destination: "/admin/users/:path*", permanent: true },
      { source: "/dashboard", destination: "/import/dashboard", permanent: true },
      { source: "/dashboard/:path*", destination: "/import/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
