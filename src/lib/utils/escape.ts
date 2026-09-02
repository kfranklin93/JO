/**
 * HTML and attribute escaping utilities for untrusted input.
 * 
 * Used to render lead-supplied text safely in email HTML without
 * allowing markup injection or malicious links.
 */

/**
 * Escape a value for safe rendering in HTML text content.
 * 
 * Handles &, <, >, ", and ' to prevent markup injection.
 * Ampersand is replaced first to prevent double-encoding.
 * 
 * @param value - The value to escape (coerced to string)
 * @returns HTML-safe string
 * 
 * @example
 * escapeHtml('<script>alert(1)</script>') 
 * // => '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function escapeHtml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')   // Must be first to prevent double-encoding
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a value for safe rendering in an HTML attribute value.
 * 
 * Includes all HTML text escapes plus guards against attribute-value
 * boundary breakout. Entity-encoded characters render as the original
 * glyph in HTML mail clients, so apostrophes in names remain readable.
 * 
 * @param value - The value to escape (coerced to string)
 * @returns Attribute-safe string
 * 
 * @example
 * escapeAttr('O\'Brien') // => 'O&#39;Brien' (renders as: O'Brien)
 */
export function escapeAttr(value: unknown): string {
  // For attribute context, escapeHtml is sufficient since it covers
  // both quote characters that could terminate an attribute value
  return escapeHtml(value);
}

/**
 * Validate and sanitize an email address for use in a mailto: href.
 * 
 * Returns an empty string if the value does not resemble an email address
 * or contains a dangerous scheme prefix (e.g., javascript:).
 * 
 * @param email - The email address to validate
 * @returns Sanitized email or empty string
 * 
 * @example
 * safeMailto('user@example.com') // => 'user@example.com'
 * safeMailto('javascript:alert(1)') // => ''
 */
export function safeMailto(email: unknown): string {
  const str = String(email ?? '').trim();
  
  // Reject if it contains a scheme prefix (case-insensitive)
  if (/^[a-z][a-z0-9+.-]*:/i.test(str)) {
    return '';
  }
  
  // Basic email shape validation: contains @ with characters before and after
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
    return '';
  }
  
  return str;
}

/**
 * Validate and sanitize a phone number for use in a tel: href.
 * 
 * Strips formatting characters and returns only valid dial characters.
 * Returns an empty string if the result is invalid or contains a
 * dangerous scheme prefix.
 * 
 * @param phone - The phone number to validate
 * @returns Sanitized phone or empty string
 * 
 * @example
 * safeTel('(770) 555-0100') // => '7705550100'
 * safeTel('javascript:alert(1)') // => ''
 */
export function safeTel(phone: unknown): string {
  const str = String(phone ?? '').trim();
  
  // Reject if it contains a scheme prefix (case-insensitive)
  if (/^[a-z][a-z0-9+.-]*:/i.test(str)) {
    return '';
  }
  
  // Strip all non-dial characters (keep digits, +, and extensions)
  const cleaned = str.replace(/[^\d+]/g, '');
  
  // Must have at least a reasonable number of digits for a phone number
  if (cleaned.length < 7) {
    return '';
  }
  
  return cleaned;
}
