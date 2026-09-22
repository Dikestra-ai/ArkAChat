/**
 * Calendar adapter — read-only for MVP.
 *
 * Backends:
 *   - 'stub' (default): in-memory demo events. Lets us run the demo
 *     without Google OAuth setup.
 *   - 'google': real Google Calendar via OAuth refresh token. To enable,
 *     set GOOGLE_CALENDAR_ID + GOOGLE_OAUTH_REFRESH_TOKEN +
 *     GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in .env, then
 *     wire it in (left as a TODO; the stub is enough for the pitch).
 */

import { config } from '../config.js';

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | undefined;
}

interface CalendarAdapter {
  listUpcoming(opts: { fromDate: Date; days: number }): Promise<CalendarEvent[]>;
  findFreeSlots(opts: {
    fromDate: Date;
    days: number;
    durationMinutes: number;
    workdayStartHour?: number;
    workdayEndHour?: number;
  }): Promise<{ start: Date; end: Date }[]>;
}

class StubCalendar implements CalendarAdapter {
  private events: CalendarEvent[];

  constructor() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = (offset: number, hour: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      return d;
    };

    this.events = [
      {
        id: 'evt_1',
        title: 'פגישה עם דני — אתר רחביה',
        startsAt: day(1, 10),
        endsAt: day(1, 11),
        location: 'רחביה',
      },
      {
        id: 'evt_2',
        title: 'מדידה — דירת המוצר',
        startsAt: day(2, 14),
        endsAt: day(2, 16),
      },
      {
        id: 'evt_3',
        title: 'פגישת ספק — חומרי גלם',
        startsAt: day(3, 9),
        endsAt: day(3, 10),
      },
    ];
  }

  async listUpcoming(opts: { fromDate: Date; days: number }): Promise<CalendarEvent[]> {
    const until = new Date(opts.fromDate);
    until.setDate(until.getDate() + opts.days);
    return this.events
      .filter((e) => e.startsAt >= opts.fromDate && e.startsAt <= until)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async findFreeSlots(opts: {
    fromDate: Date;
    days: number;
    durationMinutes: number;
    workdayStartHour?: number;
    workdayEndHour?: number;
  }): Promise<{ start: Date; end: Date }[]> {
    const startHour = opts.workdayStartHour ?? 9;
    const endHour = opts.workdayEndHour ?? 18;
    const events = await this.listUpcoming({
      fromDate: opts.fromDate,
      days: opts.days,
    });

    const slots: { start: Date; end: Date }[] = [];
    for (let d = 0; d < opts.days; d++) {
      const dayStart = new Date(opts.fromDate);
      dayStart.setDate(dayStart.getDate() + d);
      dayStart.setHours(startHour, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(endHour, 0, 0, 0);

      const dayEvents = events
        .filter((e) => e.startsAt.toDateString() === dayStart.toDateString())
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

      let cursor = dayStart;
      for (const e of dayEvents) {
        if (e.startsAt.getTime() - cursor.getTime() >= opts.durationMinutes * 60_000) {
          slots.push({ start: new Date(cursor), end: new Date(e.startsAt) });
        }
        if (e.endsAt > cursor) cursor = e.endsAt;
      }
      if (dayEnd.getTime() - cursor.getTime() >= opts.durationMinutes * 60_000) {
        slots.push({ start: new Date(cursor), end: new Date(dayEnd) });
      }
    }

    return slots;
  }
}

let adapter: CalendarAdapter | null = null;

export function getCalendar(): CalendarAdapter {
  if (adapter) return adapter;
  // For MVP, stub is the default. Swap to a real Google adapter when
  // GOOGLE_OAUTH_REFRESH_TOKEN is wired through config.
  if (config.CALENDAR_BACKEND === 'google') {
    throw new Error(
      'Google Calendar backend not implemented yet. Use CALENDAR_BACKEND=stub for the demo.',
    );
  }
  adapter = new StubCalendar();
  return adapter;
}

export function formatEvent(e: CalendarEvent, timezone = 'Asia/Jerusalem'): string {
  const fmt = new Intl.DateTimeFormat('he-IL', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${fmt.format(e.startsAt)} — ${e.title}`;
}
