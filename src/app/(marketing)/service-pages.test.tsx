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
 * Every one of those checks runs against the exported `metadata` as well as the
 * rendered DOM. A description is copy — it is what a searcher reads before
 * clicking, and it is where `/home-insurance` has to repeat that Joey is not an
 * insurance agent — but it never appears in `container.textContent`, so a
 * description that broke the rule used to ship green.
 *
 * The CTA test mounts `JoeyChat` alongside the page, because the next step on
 * every one of these pages is "open the chat panel" and the panel is mounted by
 * the layout, not by the page. Asserting the button exists would not prove the
 * click does anything. The chat CTA is a `/get-started` link that its handler
 * takes over, so the next step still works before hydration — hence the
 * `getByRole('link')` and the separate assertion that the href is there.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoeyChat } from '@/components/chat/JoeyChat';
import BuyHomePage, { metadata as buyHomeMetadata } from './buy-home/page';
import SellHomePage, { metadata as sellHomeMetadata } from './sell-home/page';
import ContactPage, { metadata as contactMetadata } from './contact/page';
import ClosingServicesPage, {
  metadata as closingServicesMetadata,
} from './closing-services/page';
import HomeInsurancePage, {
  metadata as homeInsuranceMetadata,
} from './home-insurance/page';

/**
 * Each page, with the label on its chat CTA and its exported metadata.
 *
 * The metadata is carried here because it is copy too — it is the text a
 * searcher reads before deciding whether to click, and on `/home-insurance` it
 * is where the licensing disclaimer has to survive. Assertions that only read
 * the rendered DOM cannot see it.
 */
const PAGES = [
  {
    route: '/buy-home',
    Page: BuyHomePage,
    metadata: buyHomeMetadata,
    chatLabel: 'Ask About Buying',
  },
  {
    route: '/sell-home',
    Page: SellHomePage,
    metadata: sellHomeMetadata,
    chatLabel: 'Ask About Selling',
  },
  {
    route: '/contact',
    Page: ContactPage,
    metadata: contactMetadata,
    chatLabel: 'Start a Conversation',
  },
  {
    route: '/closing-services',
    Page: ClosingServicesPage,
    metadata: closingServicesMetadata,
    chatLabel: 'Ask About Closing',
  },
  {
    route: '/home-insurance',
    Page: HomeInsurancePage,
    metadata: homeInsuranceMetadata,
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

describe.each(PAGES)('$route', ({ Page, metadata, chatLabel }) => {
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

  it('carries a title and description, with no stand-in copy in either', () => {
    // The stubs had no metadata at all, which is how a page ends up in search
    // results titled after its route.
    const metaText = `${String(metadata.title)} ${metadata.description}`;

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
    expect(metaText).not.toMatch(/placeholder/i);
  });

  it('never says the replaced fee word in its metadata either', () => {
    const metaText = `${String(metadata.title)} ${metadata.description}`.toLowerCase();

    expect(metaText).not.toContain(REPLACED_FEE_WORD);
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

    await user.click(screen.getByRole('link', { name: chatLabel }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers the lead form as a next step that needs no JavaScript', () => {
    // The chat CTA is an enhanced link and the form link beside it is a plain
    // one. Between them, every visitor has somewhere to go — but only if both
    // keep pointing at /get-started, which nothing else asserts.
    const { container } = render(<Page />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href')
    );

    expect(hrefs).toContain('/get-started');
  });
});

describe('licensing boundaries', () => {
  it('/home-insurance states that Joey is not an insurance agent', () => {
    // The playbook records that an earlier draft implied he handles insurance
    // and that Joey rejected it. The page is a referral, and says so.
    const { container } = render(<HomeInsurancePage />);

    expect(container.textContent).toMatch(/not an insurance agent/i);
  });

  it('/home-insurance says so in its description as well as on the page', () => {
    // A searcher reads the description before anything on the page, so the
    // disclaimer has to hold there too. The rendered-DOM assertion above
    // cannot see it.
    expect(homeInsuranceMetadata.description).toMatch(/not an insurance agent/i);
  });

  it('/home-insurance does not offer to advise on coverage', () => {
    const { container } = render(<HomeInsurancePage />);
    const text = `${container.textContent ?? ''} ${String(
      homeInsuranceMetadata.title
    )} ${homeInsuranceMetadata.description}`;

    expect(text).not.toMatch(/\bpremium/i);
    expect(text).not.toMatch(/\bquote\b/i);
    expect(text).not.toMatch(/\bpolic(y|ies)\b/i);
  });

  it('/closing-services states that Joey is not a title or escrow company', () => {
    const { container } = render(<ClosingServicesPage />);

    expect(container.textContent).toMatch(/not a title or escrow company/i);
  });

  it('/closing-services does not claim title or escrow services in its description', () => {
    const metaText = `${String(closingServicesMetadata.title)} ${
      closingServicesMetadata.description
    }`;

    // He manages the process and refers partners. The description must not
    // read as an offer of the services themselves.
    expect(metaText).toMatch(/manages every deal/i);
    expect(metaText).not.toMatch(/\b(title|escrow) (services|company)\b/i);
  });
});
