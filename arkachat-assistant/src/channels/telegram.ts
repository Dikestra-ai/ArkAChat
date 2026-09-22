import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { route } from '../nanoclaw/orchestrator.js';
import {
  findOrCreateByTelegram,
  attachUserToBusiness,
  getOwnerForBusiness,
  getUserTelegramId,
  type AdelUser,
} from '../storage/users.js';
import {
  getDraft,
  getPendingDraft,
  markApproved,
  markSent,
  markRejected,
  setOwnerMessageId,
} from '../storage/drafts.js';
import { ingestDocument } from '../documents/ingest.js';
import { getCalendar, formatEvent } from '../calendar/calendar.js';

const WELCOME_OWNER = `שלום! אני Adel — העוזרת הוירטואלית של העסק שלך.

מה אני עושה:
• עונה ללקוחות שלך אוטומטית, על סמך מסמכים שאת/ה מעלה
• כשאני לא בטוחה — מנסחת טיוטה ושואלת אותך לאישור (כפתור)
• מציגה לך את הלו"ז בכל רגע

פקודות:
/upload — העלה קובץ טקסט/PDF (price list, FAQ)
/calendar — מה יש לי השבוע
/claim <user_id> client|employee — קישור לקוח/עובד אליי

אפשר פשוט לכתוב לי בעברית.`;

const WELCOME_CLIENT = `היי! אני העוזרת הוירטואלית של העסק.
שאל/י אותי מה שצריך — אנסה לעזור או להעביר לבעלים.`;

export function startTelegram(): Telegraf {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  // ── /start ─────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const { user } = await findOrCreateByTelegram({
      telegramId: ctx.from.id,
      displayName: ctx.from.first_name,
      adminTelegramId: config.ADEL_ADMIN_TELEGRAM_ID,
    });
    await ctx.reply(user.role === 'owner' ? WELCOME_OWNER : WELCOME_CLIENT);
    if (user.role === 'client') {
      await pingOwnerNewClient(bot, user);
    }
  });

  // ── /calendar — owner only ─────────────────────────────────────────
  bot.command('calendar', async (ctx) => {
    const user = await loadUser(ctx.from.id, ctx.from.first_name);
    if (user.role !== 'owner') {
      await ctx.reply('הפקודה הזו זמינה רק לבעלים של העסק.');
      return;
    }
    const cal = getCalendar();
    const events = await cal.listUpcoming({ fromDate: new Date(), days: 7 });
    if (events.length === 0) {
      await ctx.reply('הלו"ז ריק לשבוע הקרוב.');
      return;
    }
    const lines = events.map((e) => '• ' + formatEvent(e, user.timezone));
    await ctx.reply('הלו"ז שלך לשבוע הקרוב:\n' + lines.join('\n'));
  });

  // ── /claim <user_id> client|employee ───────────────────────────────
  bot.command('claim', async (ctx) => {
    const owner = await loadUser(ctx.from.id, ctx.from.first_name);
    if (owner.role !== 'owner' || !owner.business_id) {
      await ctx.reply('רק בעלים יכול לקשר משתמשים לעסק.');
      return;
    }
    const parts = ctx.message.text.split(/\s+/).slice(1);
    const targetId = Number(parts[0]);
    const role = parts[1] === 'employee' ? 'employee' : 'client';
    if (!targetId || Number.isNaN(targetId)) {
      await ctx.reply('שימוש: /claim <user_id> client|employee');
      return;
    }
    await attachUserToBusiness({
      userId: targetId,
      businessId: owner.business_id,
      role,
    });
    await ctx.reply(`קושר משתמש #${targetId} כ-${role}.`);
  });

  // ── /upload — owner only. Reply with text, or send a .txt/.pdf doc ─
  bot.command('upload', async (ctx) => {
    const user = await loadUser(ctx.from.id, ctx.from.first_name);
    if (user.role !== 'owner') {
      await ctx.reply('רק בעלים יכול להעלות מסמכים.');
      return;
    }
    await ctx.reply(
      'שלח/י את המסמך כקובץ (.txt) או הדבק את הטקסט בהודעה הבאה והוסף בתחילתה: !doc <שם הקובץ>',
    );
  });

  // ── Document upload handler ────────────────────────────────────────
  bot.on('document', async (ctx) => {
    const user = await loadUser(ctx.from.id, ctx.from.first_name);
    if (user.role !== 'owner' || !user.business_id) {
      await ctx.reply('רק בעלים מקושר לעסק יכול להעלות מסמכים.');
      return;
    }
    const doc = ctx.message.document;
    if (!doc.mime_type?.startsWith('text/')) {
      await ctx.reply(
        'בשלב זה אני קולטת רק קבצי טקסט (.txt). תמיכה ב-PDF תתווסף בקרוב — עד אז המר לטקסט וסחב.',
      );
      return;
    }
    await ctx.sendChatAction('typing');
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const text = await fetch(link.toString()).then((r) => r.text());
    const result = await ingestDocument({
      businessId: user.business_id,
      uploadedBy: user.id,
      filename: doc.file_name ?? 'document.txt',
      mimeType: doc.mime_type,
      text,
    });
    await ctx.reply(`קלטתי את "${doc.file_name}" — ${result.chunkCount} קטעים שמורים ומחוברים לחיפוש.`);
  });

  // ── Approve / reject draft callbacks ───────────────────────────────
  bot.action(/^approve:(\d+)$/, async (ctx) => {
    const draftId = Number(ctx.match[1]);
    const draft = await getPendingDraft(draftId);
    if (!draft) {
      await ctx.answerCbQuery('הטיוטה כבר נסגרה.');
      return;
    }
    await markApproved(draftId);

    const clientTelegramId = await getUserTelegramId(draft.client_user_id);

    if (clientTelegramId) {
      await bot.telegram.sendMessage(clientTelegramId, draft.drafted_reply);
      await markSent(draftId);
    }

    await ctx.answerCbQuery('נשלח ✓');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`✅ נשלח ללקוח #${draft.client_user_id}.`);
  });

  bot.action(/^reject:(\d+)$/, async (ctx) => {
    const draftId = Number(ctx.match[1]);
    await markRejected(draftId);
    await ctx.answerCbQuery('נדחה');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('❌ הטיוטה נדחתה. רוצה לנסח תשובה ידנית? פשוט שלח אותה אליי.');
  });

  // ── Free-text routing ──────────────────────────────────────────────
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    let user: AdelUser;
    try {
      user = await loadUser(ctx.from.id, ctx.from.first_name, true);
    } catch (err) {
      console.error('user lookup failed:', err);
      await ctx.reply('משהו נשבר. נסי שוב בעוד רגע.');
      return;
    }

    // Inline document upload via "!doc <name>\n<content>"
    if (user.role === 'owner' && user.business_id && text.startsWith('!doc ')) {
      const firstNewline = text.indexOf('\n');
      if (firstNewline > 0) {
        const filename = text.slice(5, firstNewline).trim() || 'pasted.txt';
        const content = text.slice(firstNewline + 1);
        await ctx.sendChatAction('typing');
        const result = await ingestDocument({
          businessId: user.business_id,
          uploadedBy: user.id,
          filename,
          mimeType: 'text/plain',
          text: content,
        });
        await ctx.reply(`קלטתי את "${filename}" — ${result.chunkCount} קטעים.`);
        return;
      }
    }

    await ctx.sendChatAction('typing');
    const result = await route({ channel: 'telegram', user, query: text });

    console.log(
      `[u${user.id}/${user.role}] [${result.route}${result.handler ? ' ' + result.handler : ''}] ${result.latencyMs}ms`,
    );

    await ctx.reply(result.reply);

    // If a draft was created for the owner — ping them with approval buttons.
    if (result.route === 'draft_for_owner' && result.draftId && user.business_id) {
      await pingOwnerForApproval(bot, {
        businessId: user.business_id,
        draftId: result.draftId,
        clientName: user.display_name ?? `client #${user.id}`,
        clientQuery: text,
        draftedReply: result.reply === 'אני בודקת מול הצוות ואחזור אליך בהקדם.'
          ? '(טיוטה לא הוצגה ללקוח, ראה ב-DB)'
          : result.reply,
      });
    }
  });

  bot.launch().catch((err) => {
    console.error('telegram launch failed:', err);
    process.exit(1);
  });

  console.log('telegram bot listening — Invisible Admin mode');
  return bot;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function loadUser(
  telegramId: number,
  displayName: string | undefined,
  greetIfNew = false,
): Promise<AdelUser> {
  const { user, isNew } = await findOrCreateByTelegram({
    telegramId,
    displayName,
    adminTelegramId: config.ADEL_ADMIN_TELEGRAM_ID,
  });
  if (isNew && greetIfNew) {
    console.log(`new user: id=${user.id} role=${user.role}`);
  }
  return user;
}

