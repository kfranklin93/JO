import { describe, it, expect } from 'vitest';
import { textToHtml } from './email-service';

describe('email-service escaping integration', () => {
  describe('textToHtml', () => {
    it('should escape HTML before adding markup', () => {
      const text = '<script>alert(1)</script>';
      const result = textToHtml(text);
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should preserve paragraph structure after escaping', () => {
      const text = 'First paragraph\n\nSecond paragraph';
      const result = textToHtml(text);
      expect(result).toContain('<p>First paragraph</p>');
      expect(result).toContain('<p>Second paragraph</p>');
    });

    it('should preserve line breaks after escaping', () => {
      const text = 'Line 1\nLine 2';
      const result = textToHtml(text);
      expect(result).toContain('Line 1<br>Line 2');
    });

    it('should escape injection payload before converting to HTML', () => {
      const payload = '"><script>alert(1)</script>';
      const result = textToHtml(payload);
      // Should be escaped
      expect(result).toContain('&quot;&gt;&lt;script&gt;');
      // Should not contain unescaped payload
      expect(result).not.toContain('"><script>');
    });

    it('should handle apostrophes in names correctly', () => {
      const text = "O'Brien family";
      const result = textToHtml(text);
      // Apostrophe should be entity-encoded but will render correctly
      expect(result).toContain('O&#39;Brien');
    });

    it('should handle mixed content with special characters', () => {
      const text = 'Contact: <john@example.com> & call (555) 123-4567';
      const result = textToHtml(text);
      expect(result).toContain('&lt;john@example.com&gt;');
      expect(result).toContain('&amp;');
      expect(result).not.toContain('<john@example.com>');
    });
  });

  // Note: Full integration tests for notifyJoeyOfNewLead and sendDailyLeadSummary
  // would require mocking the Resend client, which is deferred to when those
  // functions are actively used. The escaping logic itself is unit tested in
  // escape.test.ts, and the textToHtml integration is verified here.
});
