#!/usr/bin/env node
/**
 * Contrast audit for the component tree. **This is a build gate.**
 *
 * Scans every className string under src/ for a background token and a text
 * token used together, computes the WCAG contrast ratio from the real palette
 * in globals.css, and fails the run on anything below the AA threshold.
 *
 * It reports, and gates on, three categories:
 *
 *   1. explicit  — a background token and a text token in the same class list
 *   2. inherited — a dark background and *no* text colour anywhere in the
 *                  element's subtree, so the label inherits `--color-foreground`
 *                  (Onyx) from `body` and renders near-black on a dark fill
 *   3. on-page   — text with no background of its own, measured against the
 *                  nearest enclosing background, or the page background if
 *                  there is no enclosing one
 *
 * Usage:  npm run audit:contrast     (or: node scripts/audit-contrast.mjs)
 * Exits 1 if any category has a finding.
 *
 * ## How it resolves a surface
 *
 * The first version of this script read one line at a time and assumed the
 * page background for anything without a `bg-` of its own. That produced a
 * long list of false positives: gold text at 1.99:1 "against bone" that is in
 * fact sitting on an onyx or black section declared on a parent element, where
 * gold measures 8.4:1 and is the site's luxury accent. Turning the gate on
 * with that noise would have meant either suppressing real findings or
 * recolouring correct design.
 *
 * So it now builds a crude element tree from indentation — JSX here is
 * Prettier-formatted, so indentation is a reliable proxy for nesting — and
 * resolves each piece of text against the nearest *enclosing* solid
 * background. Same mechanism in reverse for category 2: a dark wrapper whose
 * subtree sets its own text colour is not a bug, so the colours found in the
 * subtree are checked against the fill instead of the inherited Onyx.
 *
 * ## Variant states
 *
 * Every class containing `:` used to be dropped, so no `hover:` state was ever
 * evaluated and `hover:bg-x hover:text-y` pairings went unaudited entirely.
 * Classes are now grouped by variant prefix and each group is evaluated with
 * its own background, falling back to the unprefixed background and then to
 * the enclosing one. `hover:bg-accent` with an inherited `text-white` is
 * therefore judged as white-on-accent, which is what the user sees.
 *
 * ## What it still cannot see — read before trusting a clean run
 *
 * - **Non-text contrast (WCAG 1.4.11) is out of scope.** Classes on `<svg>`
 *   and `<path>` elements are skipped: they colour glyphs, not text, and the
 *   4.5:1 body-text floor is the wrong test for them. Icons and decorative
 *   marks therefore are not gated here. The known gap: champagne gold glyphs
 *   on the light Testimonials and Team sections measure 2.4:1 against white,
 *   below even the 3:1 graphics floor.
 * - **Multi-line `cn()` arguments.** A quoted class fragment on its own line
 *   inside a `cn(...)` call is matched for *text* colours (subtree resolution
 *   reads raw lines) but is not treated as its own class list, so an explicit
 *   pairing written across several lines of a `cn()` call is not evaluated.
 * - **Translucent fills.** `bg-navy/10` composites with whatever is behind it,
 *   which a class string does not reveal, so those are skipped rather than
 *   guessed at. Same for text below 70% opacity.
 * - **Colours set by a variant map in another file.** A `className` passed
 *   into a component is invisible to this script.
 *
 * Treat a clean run as "no obvious pairing errors", not as proof of
 * accessibility — the real check is a browser and a human.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
const THEME = join(SRC, 'app', 'globals.css');

/** WCAG AA: 4.5 for body text, 3.0 for large text. We report against 4.5. */
const AA = 4.5;
const AA_LARGE = 3.0;

/* ---------------------------------------------------------------- *
 * Palette, read from the @theme block so this cannot drift from it
 * ---------------------------------------------------------------- */

function loadPalette() {
  const css = readFileSync(THEME, 'utf-8');
  const palette = new Map();
  for (const [, name, hex] of css.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g,
  )) {
    palette.set(name, hex);
  }
  // Tailwind built-ins used alongside the tokens.
  palette.set('white', '#ffffff');
  palette.set('black', '#000000');
  return palette;
}

