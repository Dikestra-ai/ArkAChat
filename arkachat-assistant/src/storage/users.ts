import { config } from '../config.js';

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

const backend = config.ADEL_STORAGE_BACKEND === 'supabase'
  ? await import('./supabase/users.js')
  : await import('./sqlite/users.js');

export const findOrCreateByTelegram = backend.findOrCreateByTelegram;
export const getOwnerForBusiness = backend.getOwnerForBusiness;
export const attachUserToBusiness = backend.attachUserToBusiness;
export const getUserTelegramId = backend.getUserTelegramId;
