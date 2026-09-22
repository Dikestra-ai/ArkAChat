import { bank, type Script } from '../bank.js';
import { recall as causaRecall, type WType } from '../../storage/causa.js';

const recall: Script = {
  name: 'memory.recall',
  category: 'memory',
  matches: (intent) =>
    intent.domain === 'memory' &&
    intent.action === 'recall' &&
    intent.subject !== null,
  run: async (intent, ctx) => {
    const subject = intent.subject!;
    const w_type = (intent.w_type ?? undefined) as WType | undefined;
    const hits = await causaRecall({
      userId: ctx.user.id,
      subject,
      ...(w_type ? { w_type } : {}),
    });
    if (hits.length === 0) return `לא זכור לי משהו על "${subject}".`;
    if (hits.length === 1) return hits[0]!.content;
    return hits.map((h, i) => `${i + 1}. ${h.content}`).join('\n');
  },
};

bank.register(recall);
