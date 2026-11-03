import { describe, expect, it } from 'vitest';
import { LEAD_INTENTS } from '@/lib/validation/lead';
import { getSystemPrompt, SYSTEM_PROMPT } from './system-prompt';

/**
 * The prompt is the only place the model learns what to collect and what the
 * intent values mean, so the alignment with `leadSubmissionSchema` has to hold
 * here too. A tool schema the model is told to use differently is still a
 * mismatch — it just fails at the model's discretion instead of at validation.
 */

const FACTS = {
  SITE_NAME: 'Joey O. Real Estate',
  SERVICE_AREA: 'Greater Atlanta',
  SERVICE_AREA_LIST: 'Atlanta, Marietta, Decatur',
  BUYER_SERVICES_SUMMARY: 'Full buyer representation.',
  SELLER_SERVICES_SUMMARY: 'Listing, staging, and pricing.',
  GUIDE_SUMMARY: "A first-time buyer's guide.",
  TEAM_SUMMARY: 'Joey and a small team.',
};

const prompt = getSystemPrompt(FACTS);

describe('system prompt — lead capture instructions', () => {
  it('describes the services in the repo vocabulary', () => {
    expect(prompt).toContain(
      'buying or selling / investing / insurance / closing services /'
    );
    expect(prompt).toContain('general question');
  });

  it('names every canonical intent value', () => {
    for (const intent of LEAD_INTENTS) {
      expect(prompt).toMatch(new RegExp(`^\\s*- ${intent} —`, 'm'));
    }
  });

  it('no longer offers the vocabulary the schema rejects', () => {
    expect(prompt).not.toContain('selling / both');
    expect(prompt).not.toContain('buying_and_selling');
    expect(prompt).not.toContain('general_question');
  });

  it('asks for name and email early, before capture_lead', () => {
    expect(prompt).toMatch(/name and email EARLY/);
    expect(prompt).toMatch(/Required before you call it: name, email, intent, notes/);
  });

  it('no longer treats a phone number as a substitute for an email', () => {
    // The schema requires an email, so "email or phone" was an instruction to
    // produce a payload that could not validate.
    expect(prompt).not.toContain('email or phone');
  });

  it('insists on one primary intent with the rest in notes', () => {
    expect(prompt).toMatch(/PRIMARY goal/);
    expect(prompt).toMatch(/describe the rest in notes/);
    expect(prompt).toMatch(/Never split it across two capture_lead calls/);
  });

  it('forbids the word "commission" and names the replacement', () => {
    // Joey's explicit instruction. Observed live: with only the playbook answer
    // in play, the model mirrored the client's "commission" back and overwrote
    // his "compensation" — so the rule has to be in the prompt, not just in the
    // answer text. The prompt also used to say "commissions" itself, which was
    // priming the substitution.
    expect(prompt).toMatch(/NEVER say "commission"/);
    expect(prompt).toMatch(/compensation/);
    expect(prompt).not.toMatch(/quote prices, commissions/);
  });

  it('forbids inventing a value to satisfy the tool', () => {
    expect(prompt).toMatch(/do NOT put\s+a placeholder, a guess/);
    expect(prompt).toMatch(/Never satisfy it by making a\s+value up/);
  });

  it('tells the assistant to re-ask and retry after an errored capture', () => {
    expect(prompt).toMatch(/If capture_lead comes back as an error/);
    expect(prompt).toMatch(/call capture_lead again with their answer/);
  });
});

/**
 * The booking rules are the model's half of a two-part guard. The booking
 * service re-derives availability before it writes, so an invented instant is
 * refused — but the refusal comes after the client has already been told
 * "Thursday at 2". Only the prompt can prevent the sentence.
 */