async function pingOwnerForApproval(
  bot: Telegraf,
  args: {
    businessId: number;
    draftId: number;
    clientName: string;
    clientQuery: string;
    draftedReply: string;
  },
): Promise<void> {
  const owner = await getOwnerForBusiness(args.businessId);
  if (!owner?.telegram_id) {
    console.warn(`no owner with telegram_id for business ${args.businessId}`);
    return;
  }

  // Pull the draft fresh so we have the actual drafted_reply (the one
  // that goes to the client), not the holding message.
  const fresh = await getDraft(args.draftId);
  const replyText = fresh?.drafted_reply ?? args.draftedReply;

  const message = [
    `📩 לקוח (${args.clientName}) שאל:`,
    `"${args.clientQuery}"`,
    '',
    `הצעת תשובה:`,
    `"${replyText}"`,
  ].join('\n');

  const sent = await bot.telegram.sendMessage(
    owner.telegram_id,
    message,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ אשר ושלח', `approve:${args.draftId}`),
        Markup.button.callback('❌ דחה', `reject:${args.draftId}`),
      ],
    ]),
  );

  await setOwnerMessageId({
    draftId: args.draftId,
    ownerMessageId: sent.message_id,
  });
}

async function pingOwnerNewClient(bot: Telegraf, client: AdelUser): Promise<void> {
  if (!config.ADEL_ADMIN_TELEGRAM_ID) return;
  await bot.telegram
    .sendMessage(
      config.ADEL_ADMIN_TELEGRAM_ID,
      `👤 לקוח חדש פנה: ${client.display_name ?? '(ללא שם)'} (id=${client.id}). אם זה לקוח שלך: /claim ${client.id} client`,
    )
    .catch(() => {});
}
