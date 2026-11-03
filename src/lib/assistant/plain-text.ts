/**
 * Strip markdown *syntax* out of a model reply.
 *
 * ## Why this exists
 *
 * The chat panel renders a reply as text — `whitespace-pre-line`, no markdown
 * library, deliberately (see src/components/chat/JoeyChat.tsx). Joey's
 * instruction is that his assistant should read like a text message from him,
 * so the fix for the asterisks clients were seeing is for the model to stop
 * emitting markdown, and that rule now lives in the system prompt.
 *
 * This is belt and braces behind that rule, not a formatter. Models drift back
 * to bullet lists the moment they enumerate anything, and this assistant
 * enumerates appointment times on most turns — 8 of the 25 assistant messages
 * stored in production contained `**` and 9 contained `- ` bullets. A prompt
 * rule alone will not hold, so the syntax is removed on the way out as well.
 *
 * ## What it deliberately does not do
 *
 * It does not reflow, re-punctuate, shorten, or restructure anything. Prose the
 * model wrote, including its line breaks, comes out as it went in. Only the
 * characters that are markup get removed, and only where they are unambiguously
 * markup:
 *
 *  - `**bold**`, `__bold__`, `*italic*`, `_italic_` lose their markers and keep
 *    their words. The single-character forms must not be touching a word
 *    character on the outside, so `lead_id`, `snake_case` and a literal
 *    asterisk inside a word survive untouched.
 *  - A leading `-`, `*`, `•` or `1.` / `1)` list marker is removed from the
 *    start of a line, keeping the line's content.
 *  - Leading `#` heading markers and every backtick go.
 *
 * Everything else is left alone, because mangling a client's words is worse
 * than an asterisk: `$1,250,000` keeps its commas, `Smith-Jones` keeps its
 * hyphen, `3.5` keeps its point, an em dash stays an em dash, an apostrophe
 * stays an apostrophe, and a slot label from `describeSlot` comes through
 * character for character.
 */

/** `**bold**` and `__bold__` — the pair the model reaches for most. */
const STRONG = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g;

/**
 * `*italic*`. The lookaround is the safety: an opening or closing marker that
 * touches a word character is not emphasis, so `f*ck` and `2*3` are left as
 * the model wrote them.
 */
const ITALIC_STAR = /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])?\*(?![\w*])/g;

/** `_italic_`, with the same guard. Keeps `lead_id` and `snake_case` intact. */
const ITALIC_UNDERSCORE = /(?<![\w_])_(?=[^\s_])([^_\n]*?[^\s_])?_(?![\w_])/g;

/**
 * An unclosed `**`, which is how the production messages actually read:
 * "booked for **Friday, October 30 at 9:00 AM". A run of two or more asterisks
 * is never prose, so it goes; a lone one is left alone.
 */
const ORPHAN_STARS = /\*{2,}/g;

/** `# Heading`. Needs the space, so "unit #3" is not a heading. */
const HEADING = /^[ \t]*#{1,6}[ \t]+/gm;

/**
 * A bullet marker at the start of a line. `-` and `*` need trailing
 * whitespace, so a negative number or a hyphenated word at the start of a line
 * is not a bullet. `•` does not, because it is never prose.
 */
const BULLET = /^[ \t]*(?:[-*][ \t]+|•[ \t]*)/gm;

/**
 * A numbered-list marker. Two digits at most and trailing whitespace required,
 * so "3.5 baths" and "1,250" are untouched.
 */
const NUMBERED = /^[ \t]*\d{1,2}[.)][ \t]+/gm;

/** Backticks, inline or fenced. The words inside them stay. */
const BACKTICKS = /`/g;

/**
 * The reply as a person would text it.
 *
 * Applied once, in `runAssistantTurn`, so every caller of the assistant gets
 * the same text that is persisted to the transcript.
 */
export function toPlainText(reply: string): string {
  return reply
    .replace(STRONG, '$2')
    .replace(ITALIC_STAR, '$1')
    .replace(ITALIC_UNDERSCORE, '$1')
    .replace(ORPHAN_STARS, '')
    .replace(BACKTICKS, '')
    .replace(HEADING, '')
    .replace(BULLET, '')
    .replace(NUMBERED, '');
}
