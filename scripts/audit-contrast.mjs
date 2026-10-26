#!/usr/bin/env node
/**
 * Contrast audit for the component tree.
 *
 * Scans every className string under src/ for a background token and a text
 * token used together, computes the WCAG contrast ratio from the real palette
 * in globals.css, and reports anything below the AA threshold.
 *
 * It also reports the case that produced the bug this script was written for:
 * an element that sets a *dark background and no text colour*. Those inherit
 * `--color-foreground` from `body`, which is Onyx — so the label renders
 * near-black on a dark fill and is effectively invisible. Nothing in the type
 * system or the existing tests catches that, because both halves are
 * individually valid.
 *
 * Usage:  node scripts/audit-contrast.mjs
 *
 * Deliberately heuristic. It reads class strings, not rendered output, so it
 * cannot resolve a colour inherited from a parent element or set by a variant
 * map in another file. Treat a clean run as "no obvious pairing errors", not as
 * proof of accessibility — the real check is a browser and a human.
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
 */
function classStrings(source) {
  const out = [];
  const re = /(?:className|class)\s*=\s*(?:\{)?([`'"])([\s\S]*?)\1/g;
  for (const [, , body] of source.matchAll(re)) out.push(body);
  // Variant maps: `primary: 'bg-x text-y ...'`
  const variant = /^\s*\w+:\s*(['"`])([^'"`]*(?:bg-|text-)[^'"`]*)\1/gm;
  for (const [, , body] of source.matchAll(variant)) out.push(body);
  return out;
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
 * Whether a class list describes something a user clicks or reads as a unit.
 *
 * Section wrappers like `bg-navy py-32` legitimately set a dark background and
 * let their children choose text colours, so flagging them for having no text
 * colour is noise. A button or badge sets its own padding and rounding and is
 * expected to be self-contained — that is where a missing text colour actually
 * renders an invisible label.
 */
function looksInteractive(list) {
  const hasPadding = list.some((c) => /^p[xy]?-/.test(c));
  const hasShape = list.some((c) => /^rounded/.test(c));
  const isLayoutOnly = list.some((c) => /^(py|px)-(2[0-9]|3[0-9]|40)$/.test(c));
  return hasPadding && hasShape && !isLayoutOnly;
}

function analyse(palette) {
  const failures = [];
  const inherited = [];
  const onPage = [];

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf-8');
    const rel = relative(process.cwd(), file);

    source.split('\n').forEach((line, i) => {
      for (const classes of classStrings(line)) {
        const list = classes.split(/\s+/).filter(Boolean);

        // Only unprefixed classes describe the default (non-hover) state.
        const plain = list.filter((c) => !c.includes(':'));

        // Solid fills only. A translucent background composites with whatever
        // is behind it, which a class string does not reveal.
        const bgs = plain
          .map((c) => bareToken(c, 'bg-'))
          .filter((t) => t && palette.has(t.token) && t.opacity === 100);
        const texts = plain
          .map((c) => bareToken(c, 'text-'))
          .filter((t) => t && palette.has(t.token) && t.opacity >= 70);

        // Text with no background in the same class list. This is the common
        // case and the first version of this script missed all of it: most
        // copy sits directly on the page background, so `text-neutral-400`
        // with no `bg-` anywhere is still a contrast failure. Checked against
        // Bone, the body background.
        //
        // Light text is excluded: it is almost always sitting on a dark
        // section wrapper declared in a parent element, which a class string
        // cannot see. Dark-on-light is the direction this can judge safely.
        if (bgs.length === 0) {
          const pageBg = palette.get('background');
          for (const text of texts) {
            const hex = palette.get(text.token);
            if (luminance(hex) > 0.4) continue; // light text, parent unknown
            const ratio = contrast(pageBg, hex);
            if (ratio < AA) {
              onPage.push({
                file: rel,
                line: i + 1,
                text: text.token,
                ratio,
                snippet: classes.slice(0, 90),
              });
            }
          }
          continue;
        }

        for (const bg of bgs) {
          const bgHex = palette.get(bg.token);

          // A dark fill with no text colour inherits Onyx from body. Only
          // meaningful on self-contained elements — see looksInteractive.
          if (texts.length === 0) {
            if (!looksInteractive(plain)) continue;
            const ratio = contrast(bgHex, palette.get('foreground'));
            if (ratio < AA_LARGE) {
              inherited.push({
                file: rel,
                line: i + 1,
                bg: bg.token,
                ratio,
                snippet: classes.slice(0, 90),
              });
            }
            continue;
          }

          for (const text of texts) {
            const ratio = contrast(bgHex, palette.get(text.token));
            if (ratio < AA) {
              failures.push({
                file: rel,
                line: i + 1,
                bg: bg.token,
                text: text.token,
                ratio,
                snippet: classes.slice(0, 90),
              });
            }
          }
        }
      }
    });
  }

  return { failures, inherited, onPage };
}

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

const palette = loadPalette();
const { failures, inherited, onPage } = analyse(palette);

console.log('Palette in use:');
for (const name of ['onyx', 'bone', 'navy', 'champagne', 'hunter', 'stone', 'foreground']) {
  if (palette.has(name)) console.log(`  ${name.padEnd(12)} ${palette.get(name)}`);
}

console.log(`\n== Explicit pairings below AA (${AA}:1) ==`);
if (failures.length === 0) console.log('  none');
for (const f of failures.sort((a, b) => a.ratio - b.ratio)) {
  console.log(
    `  ${f.ratio.toFixed(2)}:1  bg-${f.bg} + text-${f.text}  ${f.file}:${f.line}`,
  );
}

console.log('\n== Dark fill, no text colour (inherits Onyx) ==');
if (inherited.length === 0) console.log('  none');
for (const f of inherited.sort((a, b) => a.ratio - b.ratio)) {
  console.log(`  ${f.ratio.toFixed(2)}:1  bg-${f.bg}  ${f.file}:${f.line}`);
  console.log(`            ${f.snippet}`);
}

console.log(`\n== Dark text on the page background, below AA ==`);
if (onPage.length === 0) console.log('  none');
const seen = new Set();
for (const f of onPage.sort((a, b) => a.ratio - b.ratio)) {
  const key = `${f.file}:${f.text}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${f.ratio.toFixed(2)}:1  text-${f.text}  ${f.file}:${f.line}`);
}

console.log(
  `\n${failures.length} explicit, ${inherited.length} inherited risk(s), ${onPage.length} on-page (${seen.size} unique file/token).`,
);