describe('system prompt — booking instructions', () => {
  /** Just the booking section, so the assertions below cannot pass on other text. */
  const section = prompt.slice(
    prompt.indexOf('## BOOKING A CONSULTATION'),
    prompt.indexOf('## HARD RULES'),
  );

  it('has a booking section at all', () => {
    expect(prompt).toContain(
      '## BOOKING A CONSULTATION (check_availability, book_appointment)',
    );
    expect(section.length).toBeGreaterThan(0);
  });

  it('requires check_availability before any time is offered', () => {
    expect(section).toMatch(
      /Call check_availability BEFORE you offer or confirm any time/,
    );
    expect(section).toMatch(/offer ONLY\s+the times the MOST RECENT check_availability result returned/);
  });

  /**
   * Observed live: the assistant offered 3:00–4:45 PM, refused the client's
   * 3:15, and re-listed 3:15 in the same message. The old instruction — offer
   * only times check_availability returned "in this conversation" — is what
   * permitted it, because a list from three turns earlier satisfies that.
   */
  it('confines the model to the newest availability result, not the conversation', () => {
    expect(section).toMatch(/An earlier list in this conversation is stale/);
    expect(section).toMatch(
      /Call check_availability again before every new offer/,
    );
    expect(section).toMatch(/Never scroll back to a list you already gave/);
    expect(prompt).toMatch(
      /NEVER present a day or a time as available unless check_availability returned\s+it in its most recent result/,
    );
  });

  /**
   * The multi-turn failure, which the staleness rule above did not cover.
   *
   * Nothing persists a tool call: `chat_messages` holds a role and text, and
   * the chat route replays only that. So a turn after check_availability ran,
   * the ISO instants are gone from the model's context and its only trace of
   * them is the sentence it wrote — "3:00 PM Eastern Time". Asked to book, it
   * passes that label, which is not on the slot grid, and a client who picked a
   * free slot is told it is unavailable. The server now resolves such a label
   * back to a free slot, but this rule is the primary fix: with a fresh call in
   * the same turn the model has real values to copy.
   */
  it('requires a fresh check_availability in the same turn as a booking', () => {
    expect(section).toMatch(
      /Call check_availability again in the SAME reply as book_appointment/,
    );
    expect(section).toMatch(/take\s+the start_time from that fresh result/);
    expect(section).toMatch(
      /Do not rebuild a\s+start_time out of something you said earlier in the conversation/,
    );
  });

  it('keeps the order when the client picks a time from an older message', () => {
    expect(section).toMatch(
      /check_availability first, find their choice in what it returns now/,
    );
  });

  it('makes it ask which day rather than choose one', () => {
    // A bare "3:30 PM" names a time and not a day, and 3:30 is free on most
    // days of the horizon. Picking one would book somebody onto a day they
    // never agreed to, which is worse than one more question.
    expect(section).toMatch(/If the client names a time without a day/);
    expect(section).toMatch(/ask which day before you book/);
    expect(section).toMatch(/do not pass a day-less time to book_appointment/);
  });

  it('forbids re-offering a slot it has already called unavailable', () => {
    expect(section).toMatch(
      /NEVER offer a time again once you have told the client it was unavailable/,
    );
    expect(section).toMatch(/If it reappears in a later\s+check_availability result, skip it/);
  });

  /**
   * The other half of the same failure. The prompt used to say that for
   * slot_taken, not_available or unavailable the model should "say so plainly —
   * somebody got there first, or that time cannot be held", which handed it
   * both explanations for every failure. It picked the false one and told a
   * client their slot had been taken while the appointments table was empty.
   */
  it('makes the model relay the tool’s reason rather than narrate one', () => {
    expect(section).toMatch(/its result carries a "reason"\s+field/);
    expect(section).toMatch(/Relay THAT reason to the client, in those words/);
    expect(section).toMatch(/Do not compose your\s+own explanation/);
    expect(section).toMatch(
      /only\s+say somebody else booked it when the reason says somebody else booked it/,
    );
  });

  it('no longer offers the model a menu of explanations for a failure', () => {
    expect(section).not.toMatch(/somebody got there first, or that time cannot be held/);
  });

  it('gates the confirmation-email claim on the tool’s actual outcome', () => {
    // The complaint that started this: the assistant said a confirmation email
    // had been sent when no email code existed in the booking path at all.
    expect(section).toMatch(/A booked result carries "confirmation_email"/);
    expect(section).toMatch(
      /Say a confirmation email has\s+been sent ONLY when that value is "sent"/,
    );
    expect(prompt).toMatch(
      /NEVER tell a client a confirmation email was sent unless book_appointment\s+returned confirmation_email "sent"/,
    );
  });

  it('forbids describing availability from memory', () => {
    expect(section).toMatch(/Never describe availability from memory/);
  });

  it('puts capture_lead before book_appointment', () => {
    expect(section).toMatch(/capture_lead must have succeeded first/);
    expect(section).toMatch(/capture the lead\s+before you reach for book_appointment/);
  });

  it('forbids claiming a booking that did not happen', () => {
    expect(section).toMatch(/Never\s+claim a booking that did not happen/);
    expect(section).toMatch(/never re-offer the time that\s+just\s+failed/);
    expect(prompt).toMatch(
      /NEVER tell a client a time is booked unless book_appointment returned booked/,
    );
  });

  it('shows a timezone-qualified example time', () => {
    expect(section).toMatch(/Joey's local business timezone/);
    expect(section).toContain('Thursday, March 12 at 2:00 PM Eastern Time');
  });

  it('shows the example in the wording the labels actually produce', () => {
    // Joey's decision: plain Eastern year-round. An example reading EDT would
    // teach the model to rewrite the label it was handed.
    expect(section).not.toMatch(/\bEDT\b/);
    expect(section).not.toMatch(/\bEST\b/);
  });

  it('states the availability hard rule alongside the existing ones', () => {
    expect(prompt).toMatch(
      /NEVER present a day or a time as available unless check_availability returned/,
    );
  });

  it('does not reintroduce the forbidden word', () => {
    // Joey's rule applies to new prompt text as much as the old.
    expect(section).not.toMatch(/\bcommission\b/i);
  });

  it('spells Joey’s name the way he spells it', () => {
    expect(section).toContain('Joey Oberndorfer');
  });
});

/**
 * Market numbers, which the assistant has no tool for.
 *
 * "If you don't know something, say so" dead-ends here: a client who asks what
 * homes are going for gets a refusal and the conversation stops. So the prompt
 * carries a pivot — the figure that matters is the one for their street, which
 * is worth going through with Joey — and the pivot's one factual claim, that
 * their question was written down for him, is gated on log_lead_note actually
 * having written it. That is the `confirmation_email` pattern applied to a
 * second claim.
 *
 * The section sits above `## BOOKING A CONSULTATION` on purpose: the booking
 * assertions above slice from that heading to `## HARD RULES`, so inserting
 * here leaves that slice byte-identical.
 */
describe('system prompt — market numbers', () => {
  const section = prompt.slice(
    prompt.indexOf('## MARKET NUMBERS YOU DO NOT HAVE'),
    prompt.indexOf('## BOOKING A CONSULTATION'),
  );

  it('has a market section at all', () => {
    expect(prompt).toContain('## MARKET NUMBERS YOU DO NOT HAVE');
    expect(section.length).toBeGreaterThan(0);
  });

  it('forbids stating or estimating a figure', () => {
    expect(section).toMatch(/There is no tool that fetches market data/);
    expect(section).toMatch(/NEVER\s+state, estimate or bracket a figure/);
    expect(section).toMatch(/never cite a source for one/);
  });

  it('pivots rather than dead-ending on "I do not have that"', () => {
    expect(section).toMatch(/it ends the conversation/);
    expect(section).toMatch(/the figure worth\s+having is the one for their street/);
    expect(section).toMatch(/Offer the 15-minute consultation/);
  });

  it('writes the question down with log_lead_note, after a lead exists', () => {
    expect(section).toMatch(/only when a lead has already been captured/);
    expect(section).toMatch(/call log_lead_note with\s+their question/);
  });

  it('gates the "added to the notes" claim on note_recorded being true', () => {
    expect(section).toMatch(/log_lead_note's result carries "note_recorded"/);
    expect(section).toMatch(
      /added\s+their question to the notes for Joey ONLY when that value is true/,
    );
    expect(section).toMatch(/make the pivot without the claim/);
    expect(prompt).toMatch(
      /NEVER tell a client their question was added to Joey's notes unless\s+log_lead_note returned note_recorded true/,
    );
  });

  it('introduces no outside data source to fill the gap', () => {
    expect(section).toMatch(/Do not reach for a web lookup/);
    expect(section).not.toMatch(/\bMCP\b/);
    expect(section).not.toMatch(/\bsearch the web\b/i);
  });

  it('does not reintroduce the forbidden word', () => {
    expect(section).not.toMatch(/\bcommission\b/i);
  });
});

/**
 * The two things Joey is not. Both were stated wrongly in an earlier draft of
 * the playbook, and both are the kind of error that misrepresents a licensed
 * professional's services rather than merely reading badly.
 */
describe('system prompt — licensing boundaries', () => {
  const rules = prompt.slice(prompt.indexOf('## HARD RULES'));

  it('states that Joey is not an insurance agent', () => {
    expect(rules).toMatch(/Joey is NOT an insurance agent/);
    expect(rules).toMatch(/never name a carrier/);
    expect(rules).toMatch(/never quote a premium/);
    expect(rules).toMatch(/never recommend an\s+amount of coverage/);
  });

  it('states that Joey is not a title or escrow company', () => {
    expect(rules).toMatch(/Joey is NOT a title or escrow company/);
    expect(rules).toMatch(/manages the deal from\s+contract to closing/);
    expect(rules).toMatch(/attends every\s+closing in person/);
  });

  it('keeps the market-statistic ban in the hard rules, not in a placeholder', () => {
    // Every {{PLACEHOLDER}} is overridable by an ASSISTANT_* variable, so a
    // boundary stated in one stops being a boundary the moment somebody tunes
    // the variable.
    expect(rules).toMatch(/NEVER quote or estimate a market statistic/);
    expect(SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('## HARD RULES'))).not.toMatch(
      /\{\{[A-Z_]+\}\}/,
    );
  });
});

describe('system prompt — substitution', () => {
  it('leaves no placeholder unfilled once the facts are supplied', () => {
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('keeps the raw template free of interpolation', () => {
    // The v2 fix removed a malformed `${{ ... }}`; the template must stay a
    // plain literal with {{TOKEN}} placeholders only.
    expect(SYSTEM_PROMPT).not.toContain('${');
  });
});
