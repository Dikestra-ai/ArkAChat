import { complete, embed } from '../llm/openrouter.js';
import { searchChunks, type ChunkMatch } from '../storage/documents.js';

const SIMILARITY_THRESHOLD = 0.55;

const RAG_SYSTEM = `אתה עונה על שאלות לקוחות בשם בעל עסק.
מותר לך להסתמך אך ורק על המקורות שיינתנו לך למטה.
אם המקורות לא עונים על השאלה במלואה — אמור זאת בכנות, אל תמציא.
ענה בעברית, קצר וברור (1-3 משפטים), בטון ידידותי-מקצועי.

מקורות:
{{SOURCES}}`;

export interface RagResult {
  answer: string;
  sources: ChunkMatch[];
  grounded: boolean;
}

/**
 * Retrieval-augmented generation over a business's documents.
 * Returns `grounded=false` when no chunk passes the similarity floor —
 * the caller should treat this as "I don't know from the docs" and
 * either fall back to a draft-for-owner-approval, or say so explicitly.
 */
export async function answerFromDocs(args: {
  businessId: number;
  query: string;
  topK?: number;
}): Promise<RagResult> {
  const queryEmbedding = await embed(args.query);
  const matches = await searchChunks({
    businessId: args.businessId,
    queryEmbedding,
    matchCount: args.topK ?? 5,
  });

  const relevant = matches.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);
  if (relevant.length === 0) {
    return {
      answer: '',
      sources: [],
      grounded: false,
    };
  }

  const sourcesBlock = relevant
    .map((m, i) => `[${i + 1}] (${m.filename})\n${m.content}`)
    .join('\n\n---\n\n');

  const answer = await complete({
    system: RAG_SYSTEM.replace('{{SOURCES}}', sourcesBlock),
    user: args.query,
    maxTokens: 400,
    temperature: 0.2,
  });

  return { answer, sources: relevant, grounded: true };
}
