import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;

const schema = z.object({
  // Storage backend. SQLite is the default for local MVP / demos.
  // Supabase remains available for future hosted / multi-tenant deployment.
  ADEL_STORAGE_BACKEND: z.enum(['sqlite', 'supabase']).default('sqlite'),
  SQLITE_DB_PATH: z.string().default('./data/adel.db'),

  // OpenRouter — single key, gives access to Claude / GPT / Gemini / Llama / etc.
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),

  TELEGRAM_BOT_TOKEN: z.string().min(1),

  // Required only when ADEL_STORAGE_BACKEND=supabase.
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  // Optional: Telegram ID of an admin for alerts / pending_scripts review.
  ADEL_ADMIN_TELEGRAM_ID: z.coerce.number().int().positive().optional(),

  // Calendar backend. 'stub' uses in-memory demo events (for the pitch).
  CALENDAR_BACKEND: z.enum(['stub', 'google']).default('stub'),

  // ArkAChat SimpleX bridge (optional — only when arkachat-proxy is running).
  ARKACHAT_PROXY_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ARKACHAT_BRIDGE_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),

  // Gibraltar-Code coordination session name.
  GIBRALTAR_SESSION_NAME: z.string().default('assistant'),

  // Lightweight HTTP API port (CausaDB + Reasoning queries from web layer).
  ADEL_HTTP_PORT: z.coerce.number().int().positive().default(3333),
}).superRefine((env, ctx) => {
  if (env.ADEL_STORAGE_BACKEND === 'supabase') {
    if (!env.SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required when ADEL_STORAGE_BACKEND=supabase',
      });
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'SUPABASE_SERVICE_ROLE_KEY is required when ADEL_STORAGE_BACKEND=supabase',
      });
    }
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
