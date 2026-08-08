import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  contactId: string;
  content: string;
  timestamp: number;
  isOutgoing: boolean;
  status: MessageStatus;
  fileId?: string;         // Reference to encrypted file
  replyToId?: string;      // Reply to another message
}

export interface Contact {
  id: string;
  displayName: string;
  simplexQueueUri: string;    // My receive queue URI (messages from remote arrive here)
  outboundQueueUri?: string;  // Remote receive queue URI (I send TO here)
  isInitiator: boolean;       // Whether we initiated the connection
  createdAt: number;
  lastMessageAt?: number;
  avatarUrl?: string;
  isBlocked?: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ChatState {
  contacts: Contact[];
  messages: Record<string, Message[]>; // contactId -> messages
  selectedContactId: string | null;
  isInitialized: boolean;
  connectionState: ConnectionState;
  myDisplayName: string; // User's own display name (set when creating first invitation)

  // Actions
  initialize: () => void;
  setMyDisplayName: (name: string) => void;
  selectContact: (contactId: string | null) => void;
  addContact: (contact: Contact) => void;
  updateContact: (contactId: string, updates: Partial<Contact>) => void;
  removeContact: (contactId: string) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
  markMessagesRead: (contactId: string) => void;
  deleteMessage: (messageId: string) => void;
  getUnreadCount: (contactId: string) => number;
  getLastMessage: (contactId: string) => Message | undefined;
  getMessagesForContact: (contactId: string) => Message[];
  setConnectionState: (state: ConnectionState) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      contacts: [],
      messages: {},
      selectedContactId: null,
      isInitialized: false,
      connectionState: 'disconnected' as ConnectionState,
      myDisplayName: '',

      initialize: () => {
        set({ isInitialized: true });
      },

      setMyDisplayName: (name) => {
        set({ myDisplayName: name });
      },

      selectContact: (contactId) => {
        set({ selectedContactId: contactId });
        if (contactId) {
          get().markMessagesRead(contactId);
        }
      },

      addContact: (contact) => {
        set((state) => ({
          contacts: [...state.contacts, contact],
          messages: { ...state.messages, [contact.id]: [] },
        }));
      },

      updateContact: (contactId, updates) => {
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === contactId ? { ...c, ...updates } : c
          ),
        }));
      },

      removeContact: (contactId) => {
        set((state) => {
          const { [contactId]: _, ...remainingMessages } = state.messages;
          return {
            contacts: state.contacts.filter((c) => c.id !== contactId),
            messages: remainingMessages,
            selectedContactId:
              state.selectedContactId === contactId
                ? null
                : state.selectedContactId,
          };
        });
      },

      addMessage: (message) => {
        set((state) => {
          const contactMessages = state.messages[message.contactId] || [];

          // Check for duplicate
          if (contactMessages.some((m) => m.id === message.id)) {
            return state;
          }

          const newMessages = {
            ...state.messages,
            [message.contactId]: [...contactMessages, message].sort(
              (a, b) => a.timestamp - b.timestamp
            ),
          };

          // Update contact's lastMessageAt
          const contacts = state.contacts.map((c) =>
            c.id === message.contactId
              ? { ...c, lastMessageAt: message.timestamp }
              : c
          );

          return { messages: newMessages, contacts };
        });
      },

      updateMessageStatus: (messageId, status) => {
        set((state) => {
          const newMessages: Record<string, Message[]> = {};
          for (const [contactId, messages] of Object.entries(state.messages)) {
            newMessages[contactId] = messages.map((m) =>
              m.id === messageId ? { ...m, status } : m
            );
          }
          return { messages: newMessages };
        });
      },

      markMessagesRead: (contactId) => {
        set((state) => {
          const contactMessages = state.messages[contactId] || [];
          return {
            messages: {
              ...state.messages,
              [contactId]: contactMessages.map((m) =>
                !m.isOutgoing && m.status !== 'read'
                  ? { ...m, status: 'read' as MessageStatus }
                  : m
              ),
            },
          };
        });
      },

      deleteMessage: (messageId) => {
        set((state) => {
          const newMessages: Record<string, Message[]> = {};
          for (const [contactId, messages] of Object.entries(state.messages)) {
            newMessages[contactId] = messages.filter((m) => m.id !== messageId);
          }
          return { messages: newMessages };
        });
      },

      getUnreadCount: (contactId) => {
        const messages = get().messages[contactId] || [];
        return messages.filter((m) => !m.isOutgoing && m.status !== 'read').length;
      },

      getLastMessage: (contactId) => {
        const messages = get().messages[contactId] || [];
        return messages[messages.length - 1];
      },

      getMessagesForContact: (contactId) => {
        return get().messages[contactId] || [];
      },

      setConnectionState: (state) => {
        set({ connectionState: state });
      },
    }),
    {
      name: 'arkachat-storage',
      partialize: (state) => ({
        contacts: state.contacts,
        messages: state.messages,
        myDisplayName: state.myDisplayName,
      }),
    }
  )
);
