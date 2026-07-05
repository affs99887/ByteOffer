/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a minimal `server.js` + only the needed node_modules, so the Docker
  // runner stage can `node server.js` without the full toolchain (architecture §11 Docker path).
  // Harmless on Vercel (which ignores it). See Dockerfile.
  output: "standalone",
};

export default nextConfig;
