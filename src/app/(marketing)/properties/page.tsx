import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Featured Properties | Joey Oberndorfer Real Estate',
  description: 'Browse our exclusive collection of luxury properties in Metro Atlanta. Find your dream home with Joey Oberndorfer.',
};

const properties = [
  {
    id: 1,
    title: 'Modern Estate in Buckhead',
    location: 'Buckhead, Atlanta',
    price: '$2,450,000',
    beds: 5,
    baths: 4.5,
    sqft: '4,800',
    image: '/images/properties/flagship.jpg',
    status: 'Available',
  },
  {
    id: 2,
    title: 'Historic Charm in Marietta',
    location: 'Marietta Square',
    price: '$875,000',
    beds: 4,
    baths: 3,
    sqft: '3,200',
    image: '/images/properties/legacy.jpg',
    status: 'Available',
  },
  {
    id: 3,
    title: 'Contemporary Luxury in Sandy Springs',
    location: 'Sandy Springs',
    price: '$1,650,000',
    beds: 4,
    baths: 3.5,
    sqft: '3,900',
    image: '/images/properties/now-selling.jpg',
    status: 'Under Contract',
  },
  {
    id: 4,
    title: 'Elegant Townhome in Roswell',
    location: 'Historic Roswell',
    price: '$625,000',
    beds: 3,
    baths: 2.5,
    sqft: '2,400',
    image: '/images/properties/future-visions.jpg',
    status: 'Available',
  },
];

export default function PropertiesPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F6]">
      {/* Hero Section */}
      <section className="relative bg-[#1C2A39] py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="font-serif text-5xl font-light tracking-tight text-[#FAF9F6] sm:text-6xl lg:text-7xl">
              Featured Properties
            </h1>
            <p className="mt-6 font-sans text-lg font-light leading-relaxed text-[#FAF9F6]/80">
              Discover exceptional homes curated for discerning buyers in Metro Atlanta's most sought-after neighborhoods.
            </p>
          </div>
        </div>
      </section>

      {/* Properties Grid */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <div className="grid gap-12 md:grid-cols-2">
            {properties.map((property) => (
              <article
                key={property.id}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-500 hover:shadow-2xl"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={property.image}
                    alt={property.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Status Badge */}
                  <div className="absolute right-4 top-4">
                    <span
                      className={`rounded-full px-4 py-2 font-sans text-xs font-medium uppercase tracking-wider ${
                        property.status === 'Available'
                          ? 'bg-[#C5A059] text-white'
                          : 'bg-[#1C2A39] text-white'
                      }`}
                    >
                      {property.status}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-8">
                  <div className="mb-4">
                    <h2 className="font-serif text-2xl font-light text-[#1C2A39]">
                      {property.title}
                    </h2>
                    <p className="mt-2 font-sans text-sm font-light text-[#1C2A39]/60">
                      {property.location}
                    </p>
                  </div>

                  <div className="mb-6">
                    <p className="font-serif text-3xl font-light text-[#C5A059]">
                      {property.price}
                    </p>
                  </div>

                  {/* Property Details */}
                  <div className="mb-6 flex items-center gap-6 border-t border-[#1C2A39]/10 pt-6">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-lg font-light text-[#1C2A39]">
                        {property.beds}
                      </span>
                      <span className="font-sans text-sm font-light text-[#1C2A39]/60">
                        Beds
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-lg font-light text-[#1C2A39]">
                        {property.baths}
                      </span>
                      <span className="font-sans text-sm font-light text-[#1C2A39]/60">
                        Baths
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-lg font-light text-[#1C2A39]">
                        {property.sqft}
                      </span>
                      <span className="font-sans text-sm font-light text-[#1C2A39]/60">
                        Sq Ft
                      </span>
                    </div>
                  </div>

                  {/* CTA */}
                  <Link
                    href="/get-started"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1C2A39]/20 bg-transparent px-6 py-4 font-sans text-base font-normal text-[#1C2A39] transition-all duration-300 hover:border-[#C5A059] hover:bg-[#C5A059] hover:text-[#FAF9F6]"
                  >
                    Schedule Viewing
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
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
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-[#1C2A39] py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-serif text-4xl font-light text-[#FAF9F6] sm:text-5xl">
              Don't See What You're Looking For?
            </h2>
            <p className="mt-6 font-sans text-lg font-light leading-relaxed text-[#FAF9F6]/80">
              Let me help you find the perfect property. With exclusive access to off-market listings and deep local expertise, I'll match you with your ideal home.
            </p>
            <div className="mt-10">
              <Link
                href="/get-started"
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#C5A059] px-10 py-5 font-sans text-lg font-normal text-[#FAF9F6] transition-all duration-300 hover:bg-[#C5A059]/90 hover:shadow-2xl hover:shadow-[#C5A059]/20"
              >
                Start Your Search
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
        </div>
      </section>
    </main>
  );
}

// Made with Bob
