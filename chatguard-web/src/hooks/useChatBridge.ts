import { useEffect, useCallback, useMemo } from 'react';
import { useChatStore, Contact, Message, MessageStatus, ConnectionState } from '@/lib/storage/chatStore';
import { ShieldSimplexBridge } from '@/lib/bridge/shieldSimplexBridge';

let bridgeInstance: ShieldSimplexBridge | null = null;

/**
 * Hook to access the ShieldSimplexBridge for encrypted messaging.
 *
 * This hook provides:
 * - Access to contacts and messages from the store
 * - Methods to send messages and files
 * - Methods to create and accept contact invitations
 * - Connection state management
 */
export function useChatBridge() {
    const contacts = useChatStore((state) => state.contacts);
    const messagesMap = useChatStore((state) => state.messages);
    const addContact = useChatStore((state) => state.addContact);
    const addMessage = useChatStore((state) => state.addMessage);
    const updateMessageStatus = useChatStore((state) => state.updateMessageStatus);
    const connectionState = useChatStore((state) => state.connectionState);
    const setConnectionState = useChatStore((state) => state.setConnectionState);
    const getMessagesForContactFromStore = useChatStore((state) => state.getMessagesForContact);

    // Initialize bridge on first use
    useEffect(() => {
        if (!bridgeInstance) {
            bridgeInstance = new ShieldSimplexBridge();
            bridgeInstance.start();
        }

        // Subscribe to connection state changes
        const unsubscribe = bridgeInstance.onConnectionStateChange((state) => {
            setConnectionState(state);
        });

        return () => {
            unsubscribe?.();
        };
    }, [setConnectionState]);

    /**
     * Send a text message to a contact
     */
    const sendMessage = useCallback(async (contactId: string, text: string): Promise<Message | null> => {
        if (!bridgeInstance) return null;

        try {
            const message = await bridgeInstance.sendTextMessage(contactId, text);
            return message;
        } catch (error) {
            console.error('Failed to send message:', error);
            return null;
        }
    }, []);

    /**
     * Send a file to a contact
     */
    const sendFile = useCallback(async (contactId: string, file: File): Promise<Message | null> => {
        if (!bridgeInstance) return null;

        try {
            const { message } = await bridgeInstance.sendFile(contactId, file);
            return message;
        } catch (error) {
            console.error('Failed to send file:', error);
            return null;
        }
    }, []);

    /**
     * Create an invitation QR code for a new contact
     */
    const createInvitation = useCallback(async (displayName: string): Promise<string | null> => {
        if (!bridgeInstance) return null;

        try {
            return await bridgeInstance.createInvitation(displayName);
        } catch (error) {
            console.error('Failed to create invitation:', error);
            return null;
        }
    }, []);

    /**
     * Accept an invitation from a scanned QR code
     */
    const acceptInvitation = useCallback(async (qrData: string): Promise<Contact | null> => {
        if (!bridgeInstance) return null;

        try {
            return await bridgeInstance.acceptInvitation(qrData);
        } catch (error) {
            console.error('Failed to accept invitation:', error);
            return null;
        }
    }, []);

    /**
     * Download a file in decrypted form
     */
    const downloadFileDecrypted = useCallback(async (contactId: string, fileId: string): Promise<Blob | null> => {
        if (!bridgeInstance) return null;

        try {
            return await bridgeInstance.downloadFileDecrypted(contactId, fileId);
        } catch (error) {
            console.error('Failed to download file:', error);
            return null;
        }
    }, []);

    /**
     * Download a file in encrypted form (for backup)
     */
    const downloadFileEncrypted = useCallback(async (contactId: string, fileId: string): Promise<Blob | null> => {
        if (!bridgeInstance) return null;

        try {
            return await bridgeInstance.downloadFileEncrypted(contactId, fileId);
        } catch (error) {
            console.error('Failed to download encrypted file:', error);
            return null;
        }
    }, []);

    /**
     * Get messages for a specific contact
     */
    const getMessagesForContact = useCallback((contactId: string): Message[] => {
        return getMessagesForContactFromStore(contactId);
    }, [getMessagesForContactFromStore]);

    /**
     * Get a contact by ID
     */
    const getContact = useCallback((contactId: string): Contact | undefined => {
        return contacts.find((c) => c.id === contactId);
    }, [contacts]);

    /**
     * Send read receipt for a specific message
     */
    const sendReadReceipt = useCallback(async (contactId: string, messageId: string): Promise<void> => {
        if (!bridgeInstance) return;

        try {
            await bridgeInstance.sendReadReceipt(contactId, messageId);
        } catch (error) {
            console.error('Failed to send read receipt:', error);
        }
    }, []);

    /**
     * Mark a specific message as read and send receipt
     */
    const markMessageAsRead = useCallback(async (contactId: string, messageId: string): Promise<void> => {
        if (!bridgeInstance) return;

        const contactMessages = getMessagesForContactFromStore(contactId);
        const message = contactMessages.find((m) => m.id === messageId);

        if (message && !message.isOutgoing && message.status !== 'read') {
            // Update local state
            updateMessageStatus(messageId, 'read');

            // Send read receipt to sender
            try {
                await bridgeInstance.sendReadReceipt(contactId, messageId);
            } catch (error) {
                console.error('Failed to send read receipt:', error);
            }
        }
    }, [getMessagesForContactFromStore, updateMessageStatus]);

    /**
     * Mark all messages from a contact as read
     */
    const markAsRead = useCallback(async (contactId: string): Promise<void> => {
        if (!bridgeInstance) return;

        // Get unread incoming messages
        const contactMessages = getMessagesForContactFromStore(contactId);
        const unreadMessages = contactMessages.filter((m) => !m.isOutgoing && m.status !== 'read');

        // Update local state for all unread messages
        unreadMessages.forEach((m) => {
            updateMessageStatus(m.id, 'read');
        });

        // Send read receipts for each unread message
        for (const message of unreadMessages) {
            try {
                await bridgeInstance.sendReadReceipt(contactId, message.id);
            } catch (error) {
                // Don't fail the whole operation if one receipt fails
                console.error('Failed to send read receipt:', error);
            }
        }
    }, [getMessagesForContactFromStore, updateMessageStatus]);

    return {
        // State
        contacts,
        messagesMap,
        connectionState,

        // Methods
        sendMessage,
        sendFile,
        createInvitation,
        acceptInvitation,
        downloadFileDecrypted,
        downloadFileEncrypted,
        getMessagesForContact,
        getContact,
        markAsRead,
        markMessageAsRead,
        sendReadReceipt,
    };
}

/**
 * Hook for a single chat conversation
 */
export function useChat(contactId: string) {
    const {
        getMessagesForContact,
        getContact,
        sendMessage: sendBridgeMessage,
        sendFile: sendBridgeFile,
        markAsRead,
        markMessageAsRead: markBridgeMessageAsRead,
        connectionState
    } = useChatBridge();

    const contact = getContact(contactId);
    const messages = getMessagesForContact(contactId);

    // Mark as read on mount
    useEffect(() => {
        markAsRead(contactId);
    }, [contactId, markAsRead]);

    const sendMessage = useCallback(async (text: string) => {
        return sendBridgeMessage(contactId, text);
    }, [contactId, sendBridgeMessage]);

    const sendFile = useCallback(async (file: File) => {
        return sendBridgeFile(contactId, file);
    }, [contactId, sendBridgeFile]);

    const markMessageAsRead = useCallback(async (messageId: string) => {
        return markBridgeMessageAsRead(contactId, messageId);
    }, [contactId, markBridgeMessageAsRead]);

    return {
        contact,
        messages,
        connectionState,
        sendMessage,
        sendFile,
        markMessageAsRead,
    };
}
