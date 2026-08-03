'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Shield, Copy, Share2 } from 'lucide-react';

interface QRGeneratorProps {
  data: string;
  title?: string;
  description?: string;
  onCopy?: () => void;
  onShare?: () => void;
}

export function QRGenerator({
  data,
  title = 'Your QR Code',
  description = 'Scan this code to add me as a contact',
  onCopy,
  onShare,
}: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(canvasRef.current, data, {
        width: 256,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
    }
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      onCopy?.();
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ArkAChat Invitation',
          text: 'Add me on ArkAChat for quantum-safe messaging',
          url: data,
        });
        onShare?.();
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to share:', error);
        }
      }
    } else {
      // Fallback to copy
      handleCopy();
    }
  };

  return (
    <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-lg" data-testid="qr-generator">
      <div className="flex items-center mb-4">
        <Shield className="w-6 h-6 text-green-500 mr-2" />
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>

      <div className="p-4 bg-white border-2 border-gray-100 rounded-lg" data-testid="qr-code" data-value={data}>
        <canvas ref={canvasRef} />
      </div>

      <p className="mt-4 text-sm text-gray-500 text-center">{description}</p>

      <div className="flex items-center space-x-2 mt-4">
        <button
          onClick={handleCopy}
          className="flex items-center px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          data-testid="copy-button"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy
        </button>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            onClick={handleShare}
            className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            data-testid="share-button"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Encrypted with quantum-safe Shield
      </p>
    </div>
  );
}
