import { complete } from '../llm/openrouter.js';
import { intentSchema, type Intent } from './types.js';

const SYSTEM = `אתה מסווג כוונות עבור עוזרת אישית בשם Adel. המשתמש כותב בעברית או באנגלית.

המשימה שלך: לחלץ מההודעה JSON אחד בלבד עם השדות הבאים:
- domain: התחום (memory, calendar, weather, transit, food, contacts, generic)
- action: הפעולה (remember, recall, query, schedule, ...)
- w_type: שאלת CausaDB (what, where, when, who, why, how, how_much) או null אם זה לא שאלה
- subject: הנושא הקצר (1-3 מילים) או null
- params: אובייקט עם פרמטרים נוספים (תאריכים, שמות, ערכים)
- confidence: 0-1 כמה אתה בטוח

החזר JSON בלבד, ללא טקסט נוסף, ללא code fences.

דוגמאות:
"תזכרי ששמתי את הדרכון במגירה" →
{"domain":"memory","action":"remember","w_type":"where","subject":"דרכון","params":{"location":"המגירה"},"confidence":0.95}

"איפה הדרכון שלי?" →
{"domain":"memory","action":"recall","w_type":"where","subject":"דרכון","params":{},"confidence":0.95}

"מה מזג האוויר היום?" →
{"domain":"weather","action":"query","w_type":"what","subject":"מזג אוויר","params":{"when":"today"},"confidence":0.9}`;

export async function classify(message: string): Promise<Intent | null> {
  const raw = await complete({ system: SYSTEM, user: message, maxTokens: 300 });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return intentSchema.parse(parsed);
  } catch (err) {
    console.error('intent parse failed:', err, '\nraw:', raw);
    return null;
  }
}
