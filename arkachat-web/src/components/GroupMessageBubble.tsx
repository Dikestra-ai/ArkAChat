'use client';

import { useEffect, useRef } from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';
import { GroupMessage } from '@/lib/storage/groupStore';

interface GroupMessageBubbleProps {
  message: GroupMessage;
  senderName: string;
  readByCount?: number;
  totalMembers?: number;
  onVisible?: (messageId: string) => void;
}

export function GroupMessageBubble({
  message,
  senderName,
  readByCount,
  totalMembers,
  onVisible,
}: GroupMessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const isOutgoing = message.isOutgoing;
  const isSystemMessage = message.content.startsWith('[') && message.content.endsWith(']') ||
    message.content.includes('joined the group') ||
    message.content.includes('left the group') ||
    message.content.includes('is now') ||
    message.content.includes('Group ') && message.content.includes('changed') ||
    message.content.includes('were removed');

  // Track visibility for read receipts
  useEffect(() => {
    if (!onVisible || isOutgoing || message.status === 'read' || isSystemMessage) {
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
  }, [message.id, isOutgoing, message.status, isSystemMessage, onVisible]);

  // System message styling
  if (isSystemMessage) {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-gray-200 text-gray-600 text-sm px-4 py-1 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  const statusIcon = () => {
    if (!isOutgoing) return null;

    switch (message.status) {
      case 'sent':
        return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Show "Seen by X" for group messages
  const seenByText = () => {
    if (!isOutgoing || !readByCount || !totalMembers) return null;
    if (readByCount === 0) return null;

    const othersCount = totalMembers - 1; // Exclude self
    if (readByCount >= othersCount) {
      return <span className="text-xs text-green-200 ml-1">Seen by all</span>;
    }
    return <span className="text-xs text-green-200 ml-1">Seen by {readByCount}</span>;
  };

  return (
    <div
      ref={bubbleRef}
      data-message-id={message.id}
      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          isOutgoing
            ? 'bg-green-600 text-white rounded-br-md'
            : 'bg-white border border-gray-200 rounded-bl-md'
        }`}
      >
        {/* Sender name for incoming messages */}
        {!isOutgoing && (
          <div className="text-xs font-semibold text-green-600 mb-1">
            {senderName}
          </div>
        )}

        {/* Message content */}
        <p className="break-words whitespace-pre-wrap">{message.content}</p>

        {/* Timestamp and status */}
        <div
          className={`flex items-center justify-end space-x-1 mt-1 ${
            isOutgoing ? 'text-green-200' : 'text-gray-400'
          }`}
        >
          <span className="text-xs">{formatTime(message.timestamp)}</span>
          {statusIcon()}
          {seenByText()}
        </div>
      </div>
    </div>
  );
}
