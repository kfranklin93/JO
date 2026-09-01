# Design Token Restoration — Tasks

- [ ] 1. Migrate the palette into a `@theme` block
  - Add a `@theme` block to `src/app/globals.css` after the Tailwind import, carrying the full palette (`navy`, `cerulean`, `bronze`, `mocha`, `linen`, `onyx`, `champagne`, `stone`, `silver`, `surface`, `border`, `background`, `foreground`, the `neutral` 50-950 ramp, and the semantic `primary` / `secondary` / `accent` / `muted` groups with their `foreground` and `hover` variants)
  - Map the non-colour tokens to their v4 namespaces: `--font-serif` / `--font-sans` / `--font-mono`, `--shadow-soft`, `--container-content: 80rem` for `max-w-content`, and `--radius-xl: 1rem`
  - Trim `:root` to variables that genuinely should not generate utilities: `--background`, `--foreground`, `--accent`, `--accent-hover`, and `color-scheme`; remove the unreferenced duplicate neutral variables
  - Delete `tailwind.config.ts`
  - Correct the `<body>` class in `src/app/layout.tsx` — `bg-mocha` currently produces nothing, and once tokens work it would apply warm near-black over the intended linen background
  - Add a build assertion test that compiles the stylesheet against a fixture using `bg-navy`, `text-cerulean`, `shadow-soft`, and `max-w-content`, asserting the generated CSS contains each declaration
  - Verify with a temporary scratch route rendering each token, then delete the scratch route before closing the task
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 2. Replace the arbitrary colour escapes
  - Work through `layout/Navigation.tsx` first — its `bg-[black]` dropdown panels contain `text-[black]` items, so the menu is currently black on black; the active-link colour is also `text-[black]` over a dark hero
  - Then `ui/Input.tsx`, `ui/Textarea.tsx`, `forms/FormNavigation.tsx`, `sections/PropertyCategories.tsx`, `sections/SocialProof.tsx`, `sections/ValueProposition.tsx`
  - Then the `(marketing)` pages: `privacy`, `terms`, `buy-home`, `sell-home`, `get-started`
  - Choose tokens by intent rather than mechanically — several escapes used `black` where a light or accent token was meant, particularly `ValueProposition.tsx`'s eyebrow which is currently invisible on its dark background
  - Verify each changed text-on-background pair meets WCAG AA: 4.5:1 for body text, 3:1 for large text
  - Add a grep-based regression test asserting no `[black]` or `[white]` arbitrary colour escape remains under `src/`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 3. Fix the error boundaries
  - Rename `src/app/error.tsx` to `src/app/global-error.tsx`, matching the document shell it already renders and the `GlobalError` name it already uses
  - Add a new `src/app/error.tsx` for in-layout errors with no `<html>` or `<body>`, styled with working tokens
  - Use `unstable_retry` as the recovery action in both boundaries, not `reset` — the shipped Next 16.2 docs recommend it because it re-fetches before re-rendering, whereas `reset` re-renders straight back into the same error on a data-driven page
  - Verify a thrown error renders inside the site chrome with exactly one `<html>` element in the DOM
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Update the steering rule
  - Change the accent-colour rule in `.kiro/steering/project.md` to name the `@theme` block in `src/app/globals.css` instead of the deleted `tailwind.config.ts`
  - Keep the prohibition on hardcoded hex values in force
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. Verify the spec
  - Run `npm test`, `npm run typecheck`, and `npm run build`
  - Compare before and after on the navigation dropdown, `/privacy`, `/terms`, and `/buy-home`
  - Confirm `Button.tsx` variants render their intended colours, since none of them resolve today
  - Throw an error from a marketing page and confirm the boundary renders correctly with a single document
  - _Requirements: 1.2, 2.3, 2.4, 3.2, 3.3_
