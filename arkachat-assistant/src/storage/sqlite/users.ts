import { db, toIsoNow } from './db.js';
import type { AdelBusiness, AdelRole, AdelUser } from '../users.js';

function normalizeUser(row: any): AdelUser {
  return {
    ...row,
    is_admin: Boolean(row.is_admin),
  } as AdelUser;
}

export async function findOrCreateByTelegram(args: {
  telegramId: number;
  displayName?: string | undefined;
  adminTelegramId?: number | undefined;
}): Promise<{ user: AdelUser; isNew: boolean }> {
  const existing = db.prepare('select * from adel_users where telegram_id = ?').get(args.telegramId);
  if (existing) {
    db.prepare('update adel_users set last_seen_at = ? where id = ?').run(toIsoNow(), (existing as any).id);
    return { user: normalizeUser(existing), isNew: false };
  }

  const isAdmin = args.adminTelegramId === args.telegramId;
  const created = db.transaction(() => {
    const userInfo = db.prepare(`
      insert into adel_users (telegram_id, display_name, role, is_admin)
      values (?, ?, ?, ?)
    `).run(args.telegramId, args.displayName ?? null, isAdmin ? 'owner' : 'client', isAdmin ? 1 : 0);

    const userId = Number(userInfo.lastInsertRowid);
    if (isAdmin) {
      const bizInfo = db.prepare(`
        insert into adel_businesses (name, owner_user_id)
        values (?, ?)
      `).run(`${args.displayName ?? 'Owner'}'s Business`, userId);
      const businessId = Number(bizInfo.lastInsertRowid);
      db.prepare('update adel_users set business_id = ? where id = ?').run(businessId, userId);
    }

    return db.prepare('select * from adel_users where id = ?').get(userId);
  })();

  return { user: normalizeUser(created), isNew: true };
}

export async function getOwnerForBusiness(businessId: number): Promise<AdelUser | null> {
  const row = db.prepare(`
    select * from adel_users where business_id = ? and role = 'owner' limit 1
  `).get(businessId);
  return row ? normalizeUser(row) : null;
}

export async function attachUserToBusiness(args: {
  userId: number;
  businessId: number;
  role: AdelRole;
}): Promise<void> {
  db.prepare('update adel_users set business_id = ?, role = ? where id = ?')
    .run(args.businessId, args.role, args.userId);
}

export async function getUserTelegramId(userId: number): Promise<number | null> {
  const row = db.prepare('select telegram_id from adel_users where id = ?').get(userId) as
    | { telegram_id: number | null }
    | undefined;
  return row?.telegram_id ?? null;
}

export type { AdelRole, AdelUser, AdelBusiness };
