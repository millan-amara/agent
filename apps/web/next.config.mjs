import { join } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the production Docker image.
  output: "standalone",
  // Trace from the monorepo root so hoisted node_modules are bundled, and to
  // silence the multi-lockfile root-inference warning.
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
};

export default nextConfig;
