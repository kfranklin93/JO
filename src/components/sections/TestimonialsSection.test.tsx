// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestimonialsSection } from './TestimonialsSection';

/**
 * `whileInView` wants an IntersectionObserver and jsdom has none, so without
 * this the animated wrappers stay at `opacity: 0` and their text is unreachable
 * by an accessible query. Same stub as the page tests.
 */
class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/**
 * Tests for the testimonials section.
 *
 * Two behaviours, both of which were absent when this section was rendering six
 * invented clients:
 *
 *  - with no testimonials it renders nothing, rather than a "What My Clients
 *    Say" heading and a sub-head about real stories standing over an empty grid;
 *  - with a real one it renders the attribution. A quote shown without a link
 *    to where it was published is unverifiable to a visitor, which is the gap
 *    the fabricated entries sat in.
 */
describe('the testimonials section', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/data/testimonials');
  });

  it('renders nothing while there are no testimonials', () => {
    const { container } = render(<TestimonialsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('links a real review back to the platform it was published on', async () => {
    vi.resetModules();
    vi.doMock('@/data/testimonials', () => ({
      clientTestimonials: [
        {
          name: 'Real Reviewer',
          role: 'Seller',
          location: 'Marietta, GA',
          content: 'Published somewhere a visitor can check it.',
          rating: 5,
          source: {
            platform: 'Zillow',
            url: 'https://www.zillow.com/profile/JoeyOberndorfer',
            datePublished: '2025-03-14',
          },
        },
      ],
    }));

    const { TestimonialsSection: Wired } = await import('./TestimonialsSection');
    render(<Wired />);

    expect(screen.getByRole('heading', { name: /what my clients say/i })).toBeInTheDocument();

    const attribution = screen.getByRole('link', { name: /read this review on zillow/i });
    expect(attribution).toHaveAttribute('href', 'https://www.zillow.com/profile/JoeyOberndorfer');
    expect(attribution).toHaveAttribute('rel', expect.stringContaining('noopener'));

    expect(screen.getByText(/march 2025/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /5 out of 5 stars/i })).toBeInTheDocument();
  });
});
