# Quiet Luxury Visual Fix Plan

## Overview

The codebase has correct structural logic but broken visual rendering caused by three root-level bugs:

1. **`bg-mocha` is undefined** — `src/app/layout.tsx` applies `bg-mocha` to `<body>`, but this token does not exist in `tailwind.config.ts` or `globals.css`. Tailwind drops it silently, leaving the body background unset (browser default white), while some sections render on their own backgrounds. This is the primary rendering issue.

2. **`--foreground` resolves to `#000000` (pure black)** — `globals.css` defines `--foreground: #000000` and the body carries `text-foreground`. Any dark-background section that does not explicitly override `color` on its child elements renders black text on a black/dark background — invisible.

3. **Design token fragmentation** — Three competing token sources exist: `tailwind.config.ts`, `globals.css` CSS variables, and `src/styles/theme.ts` (unused in components). The `accent` token is `#D4AF37` in Tailwind config but `#f59e0b` in `theme.ts`. Components reference both, leading to inconsistent gold usage.

### Scope

Fix CSS/Tailwind token layer, global body defaults, and explicit color scoping across all section and UI components. **No structural logic, content, props, or component hierarchy changes.**

---

## Sub-Tasks

---

### Task 1 — Fix `tailwind.config.ts` Design System Tokens

**Status:** `[ ] pending`

**Intent:**
Register all Quiet Luxury palette tokens as named Tailwind colors so every component can use semantic utility classes. Add the missing `mocha` token. Update `accent` to champagne gold `#C5A059`. Introduce `linen`, `navy`, `onyx`, `stone`, `silver` tokens. Remove the unused conflicting `theme.ts` file.

**Expected Outcomes:**
- `bg-mocha` resolves (body background appears)
- `bg-linen`, `text-navy`, `text-stone`, `text-silver`, `bg-onyx`, `text-champagne` all resolve as valid Tailwind utilities
- `accent` consistently refers to Champagne Gold `#C5A059` across the entire codebase
- `src/styles/theme.ts` deleted (was unused, was causing confusion with its different `#f59e0b` accent value)

**Todo:**
1. Open `tailwind.config.ts`
2. Add the following named colors under `theme.extend.colors`:
   - `mocha: '#1C1917'` (warm near-black for body background)
   - `linen: '#FAF9F6'` (light surface canvas)
   - `navy: '#1C2A39'` (dark surface & deep primary text)
   - `onyx: '#0D1117'` (deep dark sections)
   - `champagne: '#C5A059'` (accent gold — rename current `accent.DEFAULT` from `#D4AF37` to `#C5A059`, update `accent.hover` to `#b08e4a`)
   - `stone: '#707070'` (secondary light-mode body text)
   - `silver: '#8E8E93'` (secondary dark-mode body text)
3. Delete `src/styles/theme.ts`

**Relevant Context:**
- `tailwind.config.ts` line 12–49 — current color definitions
- `src/app/layout.tsx` line 39 — `bg-mocha` reference
- `src/styles/theme.ts` — unused file with conflicting accent `#f59e0b`

---

### Task 2 — Fix `globals.css` Root Variables & Body Defaults

**Status:** `[ ] pending`

**Intent:**
Set explicit root-level CSS variables that match the new token palette. Hardcode the body to light-mode with `color-scheme: light` to prevent OS dark-mode bleed. Set body background to `#FAF9F6` (linen) and color to `#1C2A39` (navy) so default text is dark-on-light and readable everywhere.

**Expected Outcomes:**
- Body renders a warm linen background by default
- Default text color is Midnight Navy, not black — passes WCAG AA contrast on linen
- OS dark-mode can no longer invert the entire site unexpectedly
- `--color-background` and `--color-foreground` CSS variables are semantically correct for the design system

**Todo:**
1. Open `src/app/globals.css`
2. Update `:root` block:
   - `--background: #FAF9F6`
   - `--foreground: #1C2A39`
   - `--accent: #C5A059`
   - `--accent-hover: #b08e4a`
   - Add `color-scheme: light`
3. Update `body` rule:
   - `background-color: var(--background)`
   - `color: var(--foreground)`
   - Ensure no `@media (prefers-color-scheme: dark)` block exists (there is none currently — confirm and leave clear)

**Relevant Context:**
- `src/app/globals.css` lines 3–14 — current `:root` block
- `src/app/globals.css` lines 26–35 — current `body` rule
- `src/app/layout.tsx` line 39 — body uses `bg-mocha` (will now resolve correctly after Task 1)

---

### Task 3 — Fix Dark-Section Text Contrast (MarketStatsSection, FinalCTA, About "Off the Clock")

**Status:** `[ ] pending`

**Intent:**
These sections use `bg-black`, `bg-primary`, or explicit dark surfaces. They already have `text-white` / `text-white/80` on most text — but `FinalCTA`'s body copy uses `text-neutral-300` (which resolves correctly) and its trust-badge items use `text-neutral-400`. The `bg-primary` resolves to `#000000` (pure black). Update `FinalCTA` to use `bg-navy` (`#1C2A39`) instead of `bg-primary` for a warmer dark tone, and ensure eyebrow/kicker label patterns use the champagne accent token.

