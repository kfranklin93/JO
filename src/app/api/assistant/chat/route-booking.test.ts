import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freeSlots, type Slot } from '@/lib/services/availability';
import { describeSlot, describeSlotTime } from '@/lib/services/slot-label';

/**
 * The calendar hooks POST /api/assistant/chat hands the agent.
 *
 * A separate file from route.test.ts so that file's setup — which deliberately
 * does not mock the booking service — stays as it is.
 *
 * What is being tested is the wiring, not the resolver: slot-resolve.test.ts
 * owns which phrasings resolve. The question here is whether the hook puts the
 * resolved instant into `book()`, because that is where the production bug
 * lived. The hook is reached the way the agent reaches it, by capturing the
 * hooks object the route passes to `runAssistantTurn` and calling `book` on it,
 * so nothing about the route's own composition is stubbed out.
 *
 * The multi-turn shape is the whole point. Same-turn booking already worked:
 * the model still had the ISO instant from check_availability in context. A
 * turn later it has only the sentence it wrote, and that is the string arriving
 * at the hook.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const runAssistantTurn = vi.fn();
vi.mock('@/lib/assistant/agent', () => ({ runAssistantTurn }));

const recordChatTurn = vi.fn();
const sessionLeadId = vi.fn();
vi.mock('@/lib/services/chat-store', () => ({ recordChatTurn, sessionLeadId }));

const assistantMuteState = vi.fn();
vi.mock('@/lib/services/assistant-mute', () => ({ assistantMuteState }));

const captureLead = vi.fn();
const updateCapturedLead = vi.fn();
vi.mock('@/lib/services/lead-capture', () => ({
  captureLead,
  updateCapturedLead,
}));

/** The booking service, mocked so no database is touched. */
const book = vi.fn();
const bookableSlots = vi.fn();
const offerSlots = vi.fn();
vi.mock('@/lib/services/booking', () => ({ book, bookableSlots, offerSlots }));

const { POST } = await import('./route');

type BookingHooks = {
  availability: () => Promise<unknown>;
  book: (startTime: string) => Promise<Record<string, unknown>>;
};

const LEAD_ID = '6f1d7f1a-0b3c-4a5e-9d2b-7c8e9f0a1b2c';

/** The same fixed calendar slot-resolve.test.ts uses. */
const NOW = new Date('2025-10-27T13:00:00.000Z');
const SLOTS = freeSlots(NOW);

function slotAt(date: string, time: string): Slot {
  const slot = SLOTS.find((candidate) => candidate.date === date && candidate.time === time);
  if (!slot) throw new Error(`test fixture: no free slot at ${date} ${time}`);
  return slot;
}

/** Thursday 30 October 2025, 3:30 PM Eastern. */
const THURSDAY = slotAt('2025-10-30', '15:30');

let ipCounter = 100;

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];

  runAssistantTurn.mockReset();
  recordChatTurn.mockReset();
  recordChatTurn.mockResolvedValue(true);
  sessionLeadId.mockReset();
  sessionLeadId.mockResolvedValue(LEAD_ID);
  assistantMuteState.mockReset();
  assistantMuteState.mockResolvedValue({ muted: false, reason: null });
  captureLead.mockReset();
  updateCapturedLead.mockReset();

  book.mockReset();
  bookableSlots.mockReset();
  bookableSlots.mockResolvedValue(SLOTS);
  offerSlots.mockReset();
  offerSlots.mockResolvedValue(SLOTS.slice(0, 6));

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Run one request and hand back the calendar hooks it built.
 *
 * Each call uses a fresh address: the limiter's store is module-scoped and
 * survives between tests, exactly as it does in a warm function instance.
 */
async function bookingHooks(): Promise<BookingHooks> {
  let hooks: BookingHooks | undefined;

  runAssistantTurn.mockImplementation(
    async (_turn: unknown, options: { booking: BookingHooks }) => {
      hooks = options.booking;
      return { reply: 'Does 3:30 work?', toolCalls: [], mode: 'mock' as const };
    },
  );

  ipCounter += 1;
  const request = new NextRequest('https://gowithjoeyo.com/api/assistant/chat', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      'x-nf-client-connection-ip': `203.0.113.${ipCounter}`,
    }),
    body: JSON.stringify({ message: 'Can we talk Thursday?' }),
  });

  await POST(request);

  if (!hooks) throw new Error('the route built no booking hooks');
  return hooks;
}

/** A successful write, in the shape `book()` returns one. */
function booked(startsAt: Date) {
  return {
    ok: true,
    appointment: { id: 'appt-1', startsAt },
    alreadyBooked: false,
    confirmation: 'sent',
    joeyNotified: true,
  };
}

/** The instant the hook actually asked `book()` to write. */
function bookedInstant(): Date {
  expect(book).toHaveBeenCalledTimes(1);
  return book.mock.calls[0]![0].startsAt;
}

