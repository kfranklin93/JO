import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { StartTheConversationCTA } from '@/components/sections/StartTheConversationCTA';
import { getBreadcrumbSchema } from '@/config/structured-data';

/**
 * Seller page.
 *
 * Copy derives from the `home-valuation` and `compensation` entries Joey
 * approved in src/lib/assistant/answer-playbook-content.ts. Note what is
 * deliberately absent: no price range, no days-on-market figure and no number
 * attached to what Joey charges. The valuation answer exists precisely because
 * he will not put a figure on a home he has not seen, and the compensation
 * answer says he discusses it personally with every client — quoting a rate
 * here would contradict both.
 *
 * The word for what Joey is paid is "compensation", always. That is his
 * instruction, recorded at the top of the playbook file, and the industry's
 * usual word for it does not appear anywhere on this site — not in copy and not
 * in a comment, so that a grep for it stays clean.
 */
export const metadata: Metadata = {
  title: 'Sell Your Home in Metro Atlanta | Joey Oberndorfer',
  description:
    'Thinking of selling in Metro Atlanta? Joey Oberndorfer, eXp ICON Agent and Zillow Rising Star Award winner, reviews your home personally instead of giving a generic online estimate.',
};

export default function SellHomePage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Sell Your Home', url: '/sell-home' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbs} />

      <section className="bg-hunter py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-bone sm:text-6xl">
            Sell Your Home in Metro Atlanta
          </h1>
          <p className="mt-8 font-sans text-xl font-light leading-relaxed text-bone">
            Every home is different. Yours gets looked at by Joey, not by an
            algorithm.
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            What Your Home Is Worth, and How Long It Takes
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              Price and timing depend on your home&rsquo;s condition, the market
              right now, and recent sales near you. Joey reviews your home
              personally instead of giving a generic online estimate.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              He will go over all of it with you in a seller consultation,
              including strategies to buy your next home before you sell, so you
              do not miss out on one you love.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-onyx py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-bone lg:text-5xl">
            How Compensation Works
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              Compensation depends on whether you are buying or selling and what
              you need, so Joey discusses it personally with every client.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              In the end it is not the compensation that matters, it is the
              results, and Joey will show you exactly how he gets them.
            </p>
          </div>
        </div>
      </section>

      <StartTheConversationCTA
        heading="Start With Your Address"
        body="Give Joey's assistant your property address and what you're hoping to do. It can take your details and book you a 15-minute consultation with Joey."
        chatLabel="Ask About Selling"
      />
    </>
  );
}
