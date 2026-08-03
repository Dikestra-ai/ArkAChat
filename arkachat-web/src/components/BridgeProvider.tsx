'use client';

import { useEffect } from 'react';
import { ShieldSimplexBridge } from '@/lib/bridge/shieldSimplexBridge';
import { useChatStore } from '@/lib/storage/chatStore';

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
