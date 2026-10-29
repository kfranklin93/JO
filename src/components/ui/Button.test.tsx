// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, type ButtonProps } from './Button';

/**
 * Tests for the Button variant map.
 *
 * This map had no tests at all, which is how it came to hold a variant that is
 * invisible on half the surfaces it might be placed on. `ghost` is
 * `bg-transparent text-navy`: correct on Bone, about 1:1 on a dark section, and
 * indistinguishable from correct in a type signature, because the surface is
 * declared in whatever component renders the button.
 *
 * So the assertions below are mostly about pairings rather than about rendering.
 * The two that earn their keep:
 *
 *  - every variant sets a text colour. A variant that sets only a fill inherits
 *    `--color-foreground` (Onyx) from `body`, and on a dark fill that is a
 *    near-black label on near-black — the original bug, invisible to the type
 *    system because both halves are individually valid.
 *  - `onDark` pairs bone with bone. It is the variant that exists so a call
 *    site on a dark surface does not hand-roll a colour override, which is what
 *    four of MagneticButton's call sites were doing.
 *  - the two `champagne` variants keep gold as a fill and never as ink, and
 *    keep their focus ring off hunter. Both halves of that are things the
 *    hero got wrong by hand: a hunter button on a hunter section, with a
 *    hunter focus ring.
 */

const VARIANTS: NonNullable<ButtonProps['variant']>[] = [
  'primary',
  'secondary',
  'outline',
  'ghost',
  'onDark',
  'champagne',
  'champagneOutline',
  'danger',
];

/** Classes on a freshly rendered button, scoped so a test may call it twice. */
function classesFor(props: ButtonProps = {}): string[] {
  const { container } = render(<Button {...props}>Press</Button>);
  return (container.querySelector('button')?.getAttribute('class') ?? '').split(/\s+/);
}

describe('Button variants', () => {
  it('defaults to the primary action colour with bone text', () => {
    const classes = classesFor();
    expect(classes).toContain('bg-cerulean');
    expect(classes).toContain('text-bone');
    // Never white on a brand surface — see the @theme note in globals.css.
    expect(classes).not.toContain('text-white');
  });

  it.each(VARIANTS)('sets an explicit text colour on the %s variant', (variant) => {
    // A variant with a fill and no text colour inherits Onyx from body.
    const classes = classesFor({ variant });
    expect(classes.some((c) => /^text-/.test(c))).toBe(true);
  });

  it('gives onDark a bone outline that fills to bone with a hunter label', () => {
    const classes = classesFor({ variant: 'onDark' });
    expect(classes).toContain('border-bone');
    expect(classes).toContain('text-bone');
    expect(classes).toContain('hover:bg-bone');
    expect(classes).toContain('hover:text-hunter');
    // The whole point of the variant: no navy ink to disappear into the dark.
    expect(classes).not.toContain('text-navy');
  });

  it('gives champagne a gold fill with the theme-decided onyx label', () => {
    const classes = classesFor({ variant: 'champagne' });
    expect(classes).toContain('bg-champagne');
    expect(classes).toContain('text-champagne-foreground');
    // Gold carries onyx, never white and never bone — 2.4:1 and 2.3:1.
    expect(classes).not.toContain('text-white');
    expect(classes).not.toContain('text-bone');
  });

  it('gives champagneOutline a gold border, a bone label and a gold hover fill', () => {
    const classes = classesFor({ variant: 'champagneOutline' });
    expect(classes).toContain('border-champagne');
    expect(classes).toContain('text-bone');
    expect(classes).toContain('hover:bg-champagne');
    expect(classes).toContain('hover:text-champagne-foreground');
    // Gold is the fill here, never the ink: gold text is 2.0:1 on bone, and a
    // variant map cannot know which surface it lands on.
    expect(classes).not.toContain('text-champagne');
  });

  it('keeps the champagne variants off a hunter focus ring', () => {
    // The hero's Search button had `outline-cerulean`, which is hunter, on
    // what is now a hunter section: a focus ring the same colour as the page.
    for (const variant of ['champagne', 'champagneOutline'] as const) {
      const classes = classesFor({ variant });
      expect(classes).toContain('focus-visible:outline-bone');
      expect(classes).not.toContain('focus-visible:outline-cerulean');
    }
  });

  it('keeps outline and ghost as light-surface variants', () => {
    // Documenting the hazard rather than guarding against it: both carry navy
    // ink, so neither may be used on a dark section. If either ever gains a
    // bone text colour, the comment above the variant map is stale and
    // `onDark` has lost its reason to exist.
    for (const variant of ['outline', 'ghost'] as const) {
      expect(classesFor({ variant })).toContain('text-navy');
    }
  });

  it('lets a caller className beat the variant colour', () => {
    // `cn()` is twMerge(clsx()), and the onDark variant's documentation leans
    // on this: an override at the call site is possible, so the variant has to
    // be the easier choice rather than the only one.
    const classes = classesFor({ variant: 'primary', className: 'bg-hunter' });
    expect(classes).toContain('bg-hunter');
    expect(classes).not.toContain('bg-cerulean');
  });

  it('applies the requested size and keeps the 44px touch target', () => {
    expect(classesFor({ size: 'sm' })).toContain('min-h-11');
    expect(classesFor({ size: 'lg' })).toContain('min-h-12');
    expect(classesFor({ size: 'icon' })).toContain('min-w-11');
  });

  it('renders the loading label and marks the control busy', () => {
    render(
      <Button loading loadingLabel="Saving">
        Save
      </Button>
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Saving');
  });
});
