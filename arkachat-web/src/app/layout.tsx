import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { BridgeProvider } from '@/components/BridgeProvider';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
