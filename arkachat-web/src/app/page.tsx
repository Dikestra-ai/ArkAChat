'use client';

import { useEffect, useState } from 'react';
import { Shield, MessageCircle, Lock, Zap } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-700">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-green-400" />
            <span className="text-2xl font-bold text-white">ArkAChat</span>
          </div>
          <Link
            href="/chat"
            className="bg-white text-blue-900 px-6 py-2 rounded-full font-semibold hover:bg-gray-100 transition"
          >
            Open App
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
          Quantum-Safe Messaging
        </h1>
        <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Zero-identifier messaging with encryption that survives quantum computers.
          No phone number. No metadata. No compromise.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center bg-green-500 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-green-600 transition"
        >
          <MessageCircle className="w-6 h-6 mr-2" />
          Start Chatting
        </Link>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon={<Shield className="w-12 h-12 text-green-400" />}
            title="256-bit Encryption"
            description="EXPTIME-hard encryption that resists both quantum computers and theoretical P=NP proofs"
          />
          <FeatureCard
            icon={<Lock className="w-12 h-12 text-green-400" />}
            title="Zero Identifiers"
            description="No phone numbers, no accounts, no metadata. Pure pairwise connections only."
          />
          <FeatureCard
            icon={<Zap className="w-12 h-12 text-green-400" />}
            title="Forward Secrecy"
            description="Every message uses a unique key. Compromised keys can't decrypt past messages."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-blue-200">
        <p>Built with Dikestra AI Shield v2.4.1</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-left">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-blue-100">{description}</p>
    </div>
  );
}
