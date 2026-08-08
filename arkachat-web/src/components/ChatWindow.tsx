'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Shield, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Contact } from '@/lib/storage/chatStore';
import { useChat } from '@/hooks/useChatBridge';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  contact: Contact;
}

export function ChatWindow({ contact }: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, connectionState, sendMessage, sendFile, markMessageAsRead } = useChat(contact.id);

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
      // Message is already visible in UI with 'failed' status; don't restore input.
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      await sendFile(file);
    } catch (error) {
      console.error('Failed to send file:', error);
    } finally {
      setIsSending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{contact.displayName}</h2>
          <div className="flex items-center text-sm">
            {connectionState === 'connected' ? (
              <>
                <Wifi className="w-3 h-3 mr-1 text-green-300" />
                <span className="text-green-300">Connected</span>
              </>
            ) : connectionState === 'connecting' ? (
              <span className="text-blue-200">Connecting...</span>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1 text-red-300" />
                <span className="text-red-300">Disconnected</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-green-400" />
          <span className="text-sm">Quantum-safe</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Shield className="w-16 h-16 mb-4 opacity-30" />
            <p>No messages yet</p>
            <p className="text-sm">Messages are quantum-safe encrypted</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onVisible={markMessageAsRead}
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
          onChange={handleFileSelect}
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
          placeholder="Message..."
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isSending}
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isSending}
          className={`p-2 rounded-full transition ${
            inputText.trim() && !isSending
              ? 'bg-blue-600 text-white hover:bg-blue-700'
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
    </div>
  );
}
