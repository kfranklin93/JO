import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import { realEstateAgentSchema, getBreadcrumbSchema } from '@/config/structured-data';

export const metadata: Metadata = {
  title: 'About Joey Oberndorfer | Metro Atlanta Real Estate',
  description: 'Guided by intuition. Defined by results. Discover the philosophy behind Joey Oberndorfer\'s approach to luxury real estate in Metro Atlanta.',
};

export default function AboutPage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'About', url: '/about' },
  ]);

  return (
    <>
      <StructuredData data={realEstateAgentSchema} />
      <StructuredData data={breadcrumbs} />
      <main className="min-h-screen bg-white">
      {/* Hero Section - The Statement */}
      <section className="relative overflow-hidden bg-black py-32 lg:py-40">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-5xl">
            <h1 className="font-serif text-5xl font-light leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
              Guided by Intuition.
              <br />
              Defined by Results.
            </h1>
            <p className="mt-8 font-sans text-xl leading-relaxed text-neutral-300 lg:text-2xl">
              Where strategic vision meets local heritage.
            </p>
          </div>
        </div>
      </section>

      {/* The Narrative */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="space-y-8">
              <p className="font-sans text-xl leading-relaxed text-neutral-700 lg:text-2xl">
                Real estate isn't about square footage or closing dates. It's about understanding the invisible architecture of a life well-lived—the morning commute that doesn't drain you, the neighborhood coffee shop that becomes your third place, the school district that shapes futures.
              </p>
              <p className="font-sans text-xl leading-relaxed text-neutral-700 lg:text-2xl">
                In Metro Atlanta's evolving landscape, I've built a practice on a simple premise: the best transactions are frictionless. My clients don't navigate complexity—they experience clarity. From Buckhead's established elegance to Marietta's historic charm, I curate opportunities that align with how you actually want to live.
              </p>
              <p className="font-sans text-xl leading-relaxed text-neutral-700 lg:text-2xl">
                This is bespoke service without the theater. Strategic counsel without the jargon. A partnership built on insight, discretion, and an unwavering commitment to your vision.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* By the Numbers */}
      <section className="border-y border-[black]/10 bg-white py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 md:grid-cols-3 lg:gap-16">
              <div className="text-center">
                <div className="font-serif text-6xl font-light text-[black] lg:text-7xl">
                  12+
                </div>
                <div className="mt-4 font-sans text-base font-light uppercase tracking-[0.2em] text-[black]/60">
                  Years in Atlanta
                </div>
              </div>
              <div className="text-center">
                <div className="font-serif text-6xl font-light text-[black] lg:text-7xl">
                  $50M+
                </div>
                <div className="mt-4 font-sans text-base font-light uppercase tracking-[0.2em] text-[black]/60">
                  In Transactions
                </div>
              </div>
              <div className="text-center">
                <div className="font-serif text-6xl font-light text-[black] lg:text-7xl">
                  98%
                </div>
                <div className="mt-4 font-sans text-base font-light uppercase tracking-[0.2em] text-[black]/60">
                  Client Satisfaction
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Philosophy */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 font-serif text-4xl font-light text-[black] lg:text-5xl">
              The Philosophy
            </h2>
            <div className="space-y-8">
              <p className="font-sans text-xl font-light leading-relaxed text-[black]/80 lg:text-2xl">
                In an era of algorithm-driven portals and automated valuations, what gets lost is context. The micro-market dynamics. The unspoken neighborhood codes. The timing that separates a good decision from a transformative one.
              </p>
              <p className="font-sans text-xl font-light leading-relaxed text-[black]/80 lg:text-2xl">
                I provide what technology cannot: strategic foresight shaped by years of local intelligence. Access to off-market opportunities before they're opportunities. The ability to read between the lines of a listing and see what others miss.
              </p>
              <p className="font-sans text-xl font-light leading-relaxed text-[black]/80 lg:text-2xl">
                This is real estate as it should be—a partnership where your goals become the blueprint, and my expertise becomes the execution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Personal Touch - "Off the Clock" */}
      <section className="bg-[black] py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 font-serif text-4xl font-light text-[white] lg:text-5xl">
              Off the Clock
            </h2>
            <div className="space-y-8">
              <p className="font-sans text-xl font-light leading-relaxed text-[white]/80 lg:text-2xl">
                When I'm not orchestrating seamless transactions, you'll find me exploring Atlanta's evolving culinary scene—from the hidden omakase counter in Buckhead to the third-wave coffee roasters redefining Marietta Square.
              </p>
              <p className="font-sans text-xl font-light leading-relaxed text-[white]/80 lg:text-2xl">
                I'm drawn to spaces that tell stories: mid-century modern architecture, the quiet trails of Kennesaw Mountain at dawn, the way light filters through historic homes on lazy Sunday afternoons.
              </p>
              <p className="font-sans text-xl font-light leading-relaxed text-[white]/80 lg:text-2xl">
                These aren't just personal interests—they're the lens through which I understand what makes a house a home, a neighborhood a community, and a transaction a life chapter worth celebrating.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Local Authority - The Insider's Edge */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 font-serif text-4xl font-light text-[black] lg:text-5xl">
              The Insider's Edge
            </h2>
            <div className="space-y-8">
              <p className="font-sans text-xl font-light leading-relaxed text-[black]/80 lg:text-2xl">
                Metro Atlanta isn't one market—it's a constellation of micro-markets, each with its own rhythm and opportunity. While others see neighborhoods, I see the invisible patterns: the school district that's quietly becoming elite, the commercial corridor that signals residential appreciation, the historic pocket that's three years from its renaissance.
              </p>
              <p className="font-sans text-xl font-light leading-relaxed text-[black]/80 lg:text-2xl">
                This is the advantage of deep local roots. Not just knowing where to buy, but understanding why—and more importantly, when.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Image Section - Visual Break */}
      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/hero/joey-profile.jpg"
          alt="Joey Oberndorfer"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[black]/60 to-transparent" />
      </section>

      {/* The Approach */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 font-serif text-4xl font-light text-[black] lg:text-5xl">
              The Approach
            </h2>
            <div className="grid gap-12 md:grid-cols-2">
              <div>
                <h3 className="mb-4 font-sans text-xl font-medium text-[black]">
                  For Buyers
                </h3>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  Strategic property identification. Off-market access. Negotiation that protects your interests without sacrificing relationships. A process designed for clarity, not chaos.
                </p>
              </div>
              <div>
                <h3 className="mb-4 font-sans text-xl font-medium text-[black]">
                  For Sellers
                </h3>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  Precision pricing backed by data. Marketing that attracts qualified buyers, not tire-kickers. A sale strategy that maximizes value while minimizing time on market.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-[black]/10 bg-white py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-6 font-serif text-4xl font-light text-[black] lg:text-5xl">
              Let's Begin
            </h2>
            <p className="mb-10 font-sans text-xl font-light leading-relaxed text-[black]/80">
              Whether you're buying, selling, or simply exploring what's possible, the conversation starts here.
            </p>
            <Link
              href="/get-started"
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[black] px-10 py-5 font-sans text-lg font-normal text-[white] transition-all duration-300 hover:bg-[black]/90 hover:shadow-2xl hover:shadow-[black]/20"
            >
              Schedule a Consultation
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>
      </main>
    </>
  );
}