**Expected Outcomes:**
- `FinalCTA` section background is Midnight Navy, not dead black — visual warmth and brand consistency
- All heading, body copy, and trust-badge text in dark sections is explicitly light and readable
- No text-on-dark contrast failures

**Todo:**
1. Open `src/components/sections/FinalCTA.tsx`
2. Change section class from `bg-primary` to `bg-navy`
3. Change `h2` class from `text-primary-foreground` to `text-linen`
4. Change trust-badge icon/text from `text-neutral-400` to `text-silver`
5. Change `text-neutral-300` paragraph to `text-silver`
6. Confirm `MarketStatsSection` dark headings are `text-white` (already correct — verify only)
7. Confirm `about/page.tsx` "Off the Clock" section `bg-[black]` paragraphs have `text-[white]/80` (already correct — verify only)

**Relevant Context:**
- `src/components/sections/FinalCTA.tsx` lines 10, 18, 21, 48, 52, 55, 59
- `src/components/sections/MarketStatsSection.tsx` lines 40–44 — already white text
- `src/app/(marketing)/about/page.tsx` lines 115–133

---

### Task 4 — Fix Light-Section Heading & Body Contrast

**Status:** `[ ] pending`

**Intent:**
Light sections (`bg-white`, `bg-neutral-50`) currently use `text-black` for headings and `text-neutral-600` for body copy. These are technically readable but use the wrong design tokens. Systematically replace `text-black` headings with `text-navy` and `text-neutral-600` body text with `text-stone` across all light-surface section components.

**Expected Outcomes:**
- All section headings on light backgrounds use `text-navy` (warm dark instead of flat black)
- All body copy on light backgrounds uses `text-stone` (warm mid-gray)
- Eyebrow/kicker labels use `text-champagne` + `uppercase tracking-[0.2em] text-xs font-sans` pattern

**Todo:**
1. `WhyJoeySection.tsx` — replace `text-black` h2/h3 with `text-navy`, `text-neutral-600` with `text-stone`, icon hover `text-accent` stays (accent token will now be champagne)
2. `TestimonialsSection.tsx` — replace `text-black` h2 with `text-navy`, `text-neutral-600`/`text-neutral-700` with `text-stone`
3. `NeighborhoodsSection.tsx` — replace `text-black` h2/h3 with `text-navy`, body text to `text-stone`
4. `BuyersGuideSection.tsx` — replace `text-black` h2/h3 with `text-navy`, body text to `text-stone`
5. `TeamSection.tsx` — replace `text-black` h2/h3 with `text-navy`, `text-neutral-600`/`text-neutral-700` to `text-stone`
6. `Header.tsx` — logo text `text-black` → `text-navy`, phone link `text-neutral-700` → `text-stone`
7. `Footer.tsx` — section headings `text-black` → `text-navy`, link text `text-neutral-600` → `text-stone`

**Relevant Context:**
- All files listed above — search for `text-black` and `text-neutral-600` / `text-neutral-700` occurrences in light-surface containers

---

### Task 5 — Fix CTA & Button Color Scoping

**Status:** `[ ] pending`

**Intent:**
Button variants and MagneticButton currently resolve `bg-primary` to `#000000`. On dark sections this is invisible (black-on-black). The Primary CTA style should be solid champagne gold with navy text. The Outline CTA on dark backgrounds should be gold-bordered with linen text. The Outline CTA on light backgrounds should be navy-bordered with navy text.

**Expected Outcomes:**
- `Button` `primary` variant: `bg-champagne text-navy hover:bg-[#b08e4a]`
- `Button` `secondary` variant: `bg-linen text-navy hover:bg-neutral-200`
- `Button` `outline` variant: `border-navy text-navy hover:bg-navy hover:text-linen`
- `MagneticButton` `primary` variant: same champagne gold treatment
- `MagneticButton` `outline` variant: border/text inherits from parent surface context (pass explicit className overrides for dark-bg usage — pattern already exists in `FinalCTA.tsx`)
- `WhyJoeySection` bottom CTA link: updated to `bg-champagne text-navy`
- `ServicesInquiryForm` service-card hover: `hover:border-champagne` instead of `hover:border-primary`

**Todo:**
1. Open `src/components/ui/Button.tsx`
2. Update `buttonVariants.variant.primary` to `bg-champagne text-navy hover:bg-[#b08e4a]`
3. Update `buttonVariants.variant.outline` to `border-2 border-navy text-navy hover:bg-navy hover:text-linen`
4. Open `src/components/ui/MagneticButton.tsx`
5. Update `variants.primary` to `bg-champagne text-navy border-2 border-champagne hover:bg-[#b08e4a]`
6. Update `variants.outline` to `border-2 border-navy text-navy hover:bg-navy hover:text-linen`
7. Open `src/components/sections/WhyJoeySection.tsx` — update bottom CTA link class to champagne-primary pattern
8. Open `src/components/forms/ServicesInquiryForm.tsx` — update service card hover border from `hover:border-primary` to `hover:border-champagne`

