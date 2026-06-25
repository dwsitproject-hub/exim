/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/dashboard/users/:path*", destination: "/admin/users/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
