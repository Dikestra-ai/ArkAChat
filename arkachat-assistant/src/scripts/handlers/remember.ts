import { bank, type Script } from '../bank.js';
import { remember as causaRemember, type WType } from '../../storage/causa.js';

const remember: Script = {
  name: 'memory.remember',
  category: 'memory',
  matches: (intent) =>
    intent.domain === 'memory' &&
    intent.action === 'remember' &&
    intent.subject !== null,
  run: async (intent, ctx) => {
    const w_type: WType = (intent.w_type ?? 'what') as WType;
    const subject = intent.subject!;
    const location = (intent.params.location as string | undefined) ?? '';
    const content = location || JSON.stringify(intent.params) || ctx.rawQuery;
    await causaRemember({
      user_id: ctx.user.id,
      w_type,
      subject,
      content,
      raw_query: ctx.rawQuery,
    });
    return `שמרתי: ${subject} → ${content}`;
  },
};

bank.register(remember);
