'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/lib/storage/chatStore';

interface MessageBubbleProps {
  message: Message;
  onVisible?: (messageId: string) => void;
}

export function MessageBubble({ message, onVisible }: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Track visibility for read receipts
  useEffect(() => {
    if (!onVisible || message.isOutgoing || message.status === 'read') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onVisible(message.id);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (bubbleRef.current) {
      observer.observe(bubbleRef.current);
    }

    return () => observer.disconnect();
  }, [message.id, message.isOutgoing, message.status, onVisible]);

  // Status indicators
  const getStatusIndicator = () => {
    switch (message.status) {
      case 'sending':
        return <span className="opacity-50">○</span>;
      case 'sent':
        return <span>✓</span>;
      case 'delivered':
        return <span>✓✓</span>;
      case 'read':
        return <span className="text-blue-300">✓✓</span>;
      case 'failed':
        return <span className="text-red-400">!</span>;
      default:
        return null;
    }
  };

  return (
    <div
      ref={bubbleRef}
      data-message-id={message.id}
      data-unread={!message.isOutgoing && message.status !== 'read' ? 'true' : 'false'}
      className={`flex ${message.isOutgoing ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          message.isOutgoing
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
        }`}
      >
        <p className="break-words">{message.content}</p>
        <div
          className={`flex items-center justify-end space-x-1 mt-1 text-xs ${
            message.isOutgoing ? 'text-blue-200' : 'text-gray-500'
          }`}
        >
          <span>{time}</span>
          {message.isOutgoing && getStatusIndicator()}
        </div>
      </div>
    </div>
  );
}
