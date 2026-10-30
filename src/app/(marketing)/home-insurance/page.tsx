import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { StartTheConversationCTA } from '@/components/sections/StartTheConversationCTA';
import { getBreadcrumbSchema } from '@/config/structured-data';

/**
 * Insurance page. **Referral only. Read this before editing a word.**
 *
 * Joey is not an insurance agent. The playbook entry `insurance-help` in
 * src/lib/assistant/answer-playbook-content.ts carries an explicit correction
 * recording that an earlier draft implied he handles insurance and that Joey
 * rejected it. His approved answer is the whole of what this page may say: he
 * isn't an insurance agent, he has trusted insurance professionals he connects
 * his clients with so there are no surprises before closing, and he's happy to
 * share them and learn more about your plans.
 *
 * So this page introduces people to someone licensed to advise them. It must
 * never name a carrier, quote a premium, describe a policy type, compare
 * coverage, or recommend an amount — all of that is insurance advice, and
 * publishing it under Joey's name would misrepresent what he is licensed to do.
 * There is no quote form here for the same reason.
 */
export const metadata: Metadata = {
  title: 'Home Insurance Referrals | Joey Oberndorfer',
  description:
    'Joey Oberndorfer is not an insurance agent. He connects his Metro Atlanta clients with trusted insurance professionals so there are no surprises before closing.',
};

export default function HomeInsurancePage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Home Insurance', url: '/home-insurance' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbs} />

      <section className="bg-hunter py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-bone sm:text-6xl">
            Home Insurance Referrals
          </h1>
          <p className="mt-8 font-sans text-xl font-light leading-relaxed text-bone">
            So there are no surprises before closing.
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-8 lg:px-12">
          <h2 className="font-serif text-4xl font-light text-onyx lg:text-5xl">
            An Introduction, Not Advice
          </h2>
          <div className="mt-10 space-y-6">
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              Joey is not an insurance agent. He has trusted insurance
              professionals he connects his clients with, so there are no
              surprises before closing.
            </p>
            <p className="font-sans text-lg font-light leading-relaxed text-stone lg:text-xl">
              He is happy to share them, and to learn more about your plans. The
              coverage conversation itself belongs with a licensed insurance
              professional, which is exactly who the introduction is to.
            </p>
          </div>
        </div>
      </section>

      <StartTheConversationCTA
        heading="Ask for an Introduction"
        body="Tell Joey's assistant where you are in the process and it will arrange the introduction, along with time with Joey if you need it."
        chatLabel="Ask About Insurance"
      />
    </>
  );
}
