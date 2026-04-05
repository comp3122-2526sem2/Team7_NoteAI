import type { NextConfig } from "next";

/**
 * When you open the dev server via a LAN IP (e.g. http://192.168.1.105:3000 from a phone),
 * Next.js may block /_next/* and webpack-hmr WebSocket unless the host is allowlisted.
 * Set in frontend/.env.local:
 *   NEXT_DEV_ALLOWED_ORIGINS=192.168.1.105
 * (comma-separated for multiple hosts; no protocol or port)
 */
const allowedDevOrigins =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
