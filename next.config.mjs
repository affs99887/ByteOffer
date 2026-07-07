/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a minimal `server.js` + only the needed node_modules, so the Docker
  // runner stage can `node server.js` without the full toolchain (architecture §11 Docker path).
  // Harmless on Vercel (which ignores it). See Dockerfile.
  output: "standalone",

  experimental: {
    // The admin import wizard hands a whole qbank envelope to adminPrepareImportAction as a Server
    // Action argument. Next's default Server Action body cap is 1MB — a 500+ question envelope
    // (each with explanation/points/pitfalls) clears that easily and the action would fail with an
    // opaque body-size error before validateEnvelope ever runs. Raise the cap to 4MB so a full
    // seed-sized batch survives the round-trip. (Stays under the 3.5MB envelope MEDIA budget that
    // validateEnvelope enforces separately — image-heavy banks must still be split per §3.4.) The
    // key lives under experimental.serverActions in Next 16; verified against config-shared.d.ts.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
