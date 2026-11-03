import { describe, expect, it } from 'vitest';
import { describeSlot } from '@/lib/services/slot-label';
import { toPlainText } from './plain-text';

/**
 * Two halves to this file, and the second is the important one.
 *
 * Removing markdown is easy. Removing it without touching a dollar amount, a
 * client's hyphenated surname or a slot label is the whole requirement, because
 * a sanitizer that corrupts a client's name is worse than an asterisk. Every
 * "leaves alone" case below is text the assistant genuinely sends.
 */

describe('toPlainText — removes markdown syntax', () => {
  it('unwraps **bold** and keeps the words', () => {
    expect(toPlainText('Booked for **Friday, October 30**.')).toBe(
      'Booked for Friday, October 30.',
    );
  });

  it('unwraps __bold__ and _italic_ and *italic*', () => {
    expect(toPlainText('He is __personally__ there.')).toBe(
      'He is personally there.',
    );
    expect(toPlainText('That is _every_ closing.')).toBe(
      'That is every closing.',
    );
    expect(toPlainText('That is *every* closing.')).toBe(
      'That is every closing.',
    );
  });

  it('removes an unclosed ** run, which is how production read', () => {
    expect(
      toPlainText(
        'Your consultation with Joey is booked for **Friday at 9:00 AM',
      ),
    ).toBe('Your consultation with Joey is booked for Friday at 9:00 AM');
  });

  it('strips leading bullet markers and keeps the content', () => {
    expect(toPlainText('- 9:00 AM\n- 9:15 AM\n* 9:30 AM\n• 9:45 AM')).toBe(
      '9:00 AM\n9:15 AM\n9:30 AM\n9:45 AM',
    );
  });

  it('strips numbered-list markers and keeps the content', () => {
    expect(toPlainText('1. Pick a time\n2) Confirm your email')).toBe(
      'Pick a time\nConfirm your email',
    );
  });

  it('strips heading markers and backticks', () => {
    expect(toPlainText('## Friday, October 30\nUse `book_appointment`.')).toBe(
      'Friday, October 30\nUse book_appointment.',
    );
  });

  it('keeps the paragraphing the panel relies on', () => {
    // `whitespace-pre-line` renders these breaks, so collapsing them would
    // change what the client sees.
    expect(toPlainText('Hi there.\n\nJoey has time Friday.')).toBe(
      'Hi there.\n\nJoey has time Friday.',
    );
  });

  it('cleans up the two messages production actually stored', () => {
    expect(
      toPlainText(
        "You're all set! Your 15-minute consultation with Joey is booked for " +
          '**Thursday, March 12 at 2:00 PM Eastern Time**.',
      ),
    ).toBe(
      "You're all set! Your 15-minute consultation with Joey is booked for " +
        'Thursday, March 12 at 2:00 PM Eastern Time.',
    );

    expect(
      toPlainText(
        'Perfect! Joey has some time open. Here are your options:\n\n' +
          '**Friday, October 30**\n- 9:00 AM\n- 9:15 AM',
      ),
    ).toBe(
      'Perfect! Joey has some time open. Here are your options:\n\n' +
        'Friday, October 30\n9:00 AM\n9:15 AM',
    );
  });
});

describe('toPlainText — leaves legitimate text intact', () => {
  const untouched = [
    ['a dollar amount with commas', 'Homes near you have sold at $1,250,000.'],
    ['a hyphenated surname', 'Thanks, Mary-Anne Smith-Jones!'],
    ['a decimal number', 'It is a 3.5 bath on 1.25 acres.'],
    ['an em dash', 'Joey will call you — he handles every client personally.'],
    ['an apostrophe', "You're all set, and Joey's looking forward to it."],
    [
      'a literal asterisk inside a word',
      'They wrote it as sell*fast in the listing.',
    ],
    ['arithmetic with spaced asterisks', 'That is 2 * 3 rooms, roughly.'],
    [
      'a snake_case tool name echoed back',
      'I called capture_lead with your email.',
    ],
    ['a lead note placeholder', 'Welcome, [Name], you are in the right place!'],
    ['a negative figure at the start of a line', '-5 degrees was the record.'],
    [
      'a hyphenated word at the start of a line',
      'Co-op buildings work differently.',
    ],
    ['a number with a unit at the start of a line', '15 minutes with Joey.'],
    ['a hash with no space, as in a unit number', 'Unit #3 on the corner.'],
  ] as const;

  for (const [what, text] of untouched) {
    it(`keeps ${what} exactly as written`, () => {
      expect(toPlainText(text)).toBe(text);
    });
  }

  it('keeps a describeSlot label character for character', () => {
    // The label is the single source of the wording the client is told, and the
    // timezone in it is what stops somebody showing up an hour out.
    const label = describeSlot(new Date('2026-03-12T18:00:00.000Z'));
    const reply = `I've got ${label}, or 3:15 that same afternoon. Which works?`;

    expect(toPlainText(reply)).toBe(reply);
    expect(toPlainText(reply)).toContain(label);
  });

  it('keeps a bolded label intact once the markers come off', () => {
    const label = describeSlot(new Date('2026-03-12T18:00:00.000Z'));

    expect(toPlainText(`Booked: **${label}**.`)).toBe(`Booked: ${label}.`);
  });

  it('returns empty and whitespace-only input unchanged', () => {
    expect(toPlainText('')).toBe('');
    expect(toPlainText('   ')).toBe('   ');
  });
});
