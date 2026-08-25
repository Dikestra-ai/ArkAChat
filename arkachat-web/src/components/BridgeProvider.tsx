'use client';

import { useEffect } from 'react';
import { ShieldSimplexBridge } from '@/lib/bridge/shieldSimplexBridge';
import { useChatStore } from '@/lib/storage/chatStore';

// Polyfill crypto.randomUUID for Android WebViews that predate Chrome 92
if (typeof crypto !== 'undefined' && typeof (crypto as { randomUUID?: unknown }).randomUUID !== 'function') {
  (crypto as { randomUUID: () => string }).randomUUID = function (): `${string}-${string}-${string}-${string}-${string}` {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

let bridgeInstance: ShieldSimplexBridge | null = null;

export function getBridgeInstance(): ShieldSimplexBridge | null {
  return bridgeInstance;
}

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const setConnectionState = useChatStore((state) => state.setConnectionState);

  useEffect(() => {
    if (!bridgeInstance) {
      bridgeInstance = new ShieldSimplexBridge();
      bridgeInstance.initialize().catch(console.error);
    }

    const unsubscribe = bridgeInstance.onConnectionChange((state) => {
      setConnectionState(state);
    });

    return () => {
      unsubscribe?.();
    };
  }, [setConnectionState]);

  return <>{children}</>;
}
