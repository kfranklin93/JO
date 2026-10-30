import type { Metadata } from 'next';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import { StartTheConversationCTA } from '@/components/sections/StartTheConversationCTA';
import { getBreadcrumbSchema } from '@/config/structured-data';

/**
 * Buyer page.
 *
 * Every claim here comes from three entries Joey approved in
 * src/lib/assistant/answer-playbook-content.ts — `first-time-buyer`,
 * `pre-approval-first` and `service-area` — adapted out of their chat voice
 * into page prose. Nothing else is asserted: no timelines, no counts, no
 * promises about what a buyer will get, because the playbook supplies none and
 * this is a licensed agent's public description of his own service.
 *
 * The page is short for that reason. If it should say more, the next sentence
 * has to come from Joey, not from here.
 */
export const metadata: Metadata = {
  title: 'Buy a Home in Georgia | Joey Oberndorfer',
  description:
    'Buying in Metro Atlanta or anywhere in Georgia? Joey Oberndorfer, eXp ICON Agent, builds your plan personally — goals, budget, pre-approval, and next steps.',
};

export default function BuyHomePage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Buy a Home', url: '/buy-home' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbs} />

      {/* Masthead. Hunter is the brand's dark surface and it carries bone
          text at 13.1:1. */}
      <section className="bg-hunter py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-bone sm:text-6xl">
            Buy a Home in Georgia
          </h1>
          <p className="mt-8 font-sans text-xl font-light leading-relaxed text-bone">
            Every buyer&rsquo;s path is different, and the buyers who win start
            with a plan.
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            Start With a Plan
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              If you have never bought a house before, you are in the right
              place. Joey builds the plan with you personally: your goals, your
              budget, and your next steps.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              He treats real estate as a wealth-building strategy, so the plan
              is about more than one address. Every move should build your
              financial future, not just close a deal.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-onyx py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-bone lg:text-5xl">
            Do You Need to Be Pre-Approved First?
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              It depends on your situation. Joey walks every buyer through the
              pre-approval process personally, and connects you with a trusted
              lending partner when you are ready.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              Starting with a plan puts you ahead of most buyers.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            Where Joey Works
          </h2>
          <div className="mt-10 grid gap-12 md:grid-cols-2">
            <div>
              <h3 className="font-sans text-xl font-medium text-onyx">
                Across Georgia
              </h3>
              <p className="mt-4 font-sans font-light leading-relaxed text-stone">
                Joey serves all of Georgia, with deep expertise in Metro
                Atlanta, including Cobb, Fulton, DeKalb and Gwinnett counties.
              </p>
            </div>
            <div>
              <h3 className="font-sans text-xl font-medium text-onyx">
                Moving Further Afield
              </h3>
              <p className="mt-4 font-sans font-light leading-relaxed text-stone">
                Moving out of state, or out of the country? Through eXp
                Realty&rsquo;s global network, Joey connects his clients with
                top agents anywhere in the world, and stays in your corner the
                whole way.
              </p>
            </div>
          </div>
          <p className="mt-12 font-sans text-lg font-light leading-relaxed text-stone">
            Want to see what is on the market first?{' '}
            <Link
              href="/properties"
              className="text-onyx underline underline-offset-4 transition-colors hover:text-hunter"
            >
              Browse featured properties
            </Link>
            .
          </p>
        </div>
      </section>

      <StartTheConversationCTA
        heading="Let's Build Your Plan"
        body="Tell Joey's assistant what you're looking for and where. It can answer your questions and book you a 15-minute consultation with Joey."
        chatLabel="Ask About Buying"
      />
    </>
  );
}
