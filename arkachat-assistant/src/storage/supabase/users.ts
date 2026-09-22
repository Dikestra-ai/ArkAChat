import { supabase } from './client.js';

export type AdelRole = 'owner' | 'client' | 'employee';

export interface AdelUser {
  id: number;
  telegram_id: number | null;
  whatsapp_phone: string | null;
  display_name: string | null;
  language: string;
  timezone: string;
  is_admin: boolean;
  role: AdelRole;
  business_id: number | null;
  created_at: string;
  last_seen_at: string;
}

export interface AdelBusiness {
  id: number;
  name: string;
  owner_user_id: number | null;
}

/**
 * Look up a user by their Telegram ID, or create them on first contact.
 * New users default to role='client' with no business — they need to be
 * claimed (linked to a business) by an owner before the bot routes their
 * messages anywhere meaningful.
 *
 * The single configured admin (ADEL_ADMIN_TELEGRAM_ID) is auto-promoted
 * to role='owner' and gets a default business on first contact.
 */
export async function findOrCreateByTelegram(args: {
  telegramId: number;
  displayName?: string | undefined;
  adminTelegramId?: number | undefined;
}): Promise<{ user: AdelUser; isNew: boolean }> {
  const { data: existing, error: selErr } = await supabase
    .from('adel_users')
    .select('*')
    .eq('telegram_id', args.telegramId)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing) {
    await supabase
      .from('adel_users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { user: existing as AdelUser, isNew: false };
  }

  const isAdmin = args.adminTelegramId === args.telegramId;

  const { data: created, error: insErr } = await supabase
    .from('adel_users')
    .insert({
      telegram_id: args.telegramId,
      display_name: args.displayName ?? null,
      role: isAdmin ? 'owner' : 'client',
      is_admin: isAdmin,
    })
    .select('*')
    .single();

  if (insErr) throw insErr;

  // Auto-bootstrap business for the admin/owner on first contact.
  if (isAdmin) {
    const { data: biz, error: bizErr } = await supabase
      .from('adel_businesses')
      .insert({
        name: `${args.displayName ?? 'Owner'}'s Business`,
        owner_user_id: created.id,
      })
      .select('*')
      .single();
    if (bizErr) throw bizErr;

    await supabase
      .from('adel_users')
      .update({ business_id: biz.id })
      .eq('id', created.id);

    return { user: { ...created, business_id: biz.id } as AdelUser, isNew: true };
  }

  return { user: created as AdelUser, isNew: true };
}

export async function getOwnerForBusiness(
  businessId: number,
): Promise<AdelUser | null> {
  const { data, error } = await supabase
    .from('adel_users')
    .select('*')
    .eq('business_id', businessId)
    .eq('role', 'owner')
    .maybeSingle();
  if (error) throw error;
  return (data as AdelUser | null) ?? null;
}

/**
 * Owner attaches an unclaimed client/employee to their business.
 * Used by the /claim command (see channels/telegram.ts).
 */
export async function attachUserToBusiness(args: {
  userId: number;
  businessId: number;
  role: AdelRole;
}): Promise<void> {
  const { error } = await supabase
    .from('adel_users')
    .update({ business_id: args.businessId, role: args.role })
    .eq('id', args.userId);
  if (error) throw error;
}

export async function getUserTelegramId(userId: number): Promise<number | null> {
  const { data, error } = await supabase
    .from('adel_users')
    .select('telegram_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.telegram_id as number | null | undefined) ?? null;
}
