/**
 * Assistant Answer Playbook — Joey's answers to the questions clients actually
 * ask, matched by keyword and handed to the model as a directive.
 *
 * ## Why this exists
 *
 * The system prompt gives the assistant a voice and a set of guardrails, but it
 * gives it no *answers*. Ask the same question twice and you get two different
 * replies, both invented on the spot from whatever the prompt implies. For the
 * dozen questions that make up most first contacts — commission, pre-approval,
 * "what's my house worth", "am I talking to a bot" — Joey should be the one
 * deciding what the answer is, once, in writing.
 *
 * ## Why keywords and not embeddings
 *
 * A vector index would match more questions, and it would also be a second
 * service to run, a build step to keep in sync, and a silent failure mode when
 * the nearest neighbour is merely nearest rather than right. Keyword matching is
 * a pure function of two strings: Joey can read an entry and know exactly which
 * messages reach it, and a wrong match is debuggable by eye. When the match
 * misses, nothing breaks — the model answers from the base prompt as it does
 * today. That is the failure the design optimizes for.
 *
 * ## Content is data
 *
 * The entries live in ./answer-playbook-content.ts, in the same spirit as
 * src/lib/services/follow-up-content.ts: prose Joey edits, kept out of the
 * module that decides when to use it. Nothing here parses or interprets the
 * answers beyond the hard-rule guard below.
 *
 * ## Hard rules outrank the playbook
 *
 * An approved answer is not a licence to break the prompt's HARD RULES. Two
 * things enforce that:
 *
 *  1. `hardRuleViolations` inspects every entry at load time and drops any that
 *     quote a figure, promise an outcome, or hand out legal or tax advice. A bad
 *     edit to the content file therefore disables that one entry rather than
 *     shipping a price quote in Joey's name.
 *  2. The injected directive restates the precedence in words, because the model
 *     sees the playbook text *after* the hard rules and later text carries
 *     weight.
 *
 * ## On {{APPROVED_BY_JOEY}}
 *
 * The seed entries ship marked `PENDING_APPROVAL`, following the
 * {{PLACEHOLDER}} convention already used in ./system-prompt.ts: the wording is
 * drafted and safe, but it is not yet Joey's. Pending entries are still served,
 * for the same reason the system prompt ships with unfilled placeholders — a
 * dark feature teaches you nothing. What review buys is voice and factual
 * accuracy, which no regex can check; what the guard buys is that an unreviewed
 * answer still cannot quote a price. Approving one is a one-line edit: replace
 * the marker with a name and date.
 */

import { env } from '@/config/env';

/** Marker meaning "Joey has not signed off on this wording yet." */
export const PENDING_APPROVAL = '{{APPROVED_BY_JOEY}}';

export interface PlaybookEntry {
  /** Stable id. Used in logs and in the pending-approval report. */
  id: string;
  /** The question as Joey would file it. Shown to the model for context. */
  question: string;
  /**
   * Words and phrases that support a match. A matched keyword scores its own
   * word count, so phrases outrank stray single words.
   */
  keywords: string[];
  /**
   * Words that are decisive on their own — a single hit clears the threshold.
   * Reserve these for terms that mean nothing else in a real estate chat
   * ('escrow', 'preapproval'), never for common ones ('home', 'price').
   */
  strongKeywords?: string[];
  /** The answer, in Joey's voice. Quotes no figures and promises no outcomes. */
  answer: string;
  /** `PENDING_APPROVAL`, or whoever signed off and when. */
  approval: string;
}

export interface PlaybookMatch {
  entry: PlaybookEntry;
  /** Total weight of the matched keywords. */
  score: number;
  /** Which keywords hit, for logging and for tests. */
  matched: string[];
}

/**
 * Weight a match needs before the playbook speaks.
 *
 * Two is deliberately low but not one: a single common word ('home', 'sell')
 * appears in nearly every message, so one-word matches would fire constantly on
 * the wrong entry. One *phrase*, or one term from `strongKeywords`, is enough.
 */
export const MIN_MATCH_SCORE = 2;

/**
 * Reduce text to space-separated lowercase alphanumerics, padded with single
 * spaces so a substring test is also a whole-word test.
 *
 * Padding is what makes `includes` safe here: ' sell ' cannot match inside
 * 'reseller'. Collapsing punctuation is what makes 'pre-approved', 'pre
 * approved' and 'Pre‑Approved?' the same input.
 *
 * Returns '' for text with no alphanumerics, which no keyword can match.
 */
