import { supabase } from './client.js';

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

export async function createDraft(args: {
  businessId: number;
  clientUserId: number;
  clientQuery: string;
  draftedReply: string;
  reasoning?: string | null;
}): Promise<Draft> {
  const { data, error } = await supabase
    .from('adel_drafts')
    .insert({
      business_id: args.businessId,
      client_user_id: args.clientUserId,
      client_query: args.clientQuery,
      drafted_reply: args.draftedReply,
      reasoning: args.reasoning ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Draft;
}

export async function setOwnerMessageId(args: {
  draftId: number;
  ownerMessageId: number;
}): Promise<void> {
  const { error } = await supabase
    .from('adel_drafts')
    .update({ owner_message_id: args.ownerMessageId })
    .eq('id', args.draftId);
  if (error) throw error;
}

export async function getDraft(draftId: number): Promise<Draft | null> {
  const { data, error } = await supabase
    .from('adel_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  if (error) throw error;
  return (data as Draft | null) ?? null;
}

export async function getPendingDraft(draftId: number): Promise<Draft | null> {
  const { data, error } = await supabase
    .from('adel_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return (data as Draft | null) ?? null;
}

export async function markApproved(draftId: number): Promise<void> {
  const { error } = await supabase
    .from('adel_drafts')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', draftId);
  if (error) throw error;
}

export async function markSent(draftId: number): Promise<void> {
  const { error } = await supabase
    .from('adel_drafts')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', draftId);
  if (error) throw error;
}

export async function markRejected(draftId: number): Promise<void> {
  const { error } = await supabase
    .from('adel_drafts')
    .update({ status: 'rejected' })
    .eq('id', draftId);
  if (error) throw error;
}
