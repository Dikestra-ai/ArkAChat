'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, QrCode, Scan, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useChatBridge } from '@/hooks/useChatBridge';
import { QRGenerator } from './QRGenerator';
import { QRScanner } from './QRScanner';

type ModalMode = 'choose' | 'generate' | 'scan';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactAdded?: (contactId: string) => void;
}

export function AddContactModal({ isOpen, onClose, onContactAdded }: AddContactModalProps) {
  const [mode, setMode] = useState<ModalMode>('choose');
  const [displayName, setDisplayName] = useState('');
  const [invitation, setInvitation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { createInvitation, acceptInvitation } = useChatBridge();

  const handleClose = useCallback(() => {
    setMode('choose');
    setDisplayName('');
    setInvitation(null);
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    onClose();
  }, [onClose]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;


  const handleGenerateQR = async () => {
    if (!displayName.trim()) {
      setError('Please enter your display name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const inv = await createInvitation(displayName.trim());
      if (inv) {
        setInvitation(inv);
        setMode('generate');
      } else {
        setError('Failed to create invitation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async (qrData: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const contact = await acceptInvitation(qrData);
      if (contact) {
        setSuccess(`Added ${contact.displayName} as contact!`);
        onContactAdded?.(contact.id);

        // Auto-close after success
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        setError('Failed to add contact');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid QR code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="add-contact-modal">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center">
            <UserPlus className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold">Add Contact</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-xl">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              <p className="text-green-700">{success}</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Mode: Choose */}
          {mode === 'choose' && !success && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="display-name-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleGenerateQR}
                  disabled={!displayName.trim() || isLoading}
                  className="flex flex-col items-center p-6 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 hover:border-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="show-qr-button"
                >
                  <QrCode className="w-10 h-10 text-blue-600 mb-2" />
                  <span className="font-medium text-blue-700">Show My QR</span>
                  <span className="text-xs text-blue-500 mt-1">Let others scan</span>
                </button>

                <button
                  onClick={() => setMode('scan')}
                  disabled={isLoading}
                  className="flex flex-col items-center p-6 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 hover:border-green-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="scan-qr-button"
                >
                  <Scan className="w-10 h-10 text-green-600 mb-2" />
                  <span className="font-medium text-green-700">Scan QR</span>
                  <span className="text-xs text-green-500 mt-1">Add a contact</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode: Generate QR */}
          {mode === 'generate' && invitation && (
            <div>
              <button
                onClick={() => setMode('choose')}
                className="mb-4 text-sm text-blue-600 hover:text-blue-700"
              >
                ← Back
              </button>
              <QRGenerator
                data={invitation}
                title={`Share as ${displayName}`}
                description="Have your contact scan this code to connect"
                onCopy={() => {
                  // Could show a toast here
                }}
              />
            </div>
          )}

          {/* Mode: Scan QR */}
          {mode === 'scan' && !success && (
            <div>
              <button
                onClick={() => setMode('choose')}
                className="mb-4 text-sm text-blue-600 hover:text-blue-700"
              >
                ← Back
              </button>
              <QRScanner
                onScan={handleScan}
                onError={(err) => setError(err)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            All connections are secured with quantum-safe Shield encryption
          </p>
        </div>
      </div>
    </div>
  );
}
