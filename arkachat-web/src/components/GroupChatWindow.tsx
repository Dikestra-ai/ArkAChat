'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Shield,
  Wifi,
  WifiOff,
  Loader2,
  Users,
  Settings,
} from 'lucide-react';
import { Group } from '@/lib/storage/groupStore';
import { useGroupChat } from '@/hooks/useGroupChat';
import { GroupMessageBubble } from './GroupMessageBubble';
import { GroupSettingsModal } from './GroupSettingsModal';

interface GroupChatWindowProps {
  group: Group;
}

export function GroupChatWindow({ group }: GroupChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    members,
    connectionState,
    sendMessage,
    isAdmin,
    getContactForMember,
  } = useGroupChat(group.id);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const text = inputText;
    setInputText('');
    setIsSending(true);

    try {
      await sendMessage(text);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on failure
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get sender name for a message
  const getSenderName = (senderContactId?: string): string => {
    if (senderContactId === undefined) return 'You';
    if (senderContactId === '') return 'You';
    const contact = getContactForMember(senderContactId);
    if (contact) return contact.displayName;
    const member = members.find((m) => m.contactId === senderContactId);
    return member?.displayName ?? 'Unknown';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-green-600 text-white p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center">
            <h2 className="text-lg font-semibold">{group.name}</h2>
            <Users className="w-4 h-4 ml-2" />
            <span className="text-sm ml-1">{members.length}</span>
          </div>
          <div className="flex items-center text-sm">
            {connectionState === 'connected' ? (
              <>
                <Wifi className="w-3 h-3 mr-1 text-green-300" />
                <span className="text-green-300">Connected</span>
              </>
            ) : connectionState === 'connecting' ? (
              <span className="text-green-200">Connecting...</span>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1 text-red-300" />
                <span className="text-red-300">Disconnected</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-green-400" />
            <span className="text-sm">Encrypted</span>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-green-700 transition"
            title="Group settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Users className="w-16 h-16 mb-4 opacity-30" />
            <p>No messages yet</p>
            <p className="text-sm">Start the conversation</p>
          </div>
        ) : (
          messages.map((message) => (
            <GroupMessageBubble
              key={message.id}
              message={message}
              senderName={getSenderName(message.senderContactId)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4 flex items-center space-x-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          title="Attach file"
          disabled={isSending}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Message group..."
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          disabled={isSending}
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isSending}
          className={`p-2 rounded-full transition ${
            inputText.trim() && !isSending
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-200 text-gray-400'
          }`}
        >
          {isSending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <GroupSettingsModal
          groupId={group.id}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
