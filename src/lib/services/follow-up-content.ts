/**
 * Templated follow-up bodies.
 *
 * These exist so the drip can run without an LLM. Previously every touchpoint
 * called Bedrock, which meant an unconfigured or failing model stopped the whole
 * sequence — and Bedrock is unconfigured in production today.
 *
 * ## Why nothing here is HTML-escaped
 *
 * The spec calls for escaping lead-supplied values with the helpers from the
 * untrusted-input-hardening spec. That escaping already happens downstream and
 * doing it here too would corrupt legitimate text.
 *
 * `sendFollowUpEmail` (email-service.ts) passes the body through
 * `formatEmailWithSignature` and then `textToHtml`, and `textToHtml` calls
 * `escapeHtml` on the whole string before adding markup. So a body escaped here
 * would be escaped twice: a name like `O'Brien` becomes `O&#39;Brien`, then
 * `O&amp;#39;Brien`, which renders to the reader as the literal text
 * `O&#39;Brien`. The injection tests below assert inertness through the real
 * send path rather than at this boundary, which is where it actually matters.
 *
 * Subjects are different: they are not HTML and are not passed through
 * `textToHtml`, so they get `sanitizeSubjectValue` to strip line breaks and
 * collapse whitespace. That keeps a pasted multi-line value from producing a
 * mangled subject line.
 */

import type { Lead } from '@/lib/services/follow-up-scheduler';

/**
 * Touchpoints in the sequence.
 *
 * `pastClient60` is carried over from the existing prompt set. It has no
 * scheduling path today, but the type keeps it addressable.
 */
export type FollowUpType =
  | 'immediate'
  | 'day3'
  | 'day7'
  | 'day14'
  | 'day30'
  | 'pastClient60';

export interface FollowUpContent {
  subject: string;
  body: string;
}

/** The lead fields a template actually reads. */
type TemplateLead = Pick<Lead, 'name' | 'intent'> &
  Partial<Pick<Lead, 'location' | 'timeline'>>;

/**
 * Values that stand in for a real name.
 *
 * `'there'` is the literal the cron route substitutes when a lead has no name.
 * Treating it as a name produces subject lines like "Quick check-in, there".
 */
const NON_NAMES = new Set(['there', 'friend', 'n/a', 'na', 'unknown', 'null', 'undefined']);

