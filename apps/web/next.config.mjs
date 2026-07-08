import { join } from "node:path";

// Origin of the API the browser talks to (cookies, fetch). Allowed in connect-src
// so the CSP doesn't block legitimate XHR. Falls back to localhost in dev.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").origin;
  } catch {
    return "";
  }
})();

// The live inbox/simulator opens a WebSocket to the API (/api/ws). WS uses the
// ws/wss scheme, which connect-src does NOT derive from the https:// origin, so
// allow it explicitly (https -> wss, http -> ws).
const apiWsOrigin = apiOrigin.replace(/^http/, "ws");

// Next.js dev mode (Fast Refresh / webpack HMR) evaluates modules with eval(),
// which needs 'unsafe-eval'. We add it in development only — production builds
// don't need it and must stay strict.
const isDev = process.env.NODE_ENV !== "production";

// Meta JS SDK (connect.facebook.net) + its frames power the WhatsApp Embedded
// Signup flow; without these the connect button breaks.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://connect.facebook.net`,
  `connect-src 'self' ${apiOrigin} ${apiWsOrigin} https://graph.facebook.com`.replace(/\s+/g, " ").trim(),
  "frame-src https://www.facebook.com https://web.facebook.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the production Docker image.
  output: "standalone",
  // Trace from the monorepo root so hoisted node_modules are bundled, and to
  // silence the multi-lockfile root-inference warning.
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    // Dev only: proxy API calls through the web origin so a single HTTPS tunnel
    // (e.g. ngrok) serves both web + API. Keeps everything same-origin, so
    // cookies/CORS/mixed-content are all non-issues. In prod the web and API are
    // separate services and the browser calls the API origin directly.
    return isDev
      ? [{ source: "/api/:path*", destination: "http://localhost:3001/api/:path*" }]
      : [];
  },
};

export default nextConfig;
