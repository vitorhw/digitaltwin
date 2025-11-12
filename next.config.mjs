/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  server: {
    // Allow larger uploads (e.g. high resolution photos) through Next.js route handlers
    middlewareClientMaxBodySize: 30 * 1024 * 1024, // 30 MB
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
