import { useEffect, useCallback, useMemo } from 'react';
import { useChatStore, Contact, Message, MessageStatus, ConnectionState } from '@/lib/storage/chatStore';
import { getBridgeInstance } from '@/components/BridgeProvider';

/**
 * Hook to access the ShieldSimplexBridge for encrypted messaging.
 *
 * Bridge is initialized eagerly by BridgeProvider in layout.tsx.
 * This hook provides access to bridge methods and store state.
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

    /**
     * Send a text message to a contact
     */
    const sendMessage = useCallback(async (contactId: string, text: string): Promise<Message | null> => {
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        // Let errors propagate so callers can show failure state.
        return bridge.sendTextMessage(contactId, text);
    }, []);

    /**
     * Send a file to a contact
     */
    const sendFile = useCallback(async (contactId: string, file: File): Promise<Message | null> => {
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        try {
            const { message } = await bridge.sendFile(contactId, file);
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
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        try {
            return await bridge.createInvitation(displayName);
        } catch (error) {
            console.error('Failed to create invitation:', error);
            return null;
        }
    }, []);

    /**
     * Accept an invitation from a scanned QR code
     */
    const acceptInvitation = useCallback(async (qrData: string): Promise<Contact | null> => {
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        try {
            return await bridge.acceptInvitation(qrData);
        } catch (error) {
            console.error('Failed to accept invitation:', error);
            return null;
        }
    }, []);

    /**
     * Download a file in decrypted form
     */
    const downloadFileDecrypted = useCallback(async (contactId: string, fileId: string): Promise<Blob | null> => {
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        try {
            const fileRef = { id: fileId, contactId, encryptedSize: 0 };
            return await bridge.downloadFileDecrypted(fileRef);
        } catch (error) {
            console.error('Failed to download file:', error);
            return null;
        }
    }, []);

    /**
     * Download a file in encrypted form (for backup)
     */
    const downloadFileEncrypted = useCallback(async (contactId: string, fileId: string): Promise<Blob | null> => {
        const bridge = getBridgeInstance();
        if (!bridge) return null;

        try {
            const fileRef = { id: fileId, contactId, encryptedSize: 0 };
            return await bridge.downloadFileEncrypted(fileRef);
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
        const bridge = getBridgeInstance();
        if (!bridge) return;

        try {
            await bridge.sendReadReceipt(contactId, messageId);
        } catch (error) {
            console.error('Failed to send read receipt:', error);
        }
    }, []);

    /**
     * Mark a specific message as read and send receipt
     */
    const markMessageAsRead = useCallback(async (contactId: string, messageId: string): Promise<void> => {
        const bridge = getBridgeInstance();
        if (!bridge) return;

        const contactMessages = getMessagesForContactFromStore(contactId);
        const message = contactMessages.find((m) => m.id === messageId);

        if (message && !message.isOutgoing && message.status !== 'read') {
            // Update local state
            updateMessageStatus(messageId, 'read');

            // Send read receipt to sender
            try {
                await bridge.sendReadReceipt(contactId, messageId);
            } catch (error) {
                console.error('Failed to send read receipt:', error);
            }
        }
    }, [getMessagesForContactFromStore, updateMessageStatus]);

    /**
     * Mark all messages from a contact as read
     */
    const markAsRead = useCallback(async (contactId: string): Promise<void> => {
        const bridge = getBridgeInstance();
        if (!bridge) return;

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
                await bridge.sendReadReceipt(contactId, message.id);
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
