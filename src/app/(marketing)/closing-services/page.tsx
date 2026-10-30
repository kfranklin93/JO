import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { StartTheConversationCTA } from '@/components/sections/StartTheConversationCTA';
import { getBreadcrumbSchema } from '@/config/structured-data';

/**
 * Closing page. **Read this before adding a paragraph.**
 *
 * This page is about Joey's *management* of a deal from contract to closing. It
 * is not about providing title or escrow services, because he does not provide
 * them — he is a Realtor with closing partners he can refer you to.
 *
 * The whole of the approved source is one entry, `closing-services` in
 * src/lib/assistant/answer-playbook-content.ts: he personally manages every
 * deal from contract to closing, he has trusted closing partners when you need
 * a resource, and he attends every one of his closings in person. That is three
 * facts, so this is a three-point page. It does not describe closing costs, a
 * timeline, a document checklist or a list of partners, because Joey has not
 * approved any of that and inventing it would describe services a licensed
 * professional does not offer.
 */
export const metadata: Metadata = {
  title: 'From Contract to Closing | Joey Oberndorfer',
  description:
    'Joey Oberndorfer personally manages every deal from contract to closing, refers trusted closing partners when you need one, and attends every closing in person.',
};

export default function ClosingServicesPage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Closing Services', url: '/closing-services' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbs} />

      <section className="bg-hunter py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-bone sm:text-6xl">
            From Contract to Closing
          </h1>
          <p className="mt-8 font-sans text-xl font-light leading-relaxed text-bone">
            You will never be left wondering what is next.
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            How Joey Runs a Closing
          </h2>
          <div className="mt-12 space-y-12">
            <div>
              <h3 className="font-sans text-xl font-medium text-onyx">
                He manages the deal himself
              </h3>
              <p className="mt-4 font-sans text-lg font-light leading-relaxed text-stone">
                Joey personally manages every deal from contract to closing.
              </p>
            </div>
            <div>
              <h3 className="font-sans text-xl font-medium text-onyx">
                He has closing partners when you need one
              </h3>
              <p className="mt-4 font-sans text-lg font-light leading-relaxed text-stone">
                When you need a resource, Joey has trusted closing partners he
                can point you to.
              </p>
            </div>
            <div>
              <h3 className="font-sans text-xl font-medium text-onyx">
                He is at the table
              </h3>
              <p className="mt-4 font-sans text-lg font-light leading-relaxed text-stone">
                Joey attends every one of his closings in person.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-onyx py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-bone lg:text-5xl">
            One Thing to Be Clear About
          </h2>
          <p className="mt-10 font-sans text-lg font-light leading-relaxed text-bone lg:text-xl">
            Joey is a Realtor, not a title or escrow company. What he offers is
            his own management of the process and an introduction to closing
            partners he trusts &mdash; not title or escrow services themselves.
          </p>
        </div>
      </section>

      <StartTheConversationCTA
        heading="Ask About Your Closing"
        body="Under contract already, or trying to understand what happens after an offer is accepted? Joey's assistant can answer from Joey's own answers and book you a 15-minute consultation with him."
        chatLabel="Ask About Closing"
      />
    </>
  );
}
