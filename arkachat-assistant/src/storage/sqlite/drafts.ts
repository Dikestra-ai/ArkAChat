import { db, toIsoNow } from './db.js';
import type { Draft } from '../drafts.js';

export async function createDraft(args: {
  businessId: number;
  clientUserId: number;
  clientQuery: string;
  draftedReply: string;
  reasoning?: string | null;
}): Promise<Draft> {
  const info = db.prepare(`
    insert into adel_drafts (business_id, client_user_id, client_query, drafted_reply, reasoning)
    values (?, ?, ?, ?, ?)
  `).run(args.businessId, args.clientUserId, args.clientQuery, args.draftedReply, args.reasoning ?? null);
  return db.prepare('select * from adel_drafts where id = ?').get(Number(info.lastInsertRowid)) as Draft;
}

export async function setOwnerMessageId(args: {
  draftId: number;
  ownerMessageId: number;
}): Promise<void> {
  db.prepare('update adel_drafts set owner_message_id = ? where id = ?')
    .run(args.ownerMessageId, args.draftId);
}

export async function getDraft(draftId: number): Promise<Draft | null> {
  const row = db.prepare('select * from adel_drafts where id = ?').get(draftId);
  return (row as Draft | undefined) ?? null;
}

export async function getPendingDraft(draftId: number): Promise<Draft | null> {
  const row = db.prepare(`
    select * from adel_drafts where id = ? and status = 'pending'
  `).get(draftId);
  return (row as Draft | undefined) ?? null;
}

export async function markApproved(draftId: number): Promise<void> {
  db.prepare(`
    update adel_drafts set status = 'approved', approved_at = ? where id = ?
  `).run(toIsoNow(), draftId);
}

export async function markSent(draftId: number): Promise<void> {
  db.prepare(`
    update adel_drafts set status = 'sent', sent_at = ? where id = ?
  `).run(toIsoNow(), draftId);
}

export async function markRejected(draftId: number): Promise<void> {
  db.prepare(`update adel_drafts set status = 'rejected' where id = ?`).run(draftId);
}
