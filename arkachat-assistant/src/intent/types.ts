import { z } from 'zod';

export const wTypes = [
  'what', 'where', 'when', 'who', 'why', 'how', 'how_much',
] as const;

export const intentSchema = z.object({
  domain: z.string(),
  action: z.string(),
  w_type: z.enum(wTypes).nullable(),
  subject: z.string().nullable(),
  params: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
});

export type Intent = z.infer<typeof intentSchema>;