/* ---------------------------------------------------------------- *
 * Contrast maths (WCAG 2.1 relative luminance)
 * ---------------------------------------------------------------- */

function toRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // ignore alpha
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------------------------------------------------------- *
 * Scanning
 * ---------------------------------------------------------------- */

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

/**
 * Pull out quoted string literals that look like class lists.
 *
 * Template literals and conditional expressions are flattened crudely: we take
 * every quoted run and treat it as a candidate class list. That over-collects,
 * which is the right direction — a false positive costs a glance, a miss costs
 * an invisible button.
 *
 * `kind` matters downstream. A `jsx` list belongs to an element in this file,
 * so its enclosing surface can be resolved. A `variant` list is an entry in a
 * variant map, with no element and therefore no knowable surface, so it is
 * judged against the page background only.
 */
function classStrings(line) {
  const out = [];
  const re = /(?:className|class)\s*=\s*(?:\{)?([`'"])([\s\S]*?)\1/g;
  for (const [, , body] of line.matchAll(re)) out.push({ body, kind: 'jsx' });
  return out;
}

/**
 * Variant-map entries — `primary: 'bg-x text-y ...'` — scanned whole-file.
 *
 * Whole-file and not line-by-line, because Prettier wraps a long entry onto
 * the line after its key. That one detail is why this script never looked
 * inside `Button.tsx`: every entry in its variant map is wrapped, so the
 * per-line version matched none of them and the component holding the
 * dark-on-dark hazard was the one component the audit could not see.
 */
function variantClassStrings(source) {
  const out = [];
  const re = /^[ \t]*\w+:\s*(['"`])([^'"`]*(?:bg-|text-)[^'"`]*)\1/gm;
  for (const m of source.matchAll(re)) {
    const at = m.index + m[0].indexOf(m[1]);
    out.push({ body: m[2], kind: 'variant', line: source.slice(0, at).split('\n').length });
  }
  return out;
}

/** The skeleton the nesting heuristic rides on: one tag per line, indented. */
const ANY_TAG = /^(\s*)<(\/?)([A-Za-z][\w.]*)/;

/**
 * Index every opening tag in a file with its indentation.
 *
 * `attrEnd` is the line before the next tag of any kind, opening *or closing*,
 * which is where this element's attributes stop. Closing tags have to be in
 * the index for that bound to be right: without them an element's attribute
 * range swallowed its own `</a>`, and the sibling-detection below then could
 * not see that the element had already closed.
 *
 * Prettier puts one tag per line and indents children, so "nearest earlier
 * tag with a smaller indent that has not closed yet" is a serviceable parent
 * pointer. It is wrong for JSX that Prettier has folded onto one line; those
 * elements simply fail to resolve a parent and fall back to the page
 * background, which is the safe direction.
 */
function indexTags(lines) {
  const marks = [];
  lines.forEach((line, i) => {
    const m = line.match(ANY_TAG);
    if (m) marks.push({ open: m[2] === '', tag: m[3], indent: m[1].length, line: i });
  });
  const tags = [];
  marks.forEach((mark, i) => {
    if (!mark.open) return;
    const next = marks[i + 1];
    tags.push({ ...mark, attrEnd: next ? next.line - 1 : lines.length - 1 });
  });
  return tags;
}

/** The tag that owns a class string on `lineIdx`, or null. */
function owningTag(tags, lineIdx) {
  let found = null;
  for (const t of tags) {
    if (t.line > lineIdx) break;
    if (lineIdx <= t.attrEnd) found = t;
  }
  return found;
}

/**
 * Strip variant prefixes and read the token plus its opacity.
 *
 * Opacity matters and ignoring it was the first version's biggest source of
 * noise. `bg-navy/10` is a pale tint of navy over whatever sits behind it, so
 * `bg-navy/10 text-navy` is a perfectly legible badge — but judged as solid
 * navy on navy it looks like a 1:1 catastrophe. A translucent fill cannot be
 * assessed from the class string alone, so those are skipped rather than
 * guessed at.
 *
 * @returns `{ token, opacity }` where opacity is 100 when unspecified.
 */
function bareToken(cls, prefix) {
  const withoutVariants = cls.split(':').pop() ?? cls;
  if (!withoutVariants.startsWith(prefix)) return null;
  const [token, opacity] = withoutVariants.slice(prefix.length).split('/');
  if (!token) return null;
  return { token, opacity: opacity === undefined ? 100 : Number(opacity) };
}

/**
 * Split a class list by variant prefix.
 *
 * The unprefixed classes land under `''` and describe the default state;
 * `hover:bg-accent` lands under `'hover:'`. Responsive prefixes group too,
 * harmlessly — `sm:text-6xl` carries no colour so the group is empty of
 * anything this script measures.
 */
function groupByVariant(list) {
  const groups = new Map([['', []]]);
  for (const cls of list) {
    const cut = cls.lastIndexOf(':');
    const prefix = cut === -1 ? '' : cls.slice(0, cut + 1);
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(cls);
  }
  return groups;
}

const solidBg = (list, palette) =>
  list
    .map((c) => bareToken(c, 'bg-'))
    .find((t) => t && palette.has(t.token) && t.opacity === 100) ?? null;

const readableText = (list, palette) =>
  list
    .map((c) => bareToken(c, 'text-'))
    .filter((t) => t && palette.has(t.token) && t.opacity >= 70);

/**
 * Whether `tag` has already closed by the time we reach `before`.
 *
 * Without this, a *previous sibling* gets mistaken for a parent whenever the
 * next sibling is nested one level deeper by a wrapping `&&` or ternary, which
 * Prettier indents but which opens no tag. That misread a plain bordered link
 * in the dashboard as sitting inside the `bg-neutral-900` button above it.
 */
function closedBefore(lines, tag, before) {
  const closer = new RegExp(`^\\s{${tag.indent}}</${tag.tag}>`);
  for (let l = tag.attrEnd + 1; l < before; l++) {
    if (closer.test(lines[l])) return true;
  }
  return false;
}

/** Nearest enclosing tag that sets a solid palette background. */
function enclosingBg(lines, tags, self, palette) {
  let limit = self.indent;
  for (let i = tags.indexOf(self) - 1; i >= 0; i--) {
    const t = tags[i];
    if (t.indent >= limit) continue;
    if (/\/>\s*$/.test(lines[t.attrEnd])) continue; // self-closing: not a parent
    if (closedBefore(lines, t, self.line)) continue; // a sibling, not a parent
    limit = t.indent;
    for (let l = t.line; l <= t.attrEnd; l++) {
      for (const { body } of classStrings(lines[l])) {
        const bg = solidBg(body.split(/\s+/).filter(Boolean), palette);
        if (bg) return { token: bg.token, line: t.line + 1 };
      }
    }
  }
  return null;
}

/**
 * Whether a class list describes something a user clicks or reads as a unit.
 *
 * Section wrappers like `bg-navy py-32` legitimately set a dark background and
 * let their children choose text colours, so flagging them for having no text
 * colour is noise — and so do decorative shapes: a progress bar, a pulse ring,
 * a media container, a one-pixel rule. None of them has a label to lose. A
 * button or badge sets its own padding and rounding and is expected to be
 * self-contained, which is where a missing text colour actually renders an
 * invisible label.
 *
 * The gap this leaves: a dark chip that sets no padding and no rounding and
 * *does* contain a label would not be flagged. Nothing in the tree does that
 * today, and the alternative — deciding from a class string whether an
 * element has text content — needs a real parser.
 */
function looksInteractive(list) {
  const hasPadding = list.some((c) => /^p[xy]?-/.test(c));
  const hasShape = list.some((c) => /^rounded/.test(c));
  const isLayoutOnly = list.some((c) => /^(py|px)-(2[0-9]|3[0-9]|40)$/.test(c));
  return hasPadding && hasShape && !isLayoutOnly;
}

/**
 * Narrow, documented opt-out: `contrast-ok: <reason>` in a comment on one of
 * the two lines above a class string.
 *
 * Reserved for the cases this script fundamentally cannot judge rather than
 * for anything merely inconvenient — a decorative mark that carries no
 * information, or a fill composited from a translucent stack. The reason is
 * required and every suppression is printed in the report, so turning the
 * gate green by sprinkling these is visible rather than silent.
 */
function suppression(lines, lineIdx) {
  for (const l of [lineIdx - 1, lineIdx - 2]) {
    if (l < 0) continue;
    const m = lines[l].match(/contrast-ok:\s*(\S.*?)\s*(?:\*\/|\*\/\}|$)/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Text colours set anywhere inside an element's subtree.
 *
 * Read from raw lines rather than from parsed class lists on purpose: the text
 * colour that rescues a dark wrapper is often a fragment inside a multi-line
 * `cn()` call, which `classStrings` does not match. For "did anybody set a
 * colour in here" a raw scan is both simpler and more complete.
 */
function subtreeTextTokens(lines, tags, self, palette) {
  const start = self.attrEnd + 1;
  let end = lines.length - 1;
  for (let i = tags.indexOf(self) + 1; i < tags.length; i++) {
    if (tags[i].indent <= self.indent) {
      end = tags[i].line - 1;
      break;
    }
  }
  const found = [];
  for (let l = start; l <= end; l++) {
    for (const [, token, opacity] of lines[l].matchAll(
      /\btext-([a-z][a-z0-9-]*)(?:\/(\d+))?\b/g,
    )) {
      if (palette.has(token)) {
        found.push({ token, opacity: opacity === undefined ? 100 : Number(opacity) });
      }
    }
  }
  return found;
}

function analyse(palette) {
  const explicit = [];
  const inherited = [];
  const onPage = [];
  const suppressed = [];
  const pageBg = palette.get('background');

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf-8');
    const lines = source.split('\n');
    const rel = relative(process.cwd(), file);
    const tags = indexTags(lines);

    const candidates = [];
    lines.forEach((line, i) => {
      for (const c of classStrings(line)) candidates.push({ ...c, line: i + 1 });
    });
    candidates.push(...variantClassStrings(source));

    for (const { body, kind, line: lineNo } of candidates) {
      {
        const i = lineNo - 1;
        const list = body.split(/\s+/).filter(Boolean);
        const self = kind === 'jsx' ? owningTag(tags, i) : null;

        // Non-text contrast (1.4.11) is out of scope — see the header note.
        if (self && /^(svg|path|circle|rect|line|polyline|polygon|g)$/i.test(self.tag)) {
          continue;
        }

        const why = suppression(lines, i);
        if (why) {
          suppressed.push({ file: rel, line: i + 1, why });
          continue;
        }

        // A class list assembled by interpolation does not reveal its own
        // fill, so measuring its text against an *enclosing* fill would be
        // measuring the wrong surface.
        const interpolated = /\$\{/.test(body);

        const groups = groupByVariant(list);
        const plain = groups.get('') ?? [];
        const plainBg = solidBg(plain, palette);
        const plainText = readableText(plain, palette);
        const outer = self ? enclosingBg(lines, tags, self, palette) : null;

        for (const [prefix, group] of groups) {
          const ownBg = solidBg(group, palette);
          const own = readableText(group, palette);

          // A variant group that contributes neither a fill nor a text colour
          // renders exactly the default state, which the `''` group already
          // judged. Reporting it again once per `hover:`/`focus-visible:`/
          // `disabled:` prefix is the same finding four times over.
          if (prefix !== '' && !ownBg && own.length === 0) continue;

          const bg = ownBg ?? plainBg;
          const texts = own.length > 0 ? own : plainText;
          const state = prefix === '' ? '' : ` [${prefix}]`;

          if (!bg) {
            if (interpolated) continue;
            // No fill of its own. Measure against the enclosing surface when
            // there is one; otherwise the page background, and then only for
            // dark text — light text with no resolvable parent is almost
            // always on a dark section this script cannot see.
            const surface = outer ? palette.get(outer.token) : pageBg;
            for (const text of texts) {
              const hex = palette.get(text.token);
              if (!outer && luminance(hex) > 0.4) continue;
              const ratio = contrast(surface, hex);
              if (ratio < AA) {
                onPage.push({
                  file: rel,
                  line: i + 1,
                  text: text.token,
                  surface: outer ? outer.token : 'background',
                  from: outer ? outer.line : null,
                  state,
                  ratio,
                  snippet: body.slice(0, 90),
                });
              }
            }
            continue;
          }

          const bgHex = palette.get(bg.token);

          if (texts.length === 0) {
            // A fill with no text colour inherits Onyx from body. Only a
            // problem when the fill is dark enough that near-black on it is
            // unreadable.
            const ratio = contrast(bgHex, palette.get('foreground'));
            if (ratio >= AA_LARGE) continue;

            // ...and only when nothing in the subtree sets a colour. A dark
            // section wrapper whose children choose their own text colours is
            // correct, and judging the wrapper in isolation was the whole of
            // this category's false-positive rate. Those child colours are
            // not checked here: this element is their nearest enclosing
            // background, so the on-surface pass measures them against it.
            const subtree = self ? subtreeTextTokens(lines, tags, self, palette) : [];
            if (subtree.length > 0) continue;

            // Decorative shapes have no label to lose — see looksInteractive.
            if (!looksInteractive(group.length ? group : plain)) continue;

            inherited.push({
              file: rel,
              line: i + 1,
              bg: bg.token,
              state,
              ratio,
              snippet: body.slice(0, 90),
            });
            continue;
          }

          for (const text of texts) {
            const ratio = contrast(bgHex, palette.get(text.token));
            if (ratio < AA) {
              explicit.push({
                file: rel,
                line: i + 1,
                bg: bg.token,
                text: text.token,
                state,
                ratio,
                snippet: body.slice(0, 90),
              });
            }
          }
        }
      }
    }
  }

  return { explicit, inherited, onPage, suppressed };
}

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

const palette = loadPalette();
const { explicit, inherited, onPage, suppressed } = analyse(palette);

console.log('Palette in use:');
for (const name of ['onyx', 'bone', 'navy', 'champagne', 'hunter', 'stone', 'foreground']) {
  if (palette.has(name)) console.log(`  ${name.padEnd(12)} ${palette.get(name)}`);
}

console.log(`\n== Explicit pairings below AA (${AA}:1) ==`);
if (explicit.length === 0) console.log('  none');
for (const f of explicit.sort((a, b) => a.ratio - b.ratio)) {
  console.log(
    `  ${f.ratio.toFixed(2)}:1  bg-${f.bg} + text-${f.text}${f.state}  ${f.file}:${f.line}`,
  );
  console.log(`            ${f.snippet}`);
}

console.log('\n== Dark fill, no text colour anywhere in the subtree ==');
if (inherited.length === 0) console.log('  none');
for (const f of inherited.sort((a, b) => a.ratio - b.ratio)) {
  console.log(`  ${f.ratio.toFixed(2)}:1  bg-${f.bg}${f.state}  ${f.file}:${f.line}`);
  console.log(`            ${f.snippet}`);
}

console.log('\n== Text on its enclosing surface, below AA ==');
if (onPage.length === 0) console.log('  none');
for (const f of onPage.sort((a, b) => a.ratio - b.ratio)) {
  const where = f.from ? `bg-${f.surface} (line ${f.from})` : 'page background';
  console.log(
    `  ${f.ratio.toFixed(2)}:1  text-${f.text}${f.state} on ${where}  ${f.file}:${f.line}`,
  );
  console.log(`            ${f.snippet}`);
}

console.log('\n== Suppressed by an explicit `contrast-ok:` comment ==');
if (suppressed.length === 0) console.log('  none');
for (const s of suppressed) {
  console.log(`  ${s.file}:${s.line}  ${s.why}`);
}

const total = explicit.length + inherited.length + onPage.length;
console.log(
  `\n${explicit.length} explicit, ${inherited.length} inherited, ` +
    `${onPage.length} on-surface, ${suppressed.length} suppressed.`,
);

if (total > 0) {
  console.error(
    `\nFAIL: ${total} contrast finding(s). Fix the colour, or — if this is a ` +
      `surface the script cannot resolve — say so in a comment naming the ` +
      `parent that makes it safe.`,
  );
  process.exitCode = 1;
} else {
  console.log('\nPASS: no contrast findings.');
}
