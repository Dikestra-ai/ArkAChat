/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Security headers (security review web-app finding #1).
//
// NOTE: when BUILD_TARGET=electron the app is a static export
// (output: 'export') and `headers()` is NOT applied. For that target the same
// CSP is delivered via a <meta http-equiv> tag in src/app/layout.tsx (kept in
// sync with this one) and should additionally be enforced by the Electron
// session (webRequest.onHeadersReceived). frame-ancestors / X-Frame-Options
// cannot be expressed in a <meta> tag, so the HTTP headers below remain the
// authoritative anti-framing control for the web target.
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development';

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' is required for the Shield WASM core (shield_core_bg.wasm).
  // A blanket 'unsafe-eval' is deliberately NOT allowed in production; dev
  // builds add it only because Next.js HMR requires eval'd source maps.
  `script-src 'self' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  // Tailwind/next-font inject inline <style> elements.
  "style-src 'self' 'unsafe-inline'",
  // data: for generated QR codes, blob: for decrypted media object URLs.
  "img-src 'self' data: blob:",
  // next/font self-hosts fonts at build time; no external font hosts needed.
  "font-src 'self' data:",
  // Local dev relay (ws://localhost:3004) + public SimpleX SMP servers
  // (wss on port 5223). If a Shield proxy endpoint is configured via
  // WebSimplexClient.setProxyUrl(), its origin must be added here.
  "connect-src 'self' ws://localhost:3004 ws://127.0.0.1:3004" +
    ' wss://smp4.simplex.im wss://smp4.simplex.im:5223' +
    ' wss://smp5.simplex.im wss://smp5.simplex.im:5223' +
    ' wss://smp6.simplex.im wss://smp6.simplex.im:5223' +
    (isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''),
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // Camera is needed (same origin only) for QR scanning; everything else off.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig = {
  webpack: (config, { isServer }) => {
    // Enable WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Fix for WASM in client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    return config;
  },
  // Enable static export for Electron
  output: process.env.BUILD_TARGET === 'electron' ? 'export' : undefined,
  // headers() is unsupported with output:'export'; the Electron target relies
  // on the <meta> CSP in layout.tsx + Electron session headers instead.
  ...(process.env.BUILD_TARGET === 'electron'
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: securityHeaders,
            },
          ];
        },
      }),
};

module.exports = nextConfig;
