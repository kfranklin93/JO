import { describe, it, expect } from 'vitest';
import {
  renderFollowUp,
  resolveRecipient,
  sanitizeSubjectValue,
  type FollowUpType,
} from './follow-up-content';
import { textToHtml } from './email-service';
import { LEAD_INTENTS } from '@/lib/validation/lead';
import type { Lead } from './follow-up-scheduler';

const TOUCHPOINTS: FollowUpType[] = [
  'immediate',
  'day3',
  'day7',
  'day14',
  'day30',
  'pastClient60',
];

function leadFixture(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    intent: 'buy',
    location: 'Marietta',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'new',
    ...overrides,
  } as Lead;
}

describe('resolveRecipient', () => {
  it('uses the first name for both greeting and subject when present', () => {
    expect(resolveRecipient('Jane Doe')).toEqual({
      greeting: 'Hey Jane!',
      firstName: 'Jane',
    });
  });

  it('greets a nameless lead naturally and exposes no name', () => {
    expect(resolveRecipient(undefined)).toEqual({ greeting: 'Hey there!' });
    expect(resolveRecipient('')).toEqual({ greeting: 'Hey there!' });
    expect(resolveRecipient('   ')).toEqual({ greeting: 'Hey there!' });
  });

  it("treats the cron route's 'there' placeholder as absent, not as a name", () => {
    // api/cron/follow-ups substitutes the literal 'there' when a lead has no
    // name, which previously produced "Quick check-in, there".
    expect(resolveRecipient('there')).toEqual({ greeting: 'Hey there!' });
    expect(resolveRecipient('N/A')).toEqual({ greeting: 'Hey there!' });
  });

  it('collapses whitespace and line breaks in a name', () => {
    expect(resolveRecipient('  Jane \n Doe ').firstName).toBe('Jane');
  });
});

describe('sanitizeSubjectValue', () => {
  it('strips line breaks that would mangle a subject line', () => {
    expect(sanitizeSubjectValue('Marietta\r\nBcc: someone@evil.test')).toBe(
      'Marietta Bcc: someone@evil.test'
    );
  });

  it('returns an empty string for nullish input', () => {
    expect(sanitizeSubjectValue(undefined)).toBe('');
    expect(sanitizeSubjectValue(null)).toBe('');
  });
});

describe('templated follow-up content', () => {
  it.each(TOUCHPOINTS)('renders a stable body and subject for %s', (type) => {
    expect(renderFollowUp(leadFixture(), type)).toMatchSnapshot();
  });

  it.each(TOUCHPOINTS)('produces a non-empty subject and body for %s', (type) => {
    const { subject, body } = renderFollowUp(leadFixture(), type);
    expect(subject.trim().length).toBeGreaterThan(0);
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it.each(LEAD_INTENTS)('handles the %s intent without falling through', (intent) => {
    const { subject, body } = renderFollowUp(
      leadFixture({ intent }),
      'immediate'
    );
    expect(subject).toContain('Thanks for reaching out');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('[object Object]');
  });

  it('signs off simply, without a formal closing', () => {
    for (const type of TOUCHPOINTS) {
      const { body } = renderFollowUp(leadFixture(), type);
      expect(body).toContain('Joey');
      expect(body).not.toMatch(/Best regards|Sincerely|Yours truly/i);
    }
  });

  it('opens with a first-name greeting', () => {
    for (const type of TOUCHPOINTS) {
      expect(renderFollowUp(leadFixture(), type).body).toMatch(/^Hey Jane!/);
    }
  });

  /**
   * Requirement 1.4. The old day3 and day14 prompts asked the model to
   * reference earlier conversations and previously shared resources while
   * `previousMessage` was hardcoded to 'N/A', so it invented them.
   */
  it('never claims a conversation or a resource that does not exist', () => {
    const forbidden = [
      /as we discussed/i,
      /as promised/i,
      /the guide I sent/i,
      /our (?:last )?(?:call|conversation|chat)/i,
      /when we spoke/i,
      /I mentioned/i,
      /you told me/i,
      /attached/i,
    ];

    for (const type of TOUCHPOINTS) {
      const { body } = renderFollowUp(leadFixture(), type);
      for (const pattern of forbidden) {
        expect(body, `${type} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  describe('nameless lead', () => {
    it('omits the name from subjects rather than substituting a placeholder', () => {
      for (const type of TOUCHPOINTS) {
        const { subject } = renderFollowUp(
          leadFixture({ name: 'there' }),
          type
        );
        expect(subject).not.toMatch(/, there\b/);
        expect(subject).not.toMatch(/\bundefined\b/);
        expect(subject).not.toMatch(/,\s*$/);
      }
    });

    it('still greets naturally in the body', () => {
      const { body } = renderFollowUp(leadFixture({ name: '' }), 'immediate');
      expect(body).toMatch(/^Hey there!/);
    });
  });

  describe('missing location', () => {
    it('falls back to the metro rather than rendering an empty area', () => {
      // Built without the key rather than with `location: undefined`, which
      // exactOptionalPropertyTypes rejects.
      const withoutLocation = leadFixture();
      delete (withoutLocation as { location?: string }).location;

      const { subject, body } = renderFollowUp(withoutLocation, 'day7');
      expect(subject).toBe("What's happening in the Atlanta metro");
      expect(body).toContain('the Atlanta metro');
      expect(body).not.toContain('undefined');
    });
  });

  /**
   * The body is intentionally NOT escaped here, because `sendFollowUpEmail`
   * runs it through `textToHtml`, which escapes. Escaping twice would render
   * entities literally. What matters is that the payload is inert once it has
   * been through the real send path, which is what this asserts.
   */
  describe('injection payloads', () => {
    const payload = '"><script>alert(1)</script>';

    it('renders inert after the escaping the send path applies', () => {
      const { body } = renderFollowUp(
        leadFixture({ name: payload, location: payload }),
        'day7'
      );

      const html = textToHtml(body);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not double-escape an ordinary apostrophe', () => {
      const { body } = renderFollowUp(
        leadFixture({ name: "O'Brien" }),
        'immediate'
      );

      // Raw body keeps the real glyph; a single escaping pass happens later.
      expect(body).toContain("O'Brien");
      expect(body).not.toContain('&#39;');
      expect(textToHtml(body)).toContain('O&#39;Brien');
    });

    it('keeps a subject on one line even when the payload has breaks', () => {
      const { subject } = renderFollowUp(
        leadFixture({ location: 'Marietta\nInjected: yes' }),
        'day7'
      );
      expect(subject).not.toContain('\n');
      expect(subject).not.toContain('\r');
    });
  });
});
