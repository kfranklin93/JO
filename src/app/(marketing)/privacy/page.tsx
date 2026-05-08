import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Joey Oberndorfer Real Estate',
  description: 'Learn how we protect your personal information and respect your privacy.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[white]">
      {/* Hero Section */}
      <section className="relative bg-[black] py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-serif text-5xl font-light tracking-tight text-[white] sm:text-6xl">
              Privacy Policy
            </h1>
            <p className="mt-6 font-sans text-lg font-light leading-relaxed text-[white]/80">
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
                <p className="font-sans text-lg font-light leading-relaxed text-[black]/80">
                  Joey Oberndorfer Real Estate ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
                </p>
              </div>

              {/* Information We Collect */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Information We Collect
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 font-sans text-xl font-medium text-[black]">
                      Personal Information
                    </h3>
                    <p className="font-sans font-light leading-relaxed text-[black]/80">
                      We may collect personal information that you voluntarily provide to us when you:
                    </p>
                    <ul className="mt-4 space-y-2 font-sans font-light text-[black]/80">
                      <li>• Fill out contact forms or lead capture forms</li>
                      <li>• Schedule property viewings or consultations</li>
                      <li>• Subscribe to our newsletter or marketing communications</li>
                      <li>• Communicate with us via email, phone, or chat</li>
                    </ul>
                    <p className="mt-4 font-sans font-light leading-relaxed text-[black]/80">
                      This information may include: name, email address, phone number, property preferences, budget range, and any other information you choose to provide.
                    </p>
                  </div>

                  <div>
                    <h3 className="mb-3 font-sans text-xl font-medium text-[black]">
                      Automatically Collected Information
                    </h3>
                    <p className="font-sans font-light leading-relaxed text-[black]/80">
                      When you visit our website, we automatically collect certain information about your device and browsing behavior, including:
                    </p>
                    <ul className="mt-4 space-y-2 font-sans font-light text-[black]/80">
                      <li>• IP address and browser type</li>
                      <li>• Pages visited and time spent on pages</li>
                      <li>• Referring website and search terms</li>
                      <li>• Device information and operating system</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* How We Use Your Information */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  How We Use Your Information
                </h2>
                <p className="mb-4 font-sans font-light leading-relaxed text-[black]/80">
                  We use the information we collect to:
                </p>
                <ul className="space-y-2 font-sans font-light text-[black]/80">
                  <li>• Respond to your inquiries and provide requested services</li>
                  <li>• Match you with suitable properties and market opportunities</li>
                  <li>• Send you property listings, market updates, and relevant information</li>
                  <li>• Improve our website and user experience</li>
                  <li>• Analyze website traffic and user behavior</li>
                  <li>• Comply with legal obligations and protect our rights</li>
                </ul>
              </div>

              {/* Information Sharing */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Information Sharing and Disclosure
                </h2>
                <p className="mb-4 font-sans font-light leading-relaxed text-[black]/80">
                  We do not sell your personal information. We may share your information with:
                </p>
                <ul className="space-y-2 font-sans font-light text-[black]/80">
                  <li>• Service providers who assist with our business operations (e.g., CRM systems, email marketing platforms)</li>
                  <li>• Professional partners involved in real estate transactions (e.g., title companies, attorneys, lenders)</li>
                  <li>• Law enforcement or regulatory authorities when required by law</li>
                </ul>
              </div>

              {/* Data Security */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Data Security
                </h2>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure.
                </p>
              </div>

              {/* Your Rights */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Your Rights and Choices
                </h2>
                <p className="mb-4 font-sans font-light leading-relaxed text-[black]/80">
                  You have the right to:
                </p>
                <ul className="space-y-2 font-sans font-light text-[black]/80">
                  <li>• Access, correct, or delete your personal information</li>
                  <li>• Opt-out of marketing communications at any time</li>
                  <li>• Request information about how we use your data</li>
                  <li>• Withdraw consent for data processing where applicable</li>
                </ul>
                <p className="mt-4 font-sans font-light leading-relaxed text-[black]/80">
                  To exercise these rights, please contact us using the information provided below.
                </p>
              </div>

              {/* Cookies */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Cookies and Tracking Technologies
                </h2>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  We use cookies and similar tracking technologies to enhance your browsing experience, analyze website traffic, and personalize content. You can control cookie preferences through your browser settings.
                </p>
              </div>

              {/* Third-Party Links */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Third-Party Links
                </h2>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  Our website may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies.
                </p>
              </div>

              {/* Children's Privacy */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Children's Privacy
                </h2>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children.
                </p>
              </div>

              {/* Changes to Policy */}
              <div className="mb-12">
                <h2 className="mb-6 font-serif text-3xl font-light text-[black]">
                  Changes to This Privacy Policy
                </h2>
                <p className="font-sans font-light leading-relaxed text-[black]/80">
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.
                </p>
              </div>

              {/* Contact */}
              <div className="rounded-2xl border border-[black]/10 bg-white p-8">
                <h2 className="mb-4 font-serif text-3xl font-light text-[black]">
                  Contact Us
                </h2>
                <p className="mb-6 font-sans font-light leading-relaxed text-[black]/80">
                  If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
                </p>
                <div className="space-y-2 font-sans font-light text-[black]/80">
                  <p>
                    <strong className="font-medium text-[black]">Joey Oberndorfer</strong>
                  </p>
                  <p>Email: joey@joeyoberndorfer.com</p>
                  <p>Phone: (770) 123-4567</p>
                </div>
                <div className="mt-8">
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 font-sans text-base font-normal text-[black] transition-colors hover:text-[black]/80"
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
