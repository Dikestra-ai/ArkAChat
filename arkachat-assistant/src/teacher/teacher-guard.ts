import { config } from '../config.js';
import type { Intent } from '../intent/types.js';

const backend = config.ADEL_STORAGE_BACKEND === 'supabase'
  ? await import('../storage/supabase/teacher-guard.js')
  : await import('../storage/sqlite/teacher-guard.js');

export const logFallback: (args: {
  userId: number;
  query: string;
  intent: Intent | null;
  llmResponse: string;
}) => Promise<void> = backend.logFallback;
