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

  it('forbids inventing a value to satisfy the tool', () => {
    expect(prompt).toMatch(/do NOT put\s+a placeholder, a guess/);
    expect(prompt).toMatch(/Never satisfy it by making a\s+value up/);
  });

  it('tells the assistant to re-ask and retry after an errored capture', () => {
    expect(prompt).toMatch(/If capture_lead comes back as an error/);
    expect(prompt).toMatch(/call capture_lead again with their answer/);
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
