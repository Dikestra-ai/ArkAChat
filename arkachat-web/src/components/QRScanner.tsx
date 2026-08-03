'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Upload, X, AlertCircle, Loader2 } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export function QRScanner({ onScan, onError, onClose }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerId = 'qr-scanner-container';

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;

    setError(null);
    setIsScanning(true);

    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // QR code scanned successfully
          stopScanner();
          onScan(decodedText);
        },
        () => {
          // Ignore decoding errors (expected when no QR in frame)
        }
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start camera';

      if (errorMessage.includes('Permission') || errorMessage.includes('denied')) {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access to scan QR codes.');
      } else {
        setError(errorMessage);
      }

      onError?.(errorMessage);
      setIsScanning(false);
    }
  }, [onScan, onError]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        // Ignore errors when stopping
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Start scanner on mount
  useEffect(() => {
    startScanner();
  }, [startScanner]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      const scanner = new Html5Qrcode('qr-file-scanner');
      const result = await scanner.scanFile(file, true);
      scanner.clear();
      onScan(result);
    } catch (err) {
      const errorMessage = 'No QR code found in image';
      setError(errorMessage);
      onError?.(errorMessage);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center" data-testid="qr-scanner">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Scan QR Code</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scanner area */}
      <div className="relative w-full max-w-sm aspect-square bg-gray-900 rounded-lg overflow-hidden">
        <div id={scannerContainerId} className="w-full h-full" />

        {/* Hidden element for file scanning */}
        <div id="qr-file-scanner" className="hidden" />

        {/* Loading overlay */}
        {!isScanning && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}

        {/* Scanning frame overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-white rounded-lg opacity-50" />
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start mt-4 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="error-message">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Permission denied UI */}
      {permissionDenied && (
        <button
          onClick={() => {
            setPermissionDenied(false);
            setError(null);
            startScanner();
          }}
          className="mt-4 flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Camera className="w-4 h-4 mr-2" />
          Request Camera Permission
        </button>
      )}

      {/* File upload alternative */}
      <div className="mt-4 w-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          data-testid="file-input"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center w-full px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload QR Image
        </button>
      </div>

      {/* Manual input for testing */}
      <div className="mt-4 w-full">
        <input
          type="text"
          placeholder="Or paste invitation code..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) {
                onScan(value);
              }
            }
          }}
          data-testid="qr-input-manual"
        />
      </div>

      <p className="mt-4 text-xs text-gray-500 text-center">
        Point your camera at a ArkAChat QR code
      </p>
    </div>
  );
}
