'use client';

import { useState, useEffect } from 'react';
import { X, QrCode, Camera, Shield as ShieldIcon } from 'lucide-react';
import { useChatStore } from '@/lib/storage/chatStore';
import { simplexClient } from '@/lib/simplex/client';
import { shieldCrypto, QRExchange } from '@/lib/shield/crypto';

interface NewContactModalProps {
  onClose: () => void;
}

type Tab = 'scan' | 'show';

export function NewContactModal({ onClose }: NewContactModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [displayName, setDisplayName] = useState('');
  const [qrData, setQrData] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addContact = useChatStore((state) => state.addContact);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const generateQR = async () => {
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Generate a temporary contact ID for this invitation
      const tempContactId = `pending_${crypto.randomUUID()}`;

      // Use Shield to generate QR invitation with proper key generation
      const qrInvitation = await shieldCrypto.generateQRInvitation(
        tempContactId,
        displayName.trim()
      );

      setQrData(qrInvitation);
    } catch (err) {
      setError('Failed to generate QR code');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScanSubmit = async () => {
    if (!qrData.trim()) {
      setError('Please paste the QR code data');
      return;
    }

    try {
      // Parse the Shield QR exchange data
      const [sharedKey, metadata] = shieldCrypto.parseQRInvitation(qrData.trim());

      // Validate
      if (!sharedKey || sharedKey.length !== 32) {
        throw new Error('Invalid QR code: missing or invalid key');
      }

      // Check expiry (5 minutes)
      const timestamp = (metadata?.ts as number) || 0;
      const age = Date.now() - timestamp;
      if (age > 5 * 60 * 1000) {
        throw new Error('QR code has expired');
      }

      // Generate contact ID and import the shared key using Shield
      const contactId = crypto.randomUUID();
      await shieldCrypto.importSharedKey(contactId, sharedKey);

      // Get display name from metadata
      const displayNameFromQR = (metadata?.name as string) || 'Unknown';

      addContact({
        id: contactId,
        displayName: displayNameFromQR,
        simplexQueueUri: '', // Will be populated when connection is established
        createdAt: Date.now(),
        lastMessageAt: undefined,
        isInitiator: false,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid QR code data');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add Contact</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'scan'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Camera className="w-4 h-4 inline mr-2" />
            Scan Code
          </button>
          <button
            onClick={() => setActiveTab('show')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'show'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <QrCode className="w-4 h-4 inline mr-2" />
            My Code
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'scan' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Paste the QR code data from your contact
              </p>

              <textarea
                value={qrData}
                onChange={(e) => setQrData(e.target.value)}
                placeholder='{"version":"arkachat-1.0",...}'
                className="w-full h-32 border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}

              <button
                onClick={handleScanSubmit}
                disabled={!qrData.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                Add Contact
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <ShieldIcon className="w-8 h-8 text-green-500" />
              </div>

              <p className="text-sm text-gray-600 text-center">
                Share this code with your contact to connect securely
              </p>

              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {qrData ? (
                <div className="bg-gray-100 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-2">
                    Share this with your contact:
                  </p>
                  <textarea
                    value={qrData}
                    readOnly
                    className="w-full h-24 bg-white border rounded p-2 text-xs font-mono resize-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Expires in 5 minutes
                  </p>
                </div>
              ) : (
                <button
                  onClick={generateQR}
                  disabled={isGenerating || !displayName.trim()}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  {isGenerating ? 'Generating...' : 'Generate QR Code'}
                </button>
              )}

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
