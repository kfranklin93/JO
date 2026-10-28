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
    expect(section).toMatch(/offer ONLY\s+the times it returned/);
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
    expect(section).toMatch(/never re-offer the time that just\s+failed/);
    expect(prompt).toMatch(
      /NEVER tell a client a time is booked unless book_appointment returned booked/,
    );
  });

  it('shows a timezone-qualified example time', () => {
    expect(section).toMatch(/Joey's local business timezone/);
    expect(section).toContain('Thursday, March 12 at 2:00 PM EDT');
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
