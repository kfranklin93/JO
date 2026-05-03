import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Joey Oberndorfer Real Estate',
  description: 'Review the terms and conditions for using our website and services.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F6]">
      {/* Hero Section */}
      <section className="relative bg-[#1C2A39] py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-serif text-5xl font-light tracking-tight text-[#FAF9F6] sm:text-6xl">
              Terms of Service
            </h1>
            <p className="mt-6 font-sans text-lg font-light leading-relaxed text-[#FAF9F6]/80">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="prose prose-lg max-w-none">
              {/* Introduction */}
              <div className="mb-12">
                <p className="font-sans text-lg font-light leading-relaxed text-[#1C2A39]/80">
                  Welcome to Joey Oberndorfer Real Estate. By accessing or using our website and services, you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.
                </p>
              </div>

              {/* Acceptance of Terms */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Acceptance of Terms
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  By using our website, submitting forms, or engaging our services, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, please do not use our services.
                </p>
              </div>

              {/* Services Description */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Services Description
                </h2>
                <p className="mb-4 font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  Joey Oberndorfer Real Estate provides:
                </p>
                <ul className="space-y-2 font-sans font-light text-[#1C2A39]/80">
                  <li>• Residential real estate buying and selling services</li>
                  <li>• Property search and matching assistance</li>
                  <li>• Market analysis and consultation</li>
                  <li>• Home insurance referrals</li>
                  <li>• Closing services coordination</li>
                  <li>• Real estate market information and resources</li>
                </ul>
              </div>

              {/* User Responsibilities */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  User Responsibilities
                </h2>
                <p className="mb-4 font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  When using our services, you agree to:
                </p>
                <ul className="space-y-2 font-sans font-light text-[#1C2A39]/80">
                  <li>• Provide accurate and complete information</li>
                  <li>• Maintain the confidentiality of any account credentials</li>
                  <li>• Use our services only for lawful purposes</li>
                  <li>• Not interfere with or disrupt our website or services</li>
                  <li>• Not attempt to gain unauthorized access to our systems</li>
                  <li>• Respect intellectual property rights</li>
                </ul>
              </div>

              {/* Property Information */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Property Information and Listings
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  Property information, listings, and pricing displayed on our website are subject to change without notice. While we strive for accuracy, we do not guarantee that all information is current, complete, or error-free. Property availability, pricing, and details should be verified directly with us before making any decisions.
                </p>
              </div>

              {/* No Guarantee */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  No Guarantee of Results
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  While we work diligently to provide excellent service, we cannot guarantee specific outcomes, including the sale or purchase of any property, specific sale prices, or timeframes. Real estate transactions involve many factors beyond our control.
                </p>
              </div>

              {/* Intellectual Property */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Intellectual Property Rights
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  All content on this website, including text, graphics, logos, images, and software, is the property of Joey Oberndorfer Real Estate or its content suppliers and is protected by copyright and other intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.
                </p>
              </div>

              {/* Third-Party Links */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Third-Party Links and Services
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  Our website may contain links to third-party websites or services. We are not responsible for the content, accuracy, or practices of these external sites. Your use of third-party websites is at your own risk and subject to their terms and conditions.
                </p>
              </div>

              {/* Limitation of Liability */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Limitation of Liability
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  To the fullest extent permitted by law, Joey Oberndorfer Real Estate shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
                </p>
                <ul className="mt-4 space-y-2 font-sans font-light text-[#1C2A39]/80">
                  <li>• Your use or inability to use our services</li>
                  <li>• Any unauthorized access to or use of our servers</li>
                  <li>• Any interruption or cessation of transmission to or from our services</li>
                  <li>• Any bugs, viruses, or other harmful code transmitted through our services</li>
                  <li>• Any errors or omissions in any content</li>
                </ul>
              </div>

              {/* Indemnification */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Indemnification
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  You agree to indemnify, defend, and hold harmless Joey Oberndorfer Real Estate and its affiliates, officers, agents, and employees from any claims, liabilities, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or in any way connected with your access to or use of our services or your violation of these Terms.
                </p>
              </div>

              {/* Dispute Resolution */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Dispute Resolution
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  Any disputes arising from these Terms or your use of our services shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in Georgia, and judgment on the award may be entered in any court having jurisdiction.
                </p>
              </div>

              {/* Governing Law */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Governing Law
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  These Terms shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of law provisions.
                </p>
              </div>

              {/* Changes to Terms */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Changes to Terms
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the new Terms on this page and updating the "Last updated" date. Your continued use of our services after such changes constitutes your acceptance of the new Terms.
                </p>
              </div>

              {/* Severability */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Severability
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that these Terms shall otherwise remain in full force and effect.
                </p>
              </div>

              {/* Entire Agreement */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[#1C2A39]">
                  Entire Agreement
                </h2>
                <p className="font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  These Terms, together with our Privacy Policy, constitute the entire agreement between you and Joey Oberndorfer Real Estate regarding your use of our services and supersede all prior agreements and understandings.
                </p>
              </div>

              {/* Contact */}
              <div className="rounded-2xl border border-[#1C2A39]/10 bg-white p-8">
                <h2 className="mb-4 font-serif text-3xl font-light text-[#1C2A39]">
                  Questions About These Terms?
                </h2>
                <p className="mb-6 font-sans font-light leading-relaxed text-[#1C2A39]/80">
                  If you have any questions about these Terms of Service, please contact us:
                </p>
                <div className="space-y-2 font-sans font-light text-[#1C2A39]/80">
                  <p>
                    <strong className="font-medium text-[#1C2A39]">Joey Oberndorfer</strong>
                  </p>
                  <p>Email: joey@joeyoberndorfer.com</p>
                  <p>Phone: (770) 123-4567</p>
                </div>
                <div className="mt-8">
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 font-sans text-base font-normal text-[#C5A059] transition-colors hover:text-[#C5A059]/80"
                  >
                    Contact Us
                    <svg
                      className="h-4 w-4"
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
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// Made with Bob
