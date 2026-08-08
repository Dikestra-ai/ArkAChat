'use client';

import { useState } from 'react';
import { X, Shield, Trash2, Wifi, WifiOff, Info } from 'lucide-react';
import { useChatStore } from '@/lib/storage/chatStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const contacts = useChatStore((state) => state.contacts);
  const messages = useChatStore((state) => state.messages);
  const connectionState = useChatStore((state) => state.connectionState);

  const totalMessages = Object.values(messages).reduce(
    (sum, msgs) => sum + msgs.length,
    0
  );

  const handleClearData = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    // Clear persisted store by reloading with cleared localStorage
    localStorage.removeItem('arkachat-storage');
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Connection Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {connectionState === 'connected' ? (
                  <Wifi className="w-5 h-5 text-green-500" />
                ) : (
                  <WifiOff className="w-5 h-5 text-red-400" />
                )}
                <span className="font-medium">Connection</span>
              </div>
              <span
                className={`text-sm capitalize ${
                  connectionState === 'connected'
                    ? 'text-green-600'
                    : connectionState === 'connecting'
                    ? 'text-blue-600'
                    : 'text-red-500'
                }`}
              >
                {connectionState}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Info className="w-5 h-5 text-blue-500" />
              <span className="font-medium">Local Data</span>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Contacts</span>
                <span className="font-medium">{contacts.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Messages stored</span>
                <span className="font-medium">{totalMessages}</span>
              </div>
            </div>
          </div>

          {/* Encryption Info */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800">Encryption</span>
            </div>
            <p className="text-sm text-green-700">
              Dikestra AI Shield v2.4.1 · AES-256-GCM · Post-quantum ratchet
            </p>
          </div>

          {/* Clear Data */}
          <div className="border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-700">Clear Local Data</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Permanently deletes all contacts and messages stored on this device.
            </p>
            <button
              onClick={handleClearData}
              className={`w-full py-2 rounded-lg font-medium transition text-sm ${
                confirmClear
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              }`}
            >
              {confirmClear ? 'Tap again to confirm — this cannot be undone' : 'Clear All Data'}
            </button>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            ArkAChat · Zero-identifier quantum-safe messaging
          </p>
        </div>
      </div>
    </div>
  );
}
