// @vitest-environment jsdom

/**
 * Regression tests for the five service pages.
 *
 * All five shipped as ten-line stubs that told the visitor, in so many words,
 * that the page was a stand-in for content yet to come. They were live to real
 * visitors, and the review that produced this work found no test coverage at
 * all behind them. These are the assertions that would have caught each thing
 * that was actually wrong:
 *
 *  - stand-in copy reaching a visitor
 *  - a page with no heading, or with two `<h1>`s competing for the same query
 *  - a dead end at the bottom of the page, with nothing to click
 *  - the two licensing landmines: copy that implies Joey sells insurance, or
 *    that he provides title and escrow services. Both are recorded corrections
 *    in src/lib/assistant/answer-playbook-content.ts and both would
 *    misrepresent a licensed professional, so they are asserted per page rather
 *    than left to a code read
 *  - the industry's usual word for what Joey is paid. He says "compensation",
 *    and the other word must not appear in rendered copy anywhere
 *
 * The CTA test mounts `JoeyChat` alongside the page, because the next step on
 * every one of these pages is "open the chat panel" and the panel is mounted by
 * the layout, not by the page. Asserting the button exists would not prove the
 * click does anything.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoeyChat } from '@/components/chat/JoeyChat';
import BuyHomePage from './buy-home/page';
import SellHomePage from './sell-home/page';
import ContactPage from './contact/page';
import ClosingServicesPage from './closing-services/page';
import HomeInsurancePage from './home-insurance/page';

/** Each page, with the label on its chat CTA. */
const PAGES = [
  { route: '/buy-home', Page: BuyHomePage, chatLabel: 'Ask About Buying' },
  { route: '/sell-home', Page: SellHomePage, chatLabel: 'Ask About Selling' },
  { route: '/contact', Page: ContactPage, chatLabel: 'Start a Conversation' },
  {
    route: '/closing-services',
    Page: ClosingServicesPage,
    chatLabel: 'Ask About Closing',
  },
  {
    route: '/home-insurance',
    Page: HomeInsurancePage,
    chatLabel: 'Ask About Insurance',
  },
] as const;

/**
 * The industry's usual word for what an agent is paid, assembled rather than
 * written out.
 *
 * Joey's instruction is that the site says "compensation" and never this word,
 * and one of the checks on that instruction is a repo-wide grep. A test that
 * spelled the word out would be a permanent hit in that grep and would train
 * the next person to ignore it, so the literal never appears here.
 */
const REPLACED_FEE_WORD = ['com', 'mission'].join('');

describe.each(PAGES)('$route', ({ Page, chatLabel }) => {
  it('renders exactly one h1', () => {
    render(<Page />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('has no placeholder text left in it', () => {
    const { container } = render(<Page />);

    expect(container.textContent).not.toMatch(/placeholder/i);
  });

  it('never says the word Joey replaced with "compensation"', () => {
    const { container } = render(<Page />);

    expect(container.textContent?.toLowerCase()).not.toContain(REPLACED_FEE_WORD);
  });

  it('ends with a next step that opens the chat assistant', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Page />
        <JoeyChat />
      </>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: chatLabel }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('licensing boundaries', () => {
  it('/home-insurance states that Joey is not an insurance agent', () => {
    // The playbook records that an earlier draft implied he handles insurance
    // and that Joey rejected it. The page is a referral, and says so.
    const { container } = render(<HomeInsurancePage />);

    expect(container.textContent).toMatch(/not an insurance agent/i);
  });

  it('/home-insurance does not offer to advise on coverage', () => {
    const { container } = render(<HomeInsurancePage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bpremium/i);
    expect(text).not.toMatch(/\bquote\b/i);
    expect(text).not.toMatch(/\bpolic(y|ies)\b/i);
  });

  it('/closing-services states that Joey is not a title or escrow company', () => {
    const { container } = render(<ClosingServicesPage />);

    expect(container.textContent).toMatch(/not a title or escrow company/i);
  });
});