export function normalizeForMatch(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return cleaned ? ` ${cleaned} ` : '';
}

/** Word count of a keyword after normalization; 0 if it normalizes to nothing. */
function keywordWeight(keyword: string): number {
  const normalized = normalizeForMatch(keyword).trim();
  return normalized ? normalized.split(' ').length : 0;
}

/**
 * Score one entry against an already-normalized message.
 *
 * Every matched keyword contributes, so a message hitting three phrases beats
 * one hitting a single phrase. `strongKeywords` each contribute the full
 * threshold rather than their word count.
 */
function scoreEntry(
  entry: PlaybookEntry,
  normalizedMessage: string,
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];

  for (const keyword of entry.strongKeywords ?? []) {
    const normalized = normalizeForMatch(keyword);
    if (normalized && normalizedMessage.includes(normalized)) {
      score += MIN_MATCH_SCORE;
      matched.push(keyword);
    }
  }

  for (const keyword of entry.keywords) {
    const normalized = normalizeForMatch(keyword);
    if (normalized && normalizedMessage.includes(normalized)) {
      score += keywordWeight(keyword);
      matched.push(keyword);
    }
  }

  return { score, matched };
}

/**
 * Best-scoring entry for a message, or undefined when nothing clears
 * `MIN_MATCH_SCORE`.
 *
 * Ties go to the earlier entry, so file order is the priority order Joey
 * controls.
 */