/** Strip line breaks and collapse runs of whitespace for subject-line use. */
export function sanitizeSubjectValue(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ResolvedRecipient {
  /** A complete greeting line, always safe to use. */
  greeting: string;
  /**
   * The lead's first name, absent when they did not give one.
   *
   * Subject lines must omit the name entirely rather than substitute a
   * placeholder, which is why this is separate from `greeting`.
   */
  firstName?: string;
}

/**
 * Split a lead's name into a usable greeting and an optional first name.
 *
 * A nameless lead gets "Hey there!" — which reads naturally — while subjects
 * that would have interpolated a name drop it instead.
 */
export function resolveRecipient(name: string | undefined): ResolvedRecipient {
  const cleaned = sanitizeSubjectValue(name);
  const first = cleaned.split(' ')[0] ?? '';

  if (!first || NON_NAMES.has(first.toLowerCase())) {
    return { greeting: 'Hey there!' };
  }

  return { greeting: `Hey ${first}!`, firstName: first };
}

/** The area to reference, falling back to Joey's general market. */
function areaFor(lead: TemplateLead): string {
  const location = sanitizeSubjectValue(lead.location);
  return location || 'the Atlanta metro';
}

/**
 * Intent-specific phrasing.
 *
 * Keyed on the canonical `LEAD_INTENTS` set from src/lib/validation/lead.ts.
 */
const INTENT_COPY: Record<
  string,
  { noun: string; opener: string; nextStep: string }
> = {
  buy: {
    noun: 'your home search',
    opener: "Thanks for reaching out about finding a place.",
    nextStep: 'walk through what you\'re looking for and what your budget gets you right now',
  },
  sell: {
    noun: 'selling your place',
    opener: 'Thanks for reaching out about selling.',
    nextStep: 'put together a real number for what your place would list at today',
  },
  invest: {
    noun: 'your investment search',
    opener: 'Thanks for reaching out about investment property.',
    nextStep: 'go through which pockets are actually cash-flowing right now',
  },
  insurance: {
    noun: 'your home insurance',
    opener: 'Thanks for reaching out about insurance.',
    nextStep: 'compare what coverage actually costs for your situation',
  },
  closing: {
    noun: 'your closing',
    opener: 'Thanks for reaching out about closing services.',
    nextStep: 'get your closing timeline mapped out',
  },
  general: {
    noun: 'your real estate plans',
    opener: 'Thanks for reaching out.',
    nextStep: 'figure out the right first move for you',
  },
};

function copyFor(lead: TemplateLead) {
  return INTENT_COPY[lead.intent] ?? INTENT_COPY.general!;
}

/** Joey signs off simply. The signature block is appended by email-service. */
const SIGN_OFF = 'Talk soon,\nJoey';

/**
 * Build the body and subject for a touchpoint.
 *
 * Deliberately claims no history. The previous `day3` and `day14` prompts asked
 * the model to reference earlier conversations and shared resources while
 * `previousMessage` was hardcoded to `'N/A'`, so the model invented them.
 */
export function renderFollowUp(
  lead: TemplateLead,
  type: FollowUpType
): FollowUpContent {
  const { greeting, firstName } = resolveRecipient(lead.name);
  const copy = copyFor(lead);
  const area = areaFor(lead);

  /** Append the name only when there is one. */
  const withName = (base: string): string =>
    firstName ? `${base}, ${firstName}` : base;

  switch (type) {
    case 'immediate':
      return {
        subject: firstName
          ? `Thanks for reaching out, ${firstName}`
          : 'Thanks for reaching out',
        body: `${greeting}

${copy.opener} I got your details and I'm glad you did.

I'd rather not guess at what you need, so here's my suggestion: a quick call, fifteen minutes or so, where we ${copy.nextStep}. No pitch, and no obligation on your end.

What does your schedule look like this week?

${SIGN_OFF}`,
      };

    case 'day3':
      return {
        subject: withName('Quick question about your search'),
        body: `${greeting}

I wanted to follow up on ${copy.noun}. I know these decisions take a while, and there's no rush on my end.

If it's useful, I'm happy to answer specific questions by email — what things are actually selling for in ${area}, how the process works, whatever's on your mind. Sometimes that's easier than a call.

Anything I can dig into for you?

${SIGN_OFF}`,
      };

    case 'day7':
      return {
        subject: `What's happening in ${area}`,
        body: `${greeting}

I keep a close eye on ${area}, and it's been moving in ways worth knowing about if you're still thinking through ${copy.noun}.

Rather than send you a generic market report, I'd rather tell you what's relevant to your situation specifically. That's a short conversation.

Want me to pull the numbers for you?

${SIGN_OFF}`,
      };

    case 'day14':
      return {
        subject: withName('Still here when you need me'),
        body: `${greeting}

Checking in on ${copy.noun}. Plans shift, and timing matters more than most people expect in this market.

If you're ready to move, the next step is simple: we ${copy.nextStep}. If you're not there yet, that's completely fine — I'd just rather you know I'm around than wonder.

Either way, a quick reply tells me how to be useful.

${SIGN_OFF}`,
      };

    case 'day30':
      return {
        subject: withName('Checking in one more time'),
        body: `${greeting}

It's been about a month since you got in touch about ${copy.noun}, so this is my last note unless you'd like me to keep in touch.

If your timeline moved out, no problem at all. And if something changed and you want to pick this back up, just reply and we'll start where you left off.

Either way, I hope it goes well.

${SIGN_OFF}`,
      };

    case 'pastClient60':
      return {
        subject: withName('Hope you\'re settling in'),
        body: `${greeting}

It's been a couple of months now, so I wanted to check in and see how the place is treating you.

If anything's come up, or you need a recommendation for someone reliable, just ask. I'd rather you call me than hunt for someone on the internet.

How's it going so far?

${SIGN_OFF}`,
      };
  }
}
