import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANSWER_PLAYBOOK,
} from './answer-playbook-content';
import {
  buildPlaybookDirective,
  builtinPlaybookSource,
  disabledPlaybookSource,
  getPlaybookDirective,
  hardRuleViolations,
  matchPlaybook,
  MIN_MATCH_SCORE,
  normalizeForMatch,
  PENDING_APPROVAL,
  pendingApprovalIds,
  selectServableEntries,
  type AnswerPlaybookSource,
  type PlaybookEntry,
} from './answer-playbook';

/**
 * The playbook's job is to make the assistant say the same approved thing twice.
 * Its more important job is to never say something Joey would have to walk back,
 * which is why the hard-rule guard gets as much attention here as the matcher.
 */

function entry(overrides: Partial<PlaybookEntry> = {}): PlaybookEntry {
  return {
    id: 'test-entry',
    question: 'A test question?',
    keywords: ['secret handshake'],
    answer: 'A safe answer that quotes nothing.',
    approval: PENDING_APPROVAL,
    ...overrides,
  };
}

/** A source that resolves with whatever it was handed. */
function sourceOf(entries: readonly PlaybookEntry[]): AnswerPlaybookSource {
  return { name: 'builtin', load: async () => entries };
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe('normalizeForMatch', () => {
  it('collapses punctuation so hyphenated and spaced spellings agree', () => {
    expect(normalizeForMatch('Pre-Approved?')).toBe(normalizeForMatch('pre approved'));
  });

  it('pads so a substring test is also a whole-word test', () => {
    // The padding is the whole reason `includes` is safe in the matcher.
    expect(normalizeForMatch('reseller')).not.toContain(' sell ');
    expect(normalizeForMatch('I want to sell')).toContain(' sell ');
  });

  it('returns empty for text with nothing matchable in it', () => {
    expect(normalizeForMatch('!!! ??? ...')).toBe('');
  });
});

describe('matchPlaybook — a hit', () => {
  it('returns the entry whose phrase the message contains', () => {
    const entries = [entry({ id: 'a', keywords: ['your commission'] })];

    const match = matchPlaybook("Hi, what's your commission on a sale?", entries);

    expect(match?.entry.id).toBe('a');
    expect(match?.matched).toContain('your commission');
    expect(match?.score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
  });

  it('lets a strong keyword clear the threshold on its own', () => {
    const entries = [entry({ id: 'closing', keywords: [], strongKeywords: ['escrow'] })];

    expect(matchPlaybook('what about escrow', entries)?.entry.id).toBe('closing');
  });

  it('prefers the higher-scoring entry when two could match', () => {
    const entries = [
      entry({ id: 'weak', keywords: ['sell my house'] }),
      entry({ id: 'strong', keywords: ['sell my house', 'how long does it take'] }),
    ];

    expect(matchPlaybook('how long does it take to sell my house', entries)?.entry.id).toBe(
      'strong',
    );
  });

  it('breaks ties by file order so Joey controls priority', () => {
    const entries = [
      entry({ id: 'first', keywords: ['sell my house'] }),
      entry({ id: 'second', keywords: ['sell my house'] }),
    ];

    expect(matchPlaybook('I want to sell my house', entries)?.entry.id).toBe('first');
  });
});

describe('matchPlaybook — no hit', () => {
  it('returns undefined for an unrelated message', () => {
    const entries = [entry({ keywords: ['your commission'] })];

    expect(matchPlaybook('do you know a good plumber', entries)).toBeUndefined();
  });

  it('does not fire on a single common word', () => {
    // One-word matches are why MIN_MATCH_SCORE is 2: 'home' is in almost every
    // message a real estate site receives.
    const entries = [entry({ keywords: ['home', 'sell'] })];

    expect(matchPlaybook('is this a nice home', entries)).toBeUndefined();
  });

  it('returns undefined for an empty playbook and for an empty message', () => {
    expect(matchPlaybook('what is your commission', [])).toBeUndefined();
    expect(matchPlaybook('   ', [entry({ keywords: ['your commission'] })])).toBeUndefined();
  });
});

describe('hard rules outrank the playbook', () => {
  const violating: [string, string][] = [
    ['a dollar figure', 'Joey charges $5,000 flat.'],
    ['a commission rate', 'His commission is 2.5% of the sale.'],
    ['a rate written out', 'We take 3 percent at closing.'],
    ['a promised outcome', 'I guarantee your house sells this month.'],
    ['a promise from Joey', 'Joey will promise you a fast close.'],
    ['tax advice', 'You should deduct that on your return.'],
  ];

  it.each(violating)('flags an answer that quotes %s', (_label, answer) => {
    expect(hardRuleViolations(entry({ answer }))).not.toHaveLength(0);
  });

  it('allows an answer that discusses the topic without quoting a value', () => {
    // The distinction the guard exists to draw: "what's your commission?" is a
    // question the playbook should answer. A rate is the thing it must not say.
    expect(
      hardRuleViolations(
        entry({
          answer:
            "There isn't a published rate, and Joey can't guarantee a number before he sees the place. He'd rather talk it through than quote you a percentage that doesn't apply.",
        }),
      ),
    ).toEqual([]);
  });

  it('withholds a violating entry instead of throwing', () => {
    const entries = [
      entry({ id: 'safe', answer: 'Nothing quoted here.' }),
      entry({ id: 'unsafe', answer: 'It runs about $4,500.' }),
    ];

    expect(selectServableEntries(entries).map((e) => e.id)).toEqual(['safe']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe'));
  });

  it('never injects a violating entry, even when it is the best match', async () => {
    const unsafe = entry({ id: 'unsafe', keywords: ['your commission'], answer: 'It is 3%.' });

    const directive = await getPlaybookDirective('what is your commission', {
      source: sourceOf([unsafe]),
    });

    expect(directive).toBeUndefined();
  });

  it('tells the model the hard rules still win', () => {
    const directive = buildPlaybookDirective({
      entry: entry(),
      score: 2,
      matched: ['secret handshake'],
    });

    // The directive lands after the hard rules in the system context, and later
    // instructions carry more weight — so the precedence has to be restated.
    expect(directive).toMatch(/HARD RULES above still take precedence/);
    expect(directive).toMatch(/follow the hard rules instead/);
  });
});

describe('getPlaybookDirective', () => {
  it('injects the matched answer verbatim', async () => {
    const e = entry({
      question: 'What do you charge?',
      keywords: ['what do you charge'],
      answer: 'Joey talks that through with you directly.',
    });

    const directive = await getPlaybookDirective('hey, what do you charge?', {
      source: sourceOf([e]),
    });

    expect(directive).toContain('Joey talks that through with you directly.');
    expect(directive).toContain('What do you charge?');
  });

  it('returns undefined when nothing matches', async () => {
    const directive = await getPlaybookDirective('do you know a good plumber', {
      source: sourceOf([entry({ keywords: ['your commission'] })]),
    });

    expect(directive).toBeUndefined();
  });

  it('returns undefined when the source loads nothing', async () => {
    expect(
      await getPlaybookDirective('what is your commission', {
        source: disabledPlaybookSource,
      }),
    ).toBeUndefined();
  });

  it('survives a source that fails to load', async () => {
    // A playbook that cannot load costs the assistant its consistency. It must
    // not cost it the reply.
    const broken: AnswerPlaybookSource = {
      name: 'builtin',
      load: async () => {
        throw new Error('content module missing');
      },
    };

    await expect(
      getPlaybookDirective('what is your commission', { source: broken }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('failed to load'),
      expect.any(Error),
    );
  });
});

describe('the shipped content', () => {
  it('loads through the built-in source', async () => {
    await expect(builtinPlaybookSource.load()).resolves.toBe(ANSWER_PLAYBOOK);
  });

  it('ships between 8 and 12 entries with unique ids', () => {
    expect(ANSWER_PLAYBOOK.length).toBeGreaterThanOrEqual(8);
    expect(ANSWER_PLAYBOOK.length).toBeLessThanOrEqual(12);
    expect(new Set(ANSWER_PLAYBOOK.map((e) => e.id)).size).toBe(ANSWER_PLAYBOOK.length);
  });

  it('breaks no hard rule, so every entry is servable', () => {
    const offenders = ANSWER_PLAYBOOK.filter((e) => hardRuleViolations(e).length > 0).map(
      (e) => `${e.id}: ${hardRuleViolations(e).join(', ')}`,
    );

    expect(offenders).toEqual([]);
  });

  it('is marked as awaiting Joey’s sign-off', () => {
    expect(pendingApprovalIds(ANSWER_PLAYBOOK)).toEqual(ANSWER_PLAYBOOK.map((e) => e.id));
  });

  it.each([
    ['are you a bot or a real person?', 'am-i-talking-to-a-bot'],
    ['what is your commission?', 'commission-and-fees'],
    // Found live: this phrasing matched nothing, so the model answered from the
    // base prompt and drifted off Joey's register.
    ['what percent commission do you charge?', 'commission-and-fees'],
    ['just give me a number, what do you charge?', 'commission-and-fees'],
    ['how much is my house worth?', 'home-valuation'],
    ['do I need to be pre-approved first?', 'pre-approval-first'],
    ["I'm a first time home buyer, where do I start?", 'first-time-buyer'],
    ['how long does it take to sell a place around here?', 'how-long-to-sell'],
    ['do you work in Marietta?', 'service-area'],
    ['are you a licensed agent?', 'who-is-joey'],
    ['looking for an investment property with good cash flow', 'investment-property'],
    ['can you help with homeowners insurance?', 'insurance-help'],
    ['what happens at closing, and who handles escrow?', 'closing-services'],
    ['can I book a call with Joey?', 'book-a-call'],
  ])('answers %j with the %s entry', (message, expectedId) => {
    expect(matchPlaybook(message, ANSWER_PLAYBOOK)?.entry.id).toBe(expectedId);
  });

  it('stays quiet on a message no entry covers', () => {
    expect(
      matchPlaybook('my neighbour keeps parking across my driveway', ANSWER_PLAYBOOK),
    ).toBeUndefined();
  });
});
