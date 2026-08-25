import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { BridgeProvider } from '@/components/BridgeProvider';

const inter = Inter({ subsets: ['latin'] });

// ---------------------------------------------------------------------------
// Content-Security-Policy as a <meta> tag (security review web-app finding #1).
//
// The Electron build is a static export (next.config.js `output: 'export'`),
// which bypasses next.config.js `headers()` entirely — this meta tag is the
// CSP for exported HTML. Keep it in sync with the header CSP in
// next.config.js. Limitations of meta-delivered CSP: `frame-ancestors` and
// reporting directives are ignored, so anti-framing for the web target comes
// from the HTTP headers, and the Electron shell should also enforce headers
// at the session level.
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development';

const metaCsp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' for the Shield WASM core only — no blanket
  // 'unsafe-eval' in production (dev needs it for Next.js HMR).
  `script-src 'self' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Local dev relay + public SimpleX SMP servers (wss, port 5223). Add the
  // Shield proxy origin here if setProxyUrl() is used.
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
].join('; ');

export const metadata: Metadata = {
  title: 'ArkAChat - Quantum-Safe Messaging',
  description: 'Zero-identifier messaging with quantum-resistant encryption',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={metaCsp} />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className={inter.className}>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
