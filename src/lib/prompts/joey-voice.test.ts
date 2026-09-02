/**
 * Tests for Joey's Voice & Personality Prompts
 * 
 * Focuses on template substitution security (Requirement 2)
 */

import { describe, it, expect } from 'vitest';
import { fillPromptTemplate, formatLeadContext } from './joey-voice';

describe('fillPromptTemplate', () => {
  describe('Requirement 2.1 - Dollar sign sequences pass through literally', () => {
    it('should preserve $& in replacement text', () => {
      const template = 'Hello {name}!';
      const result = fillPromptTemplate(template, { name: 'Bob $& Alice' });
      expect(result).toBe('Hello Bob $& Alice!');
    });

    it('should preserve $` (dollar backtick) in replacement text', () => {
      const template = 'Hello {name}!';
      const result = fillPromptTemplate(template, { name: 'Bob $` Alice' });
      expect(result).toBe('Hello Bob $` Alice!');
    });

    it('should preserve $\' (dollar apostrophe) in replacement text', () => {
      const template = 'Hello {name}!';
      const result = fillPromptTemplate(template, { name: "Bob $' Alice" });
      expect(result).toBe("Hello Bob $' Alice!");
    });

    it('should preserve $1 through $99 in replacement text', () => {
      const template = 'Amount: {amount}';
      const result = fillPromptTemplate(template, { amount: '$1 $12 $99' });
      expect(result).toBe('Amount: $1 $12 $99');
    });

    it('should preserve $$ in replacement text', () => {
      const template = 'Price: {price}';
      const result = fillPromptTemplate(template, { price: '$$100' });
      expect(result).toBe('Price: $$100');
    });

    it('should preserve multiple dollar sequences in one field', () => {
      const template = 'Notes: {notes}';
      const result = fillPromptTemplate(template, { 
        notes: 'Contains $& and $` and $\' and $1' 
      });
      expect(result).toBe('Notes: Contains $& and $` and $\' and $1');
    });
  });

  describe('Requirement 2.2 - No pattern interpretation', () => {
    it('should not interpret replacement patterns in multi-field templates', () => {
      const template = 'User {name} wants {item}';
      const result = fillPromptTemplate(template, { 
        name: 'Alice $&',
        item: 'coffee $1'
      });
      expect(result).toBe('User Alice $& wants coffee $1');
    });

    it('should handle edge case of $0', () => {
      const template = '{field}';
      const result = fillPromptTemplate(template, { field: '$0' });
      expect(result).toBe('$0');
    });
  });

  describe('Requirement 2.3 - Single pass prevents re-scanning', () => {
    it('should not substitute a literal placeholder in injected text', () => {
      const template = 'Location: {location}, Area: {area}';
      // The location value contains a literal {area} string
      const result = fillPromptTemplate(template, {
        location: 'Near {area}',
        area: 'Downtown'
      });
      // The {area} in the location value should NOT be replaced
      expect(result).toBe('Location: Near {area}, Area: Downtown');
    });

    it('should not substitute when first replacement creates a placeholder-like pattern', () => {
      const template = '{prefix} {suffix}';
      const result = fillPromptTemplate(template, {
        prefix: 'Start {suffix}',
        suffix: 'End'
      });
      // The {suffix} injected by prefix should not match the {suffix} placeholder
      expect(result).toBe('Start {suffix} End');
    });

    it('should handle multiple injected placeholder-like strings', () => {
      const template = '{a} {b} {c}';
      const result = fillPromptTemplate(template, {
        a: '{b}',
        b: '{c}',
        c: 'final'
      });
      // None of the injected {b} or {c} should be replaced
      expect(result).toBe('{b} {c} final');
    });

    it('should process all placeholders in a single pass regardless of order', () => {
      const template = '{first} and {second}';
      // Even though 'second' creates {first}, it shouldn't be re-scanned
      const result = fillPromptTemplate(template, {
        second: '{first}',
        first: 'START'
      });
      expect(result).toBe('START and {first}');
    });
  });

  describe('Edge cases and basic functionality', () => {
    it('should replace a single placeholder', () => {
      const result = fillPromptTemplate('Hello {name}', { name: 'Joey' });
      expect(result).toBe('Hello Joey');
    });

    it('should replace multiple occurrences of the same placeholder', () => {
      const result = fillPromptTemplate('{name} and {name}', { name: 'Joey' });
      expect(result).toBe('Joey and Joey');
    });

    it('should leave unmatched placeholders unchanged', () => {
      const result = fillPromptTemplate('Hello {name} and {other}', { name: 'Joey' });
      expect(result).toBe('Hello Joey and {other}');
    });

    it('should handle empty data object', () => {
      const result = fillPromptTemplate('Hello {name}', {});
      expect(result).toBe('Hello {name}');
    });

    it('should handle empty string values', () => {
      const result = fillPromptTemplate('Hello {name}!', { name: '' });
      expect(result).toBe('Hello !');
    });

    it('should handle special regex characters in keys', () => {
      // Keys with special regex characters should be escaped properly
      const result = fillPromptTemplate('Value: {key.name}', { 'key.name': 'test' });
      expect(result).toBe('Value: test');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle lead data with dollar signs and placeholders', () => {
      const template = 'Lead {name} is interested in {budget} properties in {area}.';
      const result = fillPromptTemplate(template, {
        name: 'John $& Associates',
        budget: '$100k-$200k',
        area: 'Buckhead {downtown}'
      });
      expect(result).toBe(
        'Lead John $& Associates is interested in $100k-$200k properties in Buckhead {downtown}.'
      );
    });

    it('should handle notes containing regex replacement sequences', () => {
      const template = 'Notes: {notes}';
      const result = fillPromptTemplate(template, {
        notes: 'Looking for property near $& shopping with $1M budget. Prefers {area} location.'
      });
      expect(result).toBe(
        'Notes: Looking for property near $& shopping with $1M budget. Prefers {area} location.'
      );
    });
  });
});

describe('formatLeadContext', () => {
  it('should format basic lead information', () => {
    const lead = {
      name: 'John Doe',
      email: 'john@example.com',
      intent: 'buy'
    };
    const result = formatLeadContext(lead);
    expect(result).toContain('Name: John Doe');
    expect(result).toContain('Intent: buy');
  });

  it('should include optional fields when present', () => {
    const lead = {
      name: 'Jane Smith',
      email: 'jane@example.com',
      intent: 'sell',
      location: 'Marietta',
      budget: '$500k',
      timeline: '3 months',
      additionalNotes: 'Urgent sale needed'
    };
    const result = formatLeadContext(lead);
    expect(result).toContain('Location: Marietta');
    expect(result).toContain('Budget: $500k');
    expect(result).toContain('Timeline: 3 months');
    expect(result).toContain('Notes: Urgent sale needed');
  });

  it('should handle lead data containing dollar signs', () => {
    const lead = {
      name: 'Bob $& Associates',
      email: 'bob@example.com',
      intent: 'buy',
      additionalNotes: 'Budget is $1M for $& property types'
    };
    const result = formatLeadContext(lead);
    expect(result).toContain('Name: Bob $& Associates');
    expect(result).toContain('Notes: Budget is $1M for $& property types');
  });
});
