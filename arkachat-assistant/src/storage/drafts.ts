import { config } from '../config.js';

export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'expired';

export interface Draft {
  id: number;
  business_id: number;
  client_user_id: number;
  client_query: string;
  drafted_reply: string;
  reasoning: string | null;
  status: DraftStatus;
  owner_message_id: number | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

const backend = config.ADEL_STORAGE_BACKEND === 'supabase'
  ? await import('./supabase/drafts.js')
  : await import('./sqlite/drafts.js');

export const createDraft = backend.createDraft;
export const setOwnerMessageId = backend.setOwnerMessageId;
export const getPendingDraft = backend.getPendingDraft;
export const getDraft = backend.getDraft;
export const markApproved = backend.markApproved;
export const markSent = backend.markSent;
export const markRejected = backend.markRejected;