export function matchPlaybook(
  message: string,
  entries: readonly PlaybookEntry[],
): PlaybookMatch | undefined {
  const normalized = normalizeForMatch(message);
  if (!normalized) return undefined;

  let best: PlaybookMatch | undefined;

  for (const entry of entries) {
    const { score, matched } = scoreEntry(entry, normalized);
    if (score < MIN_MATCH_SCORE) continue;
    if (!best || score > best.score) best = { entry, score, matched };
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * Hard-rule guard
 *
 * These patterns look for a *quoted value*, not for a topic. "What's your
 * commission?" is a question the playbook should absolutely answer; "my
 * commission is 3%" is the thing it must never say. Topic-based checks would
 * have rejected the useful entries and kept none of the safety.
 * ------------------------------------------------------------------ */

interface HardRuleCheck {
  id: string;
  /** Phrased to complete "this answer ...", for the warning line. */
  explain: string;
  pattern: RegExp;
}

const HARD_RULE_CHECKS: readonly HardRuleCheck[] = [
  {
    id: 'quoted-money',
    explain: 'quotes a dollar figure',
    // Requires a digit, so "no published price" and "$0 down talk" phrasing
    // without numerals stay allowed.
    pattern: /\$\s?\d/,
  },
  {
    id: 'quoted-rate',
    explain: 'quotes a percentage or commission rate',
    // Also digit-anchored: "a percentage of the sale" does not match.
    pattern: /\d+(?:\.\d+)?\s*(?:%|percent\b)/i,
  },
  {
    id: 'promised-outcome',
    explain: 'promises or guarantees an outcome',
    // Affirmative forms only. "I can't guarantee that" does not match, because
    // the word after the pronoun is neither 'can'/'will' nor the verb itself.
    pattern: /\b(?:i|we|joey|he)\s+(?:can\s+|will\s+)?(?:guarantee|promise)\b/i,
  },
  {
    id: 'directive-legal-or-tax-advice',
    explain: 'gives legal or tax advice directly',
    pattern: /\byou\s+(?:should|must|need\s+to|have\s+to)\s+(?:claim|deduct|file|sue|dispute|write\s+off)\b/i,
  },
];

/**
 * Hard rules the entry's answer breaks, as human-readable strings. Empty means
 * the entry is safe to serve.
 */
export function hardRuleViolations(entry: PlaybookEntry): string[] {
  return HARD_RULE_CHECKS.filter((check) => check.pattern.test(entry.answer)).map(
    (check) => `${check.id}: ${check.explain}`,
  );
}

/* ------------------------------------------------------------------ *
 * Sources
 *
 * Mirrors the FollowUpContentSource seam in
 * src/lib/services/follow-up-content.ts: one interface, an env var that picks
 * an implementation, and a deferred import so the content file stays out of the
 * module graph when the playbook is off.
 * ------------------------------------------------------------------ */

export interface AnswerPlaybookSource {
  readonly name: 'builtin' | 'off';
  load(): Promise<readonly PlaybookEntry[]>;
}

/** The default: the entries committed alongside this file. */
export const builtinPlaybookSource: AnswerPlaybookSource = {
  name: 'builtin',
  async load() {
    const { ANSWER_PLAYBOOK } = await import('./answer-playbook-content');
    return ANSWER_PLAYBOOK;
  },
};

/** An escape hatch for turning the playbook off without a deploy of new code. */
export const disabledPlaybookSource: AnswerPlaybookSource = {
  name: 'off',
  async load() {
    return [];
  },
};

/** The source in effect for this deployment. Built-in unless explicitly off. */
export function getAnswerPlaybookSource(): AnswerPlaybookSource {
  return env.ASSISTANT_ANSWER_PLAYBOOK === 'off'
    ? disabledPlaybookSource
    : builtinPlaybookSource;
}

/**
 * Entries safe to serve: hard-rule violators removed, each one logged.
 *
 * Dropping rather than throwing is the point. A careless edit to one answer
 * costs that one answer, not every conversation on the site.
 */
export function selectServableEntries(
  entries: readonly PlaybookEntry[],
): readonly PlaybookEntry[] {
  return entries.filter((entry) => {
    const violations = hardRuleViolations(entry);
    if (violations.length === 0) return true;
    console.warn(
      `[assistant:playbook] entry "${entry.id}" withheld — ${violations.join('; ')}`,
    );
    return false;
  });
}

/** Ids still carrying the {{APPROVED_BY_JOEY}} marker. */
export function pendingApprovalIds(entries: readonly PlaybookEntry[]): string[] {
  return entries
    .filter((entry) => entry.approval === PENDING_APPROVAL)
    .map((entry) => entry.id);
}

/* ------------------------------------------------------------------ *
 * Directive
 * ------------------------------------------------------------------ */

/**
 * The matched answer, phrased as an instruction appended to the system prompt.
 *
 * It closes by restating that the hard rules win. That sentence is doing real
 * work: this text lands after the rules in the system context, and the model
 * weights later instructions more heavily.
 */
export function buildPlaybookDirective(match: PlaybookMatch): string {
  return `## APPROVED ANSWER FOR THIS QUESTION

Joey has already written and approved an answer to what this person just asked.
Use its substance, and stay close to its wording. Adapt the greeting, the length
and the order to fit the conversation — but do not add facts it does not contain,
and do not contradict it.

Question, as Joey filed it: ${match.entry.question}

Joey's approved answer:
"""
${match.entry.answer}
"""

The HARD RULES above still take precedence over this answer. If using it would
mean quoting a price, commission or fee, promising an outcome, or giving legal,
tax or financial advice, follow the hard rules instead and offer to have Joey
confirm personally.`;
}

/**
 * The directive for a message, or undefined when the playbook has nothing to
 * say.
 *
 * Matching looks only at the newest user message, not the history. A playbook
 * entry answers a question that was just asked; scanning the transcript would
 * keep re-injecting the answer to a topic the conversation has moved past.
 *
 * Every failure path returns undefined. A playbook that cannot load must cost
 * the assistant its consistency, never its ability to reply.
 */
export async function getPlaybookDirective(
  message: string,
  options?: { source?: AnswerPlaybookSource },
): Promise<string | undefined> {
  const source = options?.source ?? getAnswerPlaybookSource();

  let entries: readonly PlaybookEntry[];
  try {
    entries = await source.load();
  } catch (err) {
    console.error(
      `[assistant:playbook] source "${source.name}" failed to load; answering from the base prompt:`,
      err,
    );
    return undefined;
  }

  if (entries.length === 0) return undefined;

  const servable = selectServableEntries(entries);

  if (process.env.NODE_ENV === 'development') {
    const pending = pendingApprovalIds(servable);
    if (pending.length > 0) {
      console.warn(
        `[assistant:playbook] ${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} awaiting Joey's sign-off: ${pending.join(', ')}`,
      );
    }
  }

  const match = matchPlaybook(message, servable);
  if (!match) return undefined;

  return buildPlaybookDirective(match);
}
