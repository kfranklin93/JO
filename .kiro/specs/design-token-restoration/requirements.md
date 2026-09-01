# Design Token Restoration — Requirements

## Introduction

The site's entire custom colour palette generates no CSS. Tailwind v4 does not automatically detect a JavaScript config file, and `src/app/globals.css` contains neither a `@config` directive to load one nor a `@theme` block to define tokens natively. So `tailwind.config.ts` is inert, and every class built on it — `bg-navy`, `text-cerulean`, `bg-linen`, `shadow-soft`, `max-w-content` — silently produces nothing.

Built-in utilities like `bg-white` and `neutral-200` still work, which is why the site looks partly right rather than obviously broken. The `bg-[black]` and `text-[white]` escapes scattered through the components are workarounds for classes that did nothing, and they are the direct cause of the black-on-black and white-on-white contrast bugs.

This spec is independent of the other four and can run at any point in the sequence.

## Current state

Verified by reading source and confirmed against Tailwind's v4 documentation:

- `src/app/globals.css` opens with `@import "tailwindcss"`. Grepping every CSS file for `@config`, `@theme`, `@plugin`, and `@source` returns zero matches.
- Tailwind's upgrade guide states: "JavaScript config files are still supported for backward compatibility, but they are no longer detected automatically in v4." Loading one requires an explicit `@config` directive.
- Tailwind's theme documentation states that `@theme` is what creates utility classes, and that `:root` should be used only "for defining regular CSS variables that shouldn't have corresponding utility classes."
- `globals.css` defines `--color-background`, `--color-foreground`, and `--color-accent` inside `:root`, not `@theme`, so they generate no utilities.
- `tailwind.config.ts` defines `mocha`, `linen`, `navy`, `onyx`, `champagne`, `stone`, `silver`, `cerulean`, `bronze`, `surface`, `border`, a `neutral` 50-950 ramp, and semantic `primary` / `secondary` / `accent` / `muted` groups, plus `fontFamily`, `boxShadow.soft`, `borderRadius.xl`, and `maxWidth.content`. None of it reaches the build.
- Fonts work by accident: `globals.css` redefines `--font-sans` and `--font-serif` on `:root` *after* the Tailwind import, so those override Tailwind's defaults through ordinary CSS cascade rather than through the theme.
- `src/app/layout.tsx:39` applies `bg-mocha` and `text-foreground` to `<body>`. Neither generates CSS. The body still renders correctly only because `globals.css` sets `background-color` and `color` on `body` in plain CSS.
- `src/components/ui/Button.tsx` builds all its variants from `bg-cerulean`, `bg-linen`, `text-navy`, `bg-surface`, and `border-navy` — so no variant renders its intended colour.
- Arbitrary-value escapes appear in at least `layout/Navigation.tsx` (worst case: `bg-[black]` dropdown panels containing `text-[black]` items), `ui/Input.tsx`, `ui/Textarea.tsx`, `forms/FormNavigation.tsx`, `sections/PropertyCategories.tsx`, `sections/SocialProof.tsx`, `sections/ValueProposition.tsx`, and the `privacy`, `terms`, `buy-home`, `sell-home`, and `get-started` pages.
- `quiet-luxury-visual-fix-plan.md` diagnosed this as missing tokens and prescribed adding them to `tailwind.config.ts`. Those tokens are now present in that file and still do not resolve, because the file is never read.
- `.kiro/steering/project.md` states that the accent colour system is "a single source of truth in tailwind.config.ts" — a rule pointing at a file the build ignores.
- `src/app/error.tsx` renders its own `<html>` and `<body>` and its function is named `GlobalError`. That is the `global-error.tsx` contract; as `error.tsx` it nests a second document inside the root layout.

## Requirements

### Requirement 1 — Working design tokens

**User Story:** As a developer, I want the palette to generate real utility classes, so that the styles written throughout the codebase actually apply.

#### Acceptance Criteria

1. WHEN the stylesheet is compiled THEN design tokens SHALL be declared in a form Tailwind v4 uses to generate utilities
2. WHEN a component uses a custom colour utility THEN that utility SHALL produce CSS
3. WHERE the palette is defined THE definition SHALL be the single source of truth, with no second competing definition
4. WHEN a font utility is used THEN it SHALL resolve through the theme rather than through an incidental cascade override
5. WHEN `shadow-soft`, `max-w-content`, and `rounded-xl` are used THEN each SHALL produce its intended value
6. WHEN a CSS variable is needed that should not generate a utility class THEN it SHALL remain outside the theme block
7. WHEN the token migration is complete THEN the inert configuration file SHALL be removed rather than left to appear authoritative
8. WHEN the neutral colour ramp is referenced THEN values 50 through 950 SHALL all be available

### Requirement 2 — Consistent token usage

**User Story:** As a visitor, I want text to be readable against its background, so that I can actually use the site.

#### Acceptance Criteria

1. WHEN a component previously used an arbitrary colour escape THEN it SHALL use a named token instead
2. WHEN a surface uses a dark background THEN its text SHALL be a light token, and vice versa
3. WHEN the navigation dropdown renders THEN its items SHALL be legible against the panel background
4. WHEN any changed text surface is measured THEN its contrast ratio SHALL meet WCAG AA for its text size
5. WHEN the audit is complete THEN no arbitrary `[black]` or `[white]` colour escape SHALL remain in the component tree
6. WHEN a component's appearance changes THEN the change SHALL be a correction toward the intended design, not an unrelated redesign

### Requirement 3 — Correct error boundaries

**User Story:** As a visitor, I want the error page to render properly, so that a failure does not produce a broken document.

#### Acceptance Criteria

1. WHEN an error boundary renders its own document shell THEN it SHALL use the file convention that owns the document shell
2. WHEN an error occurs inside the root layout's subtree THEN the rendered output SHALL contain exactly one `<html>` element
3. WHEN an error occurs within a page THEN an in-layout error boundary SHALL render inside the existing site chrome
4. WHEN an in-layout error boundary renders THEN it SHALL NOT emit its own `<html>` or `<body>`
5. WHEN an error boundary is displayed THEN it SHALL offer a recovery action

### Requirement 4 — Accurate project guidance

**User Story:** As a developer joining the project, I want the steering rules to point at the real source of truth, so that I do not edit a file that has no effect.

#### Acceptance Criteria

1. WHEN the steering rule describes where the accent colour is defined THEN it SHALL name the file that actually defines it
2. WHEN the steering rule is read after this change THEN following it SHALL produce the intended result
3. WHEN the rule prohibits hardcoded colour values THEN that prohibition SHALL remain in force

## Out of scope

- Redesigning any component's visual treatment beyond correcting broken colours
- Consolidating or deleting the stale root markdown documents, including `quiet-luxury-visual-fix-plan.md` whose diagnosis this spec supersedes
- Converting the homepage from a client component to a server component
- Adding a Content-Security-Policy or Strict-Transport-Security header
- Auditing contrast on surfaces this spec does not otherwise change
