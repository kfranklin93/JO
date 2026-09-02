import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, safeMailto, safeTel } from './escape';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('Ben & Jerry')).toBe('Ben &amp; Jerry');
  });

  it('should escape less-than', () => {
    expect(escapeHtml('1 < 2')).toBe('1 &lt; 2');
  });

  it('should escape greater-than', () => {
    expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
  });

  it('should escape double quote', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
  });

  it('should escape single quote', () => {
    expect(escapeHtml("It's nice")).toBe('It&#39;s nice');
  });

  it('should escape full script injection payload', () => {
    const payload = '"><script>alert(1)</script>';
    const expected = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;';
    expect(escapeHtml(payload)).toBe(expected);
  });

  it('should not double-encode (ampersand replaced first)', () => {
    // When & is replaced first, &lt; becomes &amp;lt; (correct)
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    // If < were replaced first and then &, it would also be &amp;lt;
    // The key test: already-encoded entities stay recognizable
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('should render apostrophe in name as correct glyph', () => {
    // Entity-encoded apostrophe renders as the glyph in HTML clients
    const result = escapeHtml("O'Brien");
    expect(result).toBe('O&#39;Brien');
    // This will render as: O'Brien (the entity is invisible to the reader)
  });

  it('should handle null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should coerce non-string values to string', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(true)).toBe('true');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should escape all special characters in one string', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('escapeAttr', () => {
  it('should escape double quotes for attribute context', () => {
    expect(escapeAttr('value"with"quotes')).toContain('&quot;');
  });

  it('should escape single quotes for attribute context', () => {
    expect(escapeAttr("value'with'quotes")).toContain('&#39;');
  });

  it('should prevent attribute breakout with full payload', () => {
    const payload = '" onload="alert(1)';
    const result = escapeAttr(payload);
    expect(result).toBe('&quot; onload=&quot;alert(1)');
    // In context: <img src="ESCAPED_VALUE" /> won't break out
  });

  it('should handle apostrophe in name correctly', () => {
    const result = escapeAttr("O'Brien");
    expect(result).toBe('O&#39;Brien');
  });
});

describe('safeMailto', () => {
  it('should pass through valid email address', () => {
    expect(safeMailto('user@example.com')).toBe('user@example.com');
    expect(safeMailto('test.user+tag@domain.co.uk')).toBe('test.user+tag@domain.co.uk');
  });

  it('should reject javascript: URL', () => {
    expect(safeMailto('javascript:alert(1)')).toBe('');
  });

  it('should reject other dangerous schemes', () => {
    expect(safeMailto('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeMailto('vbscript:msgbox')).toBe('');
    expect(safeMailto('file:///etc/passwd')).toBe('');
  });

  it('should reject invalid email shapes', () => {
    expect(safeMailto('not-an-email')).toBe('');
    expect(safeMailto('@example.com')).toBe('');
    expect(safeMailto('user@')).toBe('');
    expect(safeMailto('user@domain')).toBe(''); // missing TLD
  });

  it('should trim whitespace', () => {
    expect(safeMailto('  user@example.com  ')).toBe('user@example.com');
  });

  it('should handle null and undefined', () => {
    expect(safeMailto(null)).toBe('');
    expect(safeMailto(undefined)).toBe('');
  });

  it('should be case-insensitive for scheme detection', () => {
    expect(safeMailto('JavaScript:alert(1)')).toBe('');
    expect(safeMailto('JAVASCRIPT:alert(1)')).toBe('');
  });
});

describe('safeTel', () => {
  it('should strip formatting from valid phone numbers', () => {
    expect(safeTel('(770) 555-0100')).toBe('7705550100');
    expect(safeTel('770-555-0100')).toBe('7705550100');
    expect(safeTel('770.555.0100')).toBe('7705550100');
  });

  it('should preserve plus sign for international', () => {
    expect(safeTel('+1 (770) 555-0100')).toBe('+17705550100');
  });

  it('should reject javascript: URL', () => {
    expect(safeTel('javascript:alert(1)')).toBe('');
  });

  it('should reject other dangerous schemes', () => {
    expect(safeTel('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeTel('tel:123;param=javascript:alert(1)')).toBe('');
  });

  it('should reject too-short sequences', () => {
    expect(safeTel('123')).toBe(''); // less than 7 digits
    expect(safeTel('12-34')).toBe(''); // less than 7 after cleaning
  });

  it('should accept minimum valid length', () => {
    expect(safeTel('5550100')).toBe('5550100'); // exactly 7 digits
  });

  it('should trim whitespace', () => {
    expect(safeTel('  (770) 555-0100  ')).toBe('7705550100');
  });

  it('should handle null and undefined', () => {
    expect(safeTel(null)).toBe('');
    expect(safeTel(undefined)).toBe('');
  });

  it('should be case-insensitive for scheme detection', () => {
    expect(safeTel('JavaScript:alert(1)')).toBe('');
    expect(safeTel('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('should strip all non-dial characters', () => {
    expect(safeTel('Call (770) 555-0100 ext 123')).toBe('7705550100123');
  });
});

describe('integration: attribute context with javascript: URL', () => {
  it('should neutralize javascript: URL in mailto href', () => {
    const malicious = 'javascript:alert(1)';
    const safe = safeMailto(malicious);
    expect(safe).toBe('');
    // In context: <a href="mailto:EMPTY">text</a> - harmless
  });

  it('should neutralize javascript: URL in tel href', () => {
    const malicious = 'javascript:alert(1)';
    const safe = safeTel(malicious);
    expect(safe).toBe('');
    // In context: <a href="tel:EMPTY">text</a> - harmless
  });

  it('should handle full breakout attempt in attribute', () => {
    const payload = '"><script>alert(1)</script><a href="';
    const escaped = escapeAttr(payload);
    expect(escaped).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;a href=&quot;');
    // In context: <a href="ESCAPED">link</a> won't break out
  });
});