**Relevant Context:**
- `src/components/ui/Button.tsx` lines 8–17
- `src/components/ui/MagneticButton.tsx` lines 97–101
- `src/components/sections/WhyJoeySection.tsx` line 122
- `src/components/forms/ServicesInquiryForm.tsx` lines 139, 150, 161, 172

---

### Task 6 — Fix Header Transparent/Scrolled State & MobileMenu Surface

**Status:** `[ ] pending`

**Intent:**
Keep the white header bar on all pages including the homepage. The only change is fixing the MobileMenu footer CTA hover gold from the hard-coded `#D4AF37` to the new champagne token `#C5A059`. Header text colors should use `text-navy` instead of `text-black` for brand consistency with the rest of the system (Task 4 already covers the Header, this task is just the mobile menu token fix).

**Expected Outcomes:**
- Header remains `bg-white` on all pages — no transparency change
- MobileMenu footer CTA gold hover uses champagne token instead of hard-coded `#D4AF37`

**Todo:**
1. Open `src/components/layout/MobileMenu.tsx`
2. Update footer CTA hover from hard-coded `hover:bg-[#D4AF37]` to `hover:bg-champagne` and `hover:border-[#D4AF37]` to `hover:border-champagne`

**Relevant Context:**
- `src/components/layout/Header.tsx` lines 68–74 — current `cn()` class logic
- `src/components/layout/Header.tsx` lines 86–92 — logo and name spans
- `src/components/layout/MobileMenu.tsx` line 112 — CTA hover colors

---

### Task 7 — Typography Hardening: Serif Headings + Eyebrow Labels

**Status:** `[ ] pending`

**Intent:**
The `font-serif` mapping uses Bellefair (already imported via Google Fonts in `layout.tsx`). However, the request calls for Playfair Display or Cormorant Garamond as the serif face. Bellefair is a single-weight serif — it is thinner than typical luxury real estate headings. Add Playfair Display as a secondary import option in the font stack fallback. Additionally, add eyebrow/kicker label CSS pattern to globals for reuse.

**Expected Outcomes:**
- Heading elements using `font-serif` render with Bellefair first, Playfair Display as fallback in the font stack (non-breaking change — Bellefair will still display if loaded)
- An `.eyebrow` utility CSS class exists in globals: `font-sans text-xs font-medium uppercase tracking-[0.2em] text-champagne` for reuse
- `MarketStatsSection` stat labels already use `uppercase tracking-wider` — update to `tracking-[0.2em]` for brand consistency

**Todo:**
1. Open `tailwind.config.ts`
2. Update `fontFamily.serif` to `['var(--font-bellefair)', 'Playfair Display', 'Georgia', 'serif']`
3. Open `src/app/globals.css`
4. Add `.eyebrow` utility class block after `img` rule
5. Open `src/components/sections/MarketStatsSection.tsx`
6. Update all `tracking-wider` stat label classes to `tracking-[0.2em]`

**Relevant Context:**
- `tailwind.config.ts` line 51–53
- `src/app/globals.css` lines 42–45
- `src/components/sections/MarketStatsSection.tsx` lines 61, 84, 104, 125

---

## Implementation Order

Tasks must be executed in this order — each builds on the previous:

```
Task 1 (Tokens) → Task 2 (Globals/Body) → Task 3 (Dark Sections) →
Task 4 (Light Sections) → Task 5 (Buttons/CTAs) → Task 6 (Header/Menu) →
Task 7 (Typography)
```

Tasks 3–5 can be run in parallel after Tasks 1 and 2 are confirmed. Tasks 6 and 7 are independent of 3–5.

---

## Files Modified

| File | Task |
|---|---|
| `tailwind.config.ts` | 1, 7 |
| `src/styles/theme.ts` | 1 (deleted) |
| `src/app/globals.css` | 2, 7 |
| `src/components/sections/FinalCTA.tsx` | 3 |
| `src/components/sections/WhyJoeySection.tsx` | 4, 5 |
| `src/components/sections/TestimonialsSection.tsx` | 4 |
| `src/components/sections/NeighborhoodsSection.tsx` | 4 |
| `src/components/sections/BuyersGuideSection.tsx` | 4 |
| `src/components/sections/TeamSection.tsx` | 4 |
| `src/components/layout/Header.tsx` | 4, 6 |
| `src/components/layout/Footer.tsx` | 4 |
| `src/components/ui/Button.tsx` | 5 |
| `src/components/ui/MagneticButton.tsx` | 5 |
| `src/components/forms/ServicesInquiryForm.tsx` | 5 |
| `src/components/layout/MobileMenu.tsx` | 6 |
| `src/components/sections/MarketStatsSection.tsx` | 7 |
