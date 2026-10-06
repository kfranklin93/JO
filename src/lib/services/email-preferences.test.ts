import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the suppression list.
 *
 * The behaviour worth pinning down is the asymmetry. Everything else in this
 * codebase degrades quietly when the database is unreachable — the chat store
 * swallows its failures, Lofty returns false, Twilio outages are shrugged off.
 * This module does the opposite on the read path and throws, because an
 * unreadable list and an empty list look identical, and guessing "empty" means
 * mailing someone who told us to stop.
 *
 * The write path is the reverse again: clearing a suppression must never fail a
 * lead capture, because the lead is the valuable thing and the fallback is Joey
 * phoning them.
 */

const captured = {
  inserts: [] as Record<string, unknown>[],
  conflicts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  /** Rows the fake select returns. */
  selectRows: [] as unknown[],
  /** Rows the fake update reports as changed. */
  updatedRows: [] as unknown[],
};

let selectFails: Error | null = null;
let updateFails: Error | null = null;
let insertFails: Error | null = null;

vi.mock('@/lib/db', () => {
  /** Drizzle's builder is awaitable and chainable, so each link is a promise. */
  const selectChain = (): any => {
    if (selectFails) {
      const rejected: any = Promise.reject(selectFails);
      // Swallow the unhandled rejection warning; the code under test awaits it.
      rejected.catch(() => {});
      rejected.from = () => rejected;
      rejected.where = () => rejected;
      rejected.limit = () => rejected;
      return rejected;
    }
    const chain: any = Promise.resolve(captured.selectRows);
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => chain;
    return chain;
  };

  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          if (insertFails) {
            // The failure has to surface from the awaited call, not from a
            // missing method. A bare rejected promise here would make
            // `.onConflictDoUpdate(...)` a TypeError, so the test would pass on
            // the wrong error and leave the rejection unhandled.
            const rejected: any = {
              onConflictDoUpdate: () => Promise.reject(insertFails),
              then: (_ok: unknown, fail: (e: unknown) => unknown) => fail(insertFails),
            };
            return rejected;
          }
          captured.inserts.push(value);
          const result: any = Promise.resolve(undefined);
          result.onConflictDoUpdate = (clause: Record<string, unknown>) => {
            captured.conflicts.push(clause);
            return Promise.resolve(undefined);
          };
          return result;
        },
      }),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          captured.updates.push(value);
          const chain: any = {
            where: () => chain,
            returning: () =>
              updateFails
                ? Promise.reject(updateFails)
                : Promise.resolve(captured.updatedRows),
          };
          return chain;
        },
      }),
    },
  };
});

const {
  isSuppressed,
  suppress,
  recordFreshConsent,
  normalizeEmail,
  SuppressionUnavailableError,
} = await import('./email-preferences');

beforeEach(() => {
  captured.inserts = [];
  captured.conflicts = [];
  captured.updates = [];
  captured.selectRows = [];
  captured.updatedRows = [];
  selectFails = null;
  updateFails = null;
  insertFails = null;

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Dana@GoWithJoeyO.com ')).toBe('dana@gowithjoeyo.com');
  });

  it('makes a case variant match a suppressed address', async () => {
    // Local-parts are case-sensitive per the RFC and case-insensitive at every
    // real provider. Honouring the RFC would let Dana@x.com keep receiving mail
    // after dana@x.com unsubscribed.
    captured.selectRows = [{ email: 'dana@x.invalid' }];

    await expect(isSuppressed('DANA@X.invalid')).resolves.toBe(true);
  });
});

describe('isSuppressed', () => {
  it('is false for an address with no opt-out row', async () => {
    await expect(isSuppressed('dana@x.invalid')).resolves.toBe(false);
  });

  it('is true for an address with a live opt-out', async () => {
    captured.selectRows = [{ email: 'dana@x.invalid' }];

    await expect(isSuppressed('dana@x.invalid')).resolves.toBe(true);
  });

  it('throws rather than reporting "not suppressed" when the list is unreadable', async () => {
    // The whole point. Returning false here would mail someone who opted out.
    selectFails = new Error('relation "email_opt_outs" does not exist');

    await expect(isSuppressed('dana@x.invalid')).rejects.toBeInstanceOf(
      SuppressionUnavailableError,
    );
  });

  it('names the fix in the error, because the likely cause is an unapplied migration', async () => {
    selectFails = new Error('relation "email_opt_outs" does not exist');

    await expect(isSuppressed('dana@x.invalid')).rejects.toThrow(
      /email-preferences-schema\.sql/,
    );
  });
});

describe('suppress', () => {
  it('records the address lowercased, with its source', async () => {
    await suppress('Dana@X.invalid', 'one_click');

    expect(captured.inserts[0]).toMatchObject({
      email: 'dana@x.invalid',
      source: 'one_click',
    });
  });

  it('is idempotent, because Gmail may send the one-click POST twice', async () => {
    await suppress('dana@x.invalid', 'one_click');

    expect(captured.conflicts[0]).toMatchObject({
      set: expect.objectContaining({ source: 'one_click' }),
    });
  });

  it('clears a previous resubscribe, so opting out again takes effect', async () => {
    // Without this the row still reads as resubscribed and the address keeps
    // receiving mail after a second unsubscribe.
    await suppress('dana@x.invalid', 'link');

    const set = captured.conflicts[0]?.set as Record<string, unknown>;
    expect(set.resubscribedAt).toBeNull();
    expect(set.resubscribeSource).toBeNull();
  });

  it('propagates a write failure, so no false confirmation is shown', async () => {
    insertFails = new Error('connection terminated');

    await expect(suppress('dana@x.invalid', 'link')).rejects.toThrow();
  });
});

describe('recordFreshConsent', () => {
  it('clears a live suppression and says so', async () => {
    captured.updatedRows = [{ email: 'dana@x.invalid' }];

    await expect(recordFreshConsent('dana@x.invalid', 'form')).resolves.toBe(true);
    expect(captured.updates[0]).toMatchObject({ resubscribeSource: 'form' });
  });

  it('reports false when there was nothing to clear', async () => {
    captured.updatedRows = [];

    await expect(recordFreshConsent('dana@x.invalid', 'form')).resolves.toBe(false);
  });

  it('never throws, because a lead capture must not fail over this', async () => {
    // The lead is the valuable thing. Worst case the person stays suppressed
    // and Joey contacts them by hand.
    updateFails = new Error('relation "email_opt_outs" does not exist');

    await expect(recordFreshConsent('dana@x.invalid', 'form')).resolves.toBe(false);
  });

  it('warns that the person stays suppressed when it could not clear', async () => {
    updateFails = new Error('db down');

    await recordFreshConsent('dana@x.invalid', 'form');

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('stay suppressed'),
      expect.any(Error),
    );
  });
});
