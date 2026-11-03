// @vitest-environment jsdom

/**
 * /sell-home hosts RealScout's home-value widget.
 *
 * Two things are worth holding here.
 *
 * The placement: the widget is this page's only capture surface of its own,
 * and it belongs after the value proposition that makes a seller want it
 * rather than at the bottom of the page. Asserted as document order against
 * the two headings either side of it.
 *
 * The copy: the section above the widget states, in Joey's words, that he
 * reviews a home personally rather than giving a generic online estimate —
 * and this widget returns an automated number. So the page must not present
 * that number as Joey's opinion of the home, and must not start quoting
 * figures or timelines of its own.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { siteConfig } from '@/config/site';
import SellHomePage from './page';

describe('the home-value widget on /sell-home', () => {
  it('renders with the agent id and one copy of the shared bundle', () => {
    const { container } = render(<SellHomePage />);

    const widget = container.querySelector('realscout-home-value');

    expect(widget).not.toBeNull();
    expect(widget?.getAttribute('agent-encoded-id')).toBe(
      siteConfig.realscout.agentEncodedId
    );
    expect(
      document.querySelectorAll(
        `script[src="${siteConfig.realscout.scriptSrc}"]`
      )
    ).toHaveLength(1);
  });

  it('sits after the valuation section and before compensation', () => {
    const { container } = render(<SellHomePage />);

    const order = Array.from(
      container.querySelectorAll('h2, realscout-home-value')
    ).map((el) =>
      el.tagName.toLowerCase() === 'h2'
        ? (el.textContent ?? '').trim()
        : 'WIDGET'
    );

    const widgetAt = order.indexOf('WIDGET');
    const compensationAt = order.findIndex((entry) =>
      /compensation/i.test(entry)
    );

    expect(widgetAt).toBeGreaterThan(0);
    expect(compensationAt).toBeGreaterThan(widgetAt);
  });

  it('does not present the widget estimate as Joey reviewing the home', () => {
    const { container } = render(<SellHomePage />);
    const text = container.textContent ?? '';

    // His approved position, still on the page.
    expect(text).toContain(
      'Joey reviews your home personally instead of giving a generic online estimate'
    );
    // And no figure, timeline or promise anywhere, which is what the seller
    // page has always been held to.
    expect(text).not.toContain('$');
    expect(text).not.toMatch(/guarantee/i);
    expect(text).not.toMatch(/\d+\s*(%|percent|days?|months?)/i);
  });
});
