// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MagneticButton, type MagneticButtonProps } from './MagneticButton';

/**
 * Tests for the MagneticButton variant map.
 *
 * This is the component the black-on-navy report was actually about. Its
 * `outline` variant is `border-2 border-navy text-navy` with no background, so
 * on a dark section it is dark-on-dark at roughly 1:1. Four of its five
 * `outline` call sites sat on navy or near-black surfaces and were legible only
 * because each passed its own colour override in `className` — a fix that works
 * and that nothing enforces, so the fifth call site to be written gets it
 * wrong. `onDark` replaces that pattern, and these tests are what keep it from
 * being "simplified" back out.
 *
 * GSAP is mocked. The cursor-follow animation is not what this file is about,
 * and `gsap.context` touches layout APIs that jsdom does not implement.
 */

vi.mock('gsap', () => ({
  gsap: {
    to: vi.fn(),
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert: vi.fn() };
    }),
  },
}));

const VARIANTS: NonNullable<MagneticButtonProps['variant']>[] = [
  'primary',
  'secondary',
  'outline',
  'onDark',
];

/** Classes on a freshly rendered control, scoped so a test may call it twice. */
function classesFor(props: Partial<MagneticButtonProps> = {}): string[] {
  const { container } = render(<MagneticButton {...props}>Connect</MagneticButton>);
  const el = container.querySelector('a, button');
  return (el?.getAttribute('class') ?? '').split(/\s+/);
}

describe('MagneticButton variants', () => {
  it('defaults to the primary action colour with bone text', () => {
    const classes = classesFor();
    expect(classes).toContain('bg-cerulean');
    expect(classes).toContain('text-bone');
    expect(classes).not.toContain('text-white');
  });

  it.each(VARIANTS)('sets an explicit text colour on the %s variant', (variant) => {
    // Without one the label inherits Onyx from body and disappears on a dark
    // fill. Both halves look valid in isolation, which is why this is a test
    // rather than a type.
    const classes = classesFor({ variant });
    expect(classes.some((c) => /^text-/.test(c))).toBe(true);
  });

  it('gives onDark a bone outline that fills to bone with a hunter label', () => {
    const classes = classesFor({ variant: 'onDark' });
    expect(classes).toContain('border-bone');
    expect(classes).toContain('text-bone');
    expect(classes).toContain('hover:bg-bone');
    expect(classes).toContain('hover:text-hunter');
    expect(classes).not.toContain('text-navy');
  });

  it('keeps outline as a light-surface variant with no background', () => {
    // The hazard, stated as an assertion: navy ink and no fill. A dark section
    // needs `onDark`. If this ever starts carrying bone, the variant-map
    // comment is stale.
    const classes = classesFor({ variant: 'outline' });
    expect(classes).toContain('text-navy');
    expect(classes.some((c) => /^bg-/.test(c))).toBe(false);
  });

  it('lets a caller className beat the variant colour', () => {
    // twMerge, relied on deliberately: the hero keeps its frosted-glass fill
    // over the variant's colours rather than restating them.
    const classes = classesFor({ variant: 'onDark', className: 'bg-bone/10' });
    expect(classes).toContain('bg-bone/10');
    expect(classes).toContain('text-bone');
  });

  it('renders a link when given an href', () => {
    render(<MagneticButton href="/contact">Go</MagneticButton>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/contact');
  });

  it('renders a button when given no href', () => {
    render(<MagneticButton onClick={() => {}}>Act</MagneticButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders a disabled button rather than a link when disabled', () => {
    // A disabled <a> is still followable, so the href path is skipped.
    render(
      <MagneticButton href="/contact" disabled>
        Blocked
      </MagneticButton>
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
