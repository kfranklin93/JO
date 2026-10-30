import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { StartTheConversationCTA } from '@/components/sections/StartTheConversationCTA';
import { getBreadcrumbSchema, realEstateAgentSchema } from '@/config/structured-data';
import { siteConfig } from '@/config/site';

/**
 * Contact page.
 *
 * Two approved playbook entries behind the prose — `book-a-call` ("Joey would
 * love to connect with you", then offer the consultation as a call, a text or
 * an email, their choice) and `who-is-joey` for the credentials paragraph — and
 * `siteConfig.contact` for every actual detail. Nothing is typed in by hand
 * here: the phone, email and office address are read from config, because they
 * also feed the JSON-LD and Joey's Google Business Profile, and a detail that
 * disagrees across sources costs him local ranking.
 */
export const metadata: Metadata = {
  title: 'Contact Joey Oberndorfer | Metro Atlanta Realtor',
  description:
    'Reach Joey Oberndorfer, licensed Georgia Realtor with eXp Realty, eXp ICON Agent and Zillow Rising Star Award winner. Call, text or email — your choice.',
};

export default function ContactPage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Contact', url: '/contact' },
  ]);

  return (
    <>
      <StructuredData data={realEstateAgentSchema} />
      <StructuredData data={breadcrumbs} />

      <section className="bg-hunter py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-bone sm:text-6xl">
            Contact Joey Oberndorfer
          </h1>
          <p className="mt-8 font-sans text-xl font-light leading-relaxed text-bone">
            Joey would love to connect with you. A call, a text, or an email
            &mdash; your choice.
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            How to Reach Him
          </h2>
          <dl className="mt-10 grid gap-10 sm:grid-cols-2">
            <div>
              <dt className="font-sans text-sm font-medium uppercase tracking-[0.2em] text-stone">
                Call or Text
              </dt>
              <dd className="mt-3">
                <a
                  href={`tel:${siteConfig.contact.phone}`}
                  className="font-serif text-2xl text-onyx underline underline-offset-4 transition-colors hover:text-hunter"
                >
                  {siteConfig.contact.phoneDisplay}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-sans text-sm font-medium uppercase tracking-[0.2em] text-stone">
                Email
              </dt>
              <dd className="mt-3">
                <a
                  href={`mailto:${siteConfig.contact.email}`}
                  className="font-sans text-lg text-onyx underline underline-offset-4 transition-colors hover:text-hunter"
                >
                  {siteConfig.contact.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-sans text-sm font-medium uppercase tracking-[0.2em] text-stone">
                Office
              </dt>
              <dd className="mt-3 font-sans text-lg font-light text-stone">
                {siteConfig.contact.office}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-sm font-medium uppercase tracking-[0.2em] text-stone">
                Brokerage
              </dt>
              <dd className="mt-3 font-sans text-lg font-light text-stone">
                {siteConfig.contact.brokerage}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="bg-onyx py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-bone lg:text-5xl">
            Who You Are Talking To
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              Joey Oberndorfer is a licensed Georgia Realtor with eXp Realty and
              an eXp ICON Agent, serving clients across all of Georgia with a
              global network of agents and properties.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
              He is also an active real estate investor in rentals and flips, so
              he treats real estate as a wealth-building strategy: every move
              should build your financial future, not just close a deal.
              First-time buyer, seller, investor, or relocating across the
              world, Joey has a plan for you.
            </p>
            <p className="font-serif text-xl font-light leading-relaxed text-champagne lg:text-2xl">
              Preparation Creates Confidence. Execution Creates Wins.
            </p>
          </div>
        </div>
      </section>

      <StartTheConversationCTA
        heading="Get in Touch"
        body="Joey's assistant can answer your question now and book you a 15-minute consultation with him. Prefer a form? Send your details instead and tell him what you need."
        chatLabel="Start a Conversation"
      />
    </>
  );
}