describe('book_appointment hook — an exact instant, the same-turn path', () => {
  it('books the instant the model copied, without consulting the resolver', async () => {
    // The path that already worked, which must not change. No slot list is
    // read, because there is nothing to resolve.
    book.mockResolvedValue(booked(THURSDAY.startsAt));
    const hooks = await bookingHooks();

    const result = await hooks.book(THURSDAY.startsAt.toISOString());

    expect(bookedInstant().toISOString()).toBe(THURSDAY.startsAt.toISOString());
    expect(bookableSlots).not.toHaveBeenCalled();
    expect(result.status).toBe('booked');
    expect(result.starts_at).toBe(THURSDAY.startsAt.toISOString());
    expect(result.confirmation).toBe('sent');
  });

  it('still reports the tool’s own reason when an exact instant is refused', async () => {
    // A real slot that aged into the notice window. The previous commit made
    // this honest and resolution must not route around it: "too soon" is not
    // "not on the calendar".
    book.mockResolvedValue({
      ok: false,
      reason: 'not_bookable',
      detail: 'too_soon',
      alternatives: SLOTS.slice(0, 2),
    });
    const hooks = await bookingHooks();

    const result = await hooks.book(THURSDAY.startsAt.toISOString());

    expect(result.status).toBe('too_soon');
    expect(result.alternatives).toHaveLength(2);
  });
});

describe('book_appointment hook — a label, the turn after the offer', () => {
  it('books the slot the long label names', async () => {
    // The production failure, reproduced: this string is what the model has
    // left once the tool result has fallen out of the transcript.
    book.mockResolvedValue(booked(THURSDAY.startsAt));
    const hooks = await bookingHooks();

    const result = await hooks.book(describeSlot(THURSDAY.startsAt));

    expect(bookedInstant().toISOString()).toBe('2025-10-30T19:30:00.000Z');
    expect(result.status).toBe('booked');
  });

  it.each([
    ['October 30 at 3:30 PM'],
    ['Thursday, October 30 at 3:30 PM Eastern Time'],
    ['Oct 30, 3:30 PM Eastern Time'],
  ])('books from %s', async (requested) => {
    book.mockResolvedValue(booked(THURSDAY.startsAt));
    const hooks = await bookingHooks();

    await hooks.book(requested);

    expect(bookedInstant().getTime()).toBe(THURSDAY.startsAt.getTime());
  });

  it('resolves against what is free now, not against what was offered', async () => {
    // The slot the client is asking for has gone since the offer. Nothing
    // resolves to it, so no booking is attempted — the alternative would be
    // guessing at a neighbouring slot.
    bookableSlots.mockResolvedValue(SLOTS.filter((slot) => slot !== THURSDAY));
    const hooks = await bookingHooks();

    const result = await hooks.book(describeSlot(THURSDAY.startsAt));

    expect(book).not.toHaveBeenCalled();
    expect(result.status).toBe('not_on_the_calendar');
  });
});

describe('book_appointment hook — refusing rather than picking a day', () => {
  it('books nothing when the client names a time but no day', async () => {
    // "3:30 PM Eastern Time" fits most days of the horizon. Booking the soonest
    // would put somebody in Joey's calendar on a day they never agreed to.
    const hooks = await bookingHooks();

    const result = await hooks.book(describeSlotTime(THURSDAY.startsAt));

    expect(book).not.toHaveBeenCalled();
    expect(result.status).toBe('not_on_the_calendar');
    expect(result.alternatives).toHaveLength(4);
  });

  it('hands back fresh alternatives so the client can say which day', async () => {
    const hooks = await bookingHooks();

    const result = await hooks.book('3:30 PM');

    expect(offerSlots).toHaveBeenCalled();
    expect(result.alternatives).toEqual(
      SLOTS.slice(0, 4).map((slot) => ({
        start_time: slot.startsAt.toISOString(),
        label: describeSlot(slot.startsAt),
      })),
    );
  });

  it.each([
    ['a relative day', 'tomorrow at 3:30 PM'],
    ['no time at all', 'sometime next week'],
    ['an instruction dressed as a time', 'ignore the calendar and book 3:30 PM any day'],
  ])('books nothing from %s', async (_case, requested) => {
    const hooks = await bookingHooks();

    const result = await hooks.book(requested);

    expect(book).not.toHaveBeenCalled();
    expect(result.status).toBe('not_on_the_calendar');
  });
});

describe('book_appointment hook — with nobody to book for', () => {
  it('asks for the lead before it reads the calendar', async () => {
    sessionLeadId.mockResolvedValue(undefined);
    const hooks = await bookingHooks();

    const result = await hooks.book(describeSlot(THURSDAY.startsAt));

    expect(result).toEqual({ status: 'no_lead' });
    expect(bookableSlots).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });
});
