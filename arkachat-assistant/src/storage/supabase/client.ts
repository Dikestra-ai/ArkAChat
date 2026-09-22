import { createClient } from '@supabase/supabase-js';
import { config } from '../../config.js';

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase storage selected but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing');
}

export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
