/**
 * JSON-LD Structured Data Configuration
 * 
 * Provides schema.org markup for local SEO and rich search results.
 * Helps Google understand Joey's real estate business for:
 * - Local search results
 * - Knowledge panels
 * - Rich snippets
 * - Google Maps integration
 */

import { siteConfig } from './site';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://joeyoberndorfer.com';

/**
 * RealEstateAgent Schema
 * Primary schema for Joey as a real estate professional
 */
export const realEstateAgentSchema = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': `${baseUrl}/#realestateagent`,
  name: siteConfig.fullName,
  alternateName: siteConfig.name,
  description: siteConfig.description,
  url: baseUrl,
  image: `${baseUrl}/images/hero/joey-profile.jpg`,
  logo: `${baseUrl}/images/brand/logo.png`,
  
  // Contact Information
  telephone: siteConfig.contact.phone,
  email: siteConfig.contact.email,
  
  // Service Area
  areaServed: [
    {
      '@type': 'City',
      name: 'Atlanta',
      '@id': 'https://www.wikidata.org/wiki/Q23556',
    },
    {
      '@type': 'City',
      name: 'Marietta',
      '@id': 'https://www.wikidata.org/wiki/Q203184',
    },
    {
      '@type': 'City',
      name: 'Buckhead',
    },
    {
      '@type': 'City',
      name: 'Sandy Springs',
    },
    {
      '@type': 'City',
      name: 'Roswell',
    },
  ],
  
  // Services Offered
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Real Estate Services',
    itemListElement: [
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Residential Real Estate Sales',
          description: 'Expert guidance for buying and selling luxury homes in Metro Atlanta',
        },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Home Insurance Referrals',
          description: 'Trusted home insurance connections for comprehensive property protection',
        },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Closing Services Coordination',
          description: 'Seamless transaction management and closing coordination',
        },
      },
    ],
  },
  
  // Professional Credentials
  knowsAbout: [
    'Residential Real Estate',
    'Luxury Home Sales',
    'Property Investment',
    'Market Analysis',
    'Negotiation',
    'Atlanta Real Estate Market',
  ],
  
  // Social Media Profiles
  sameAs: [
    siteConfig.social.instagram,
    siteConfig.social.facebook,
    siteConfig.social.linkedin,
  ].filter(Boolean),
  
  // Address (if you have a physical office)
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Marietta',
    addressRegion: 'GA',
    addressCountry: 'US',
    // Add specific address when available:
    // streetAddress: '123 Main Street',
    // postalCode: '30060',
  },
  
  // Operating Hours
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Saturday',
      opens: '10:00',
      closes: '16:00',
    },
  ],
  
  // Aggregate Rating (add when you have reviews)
  // aggregateRating: {
  //   '@type': 'AggregateRating',
  //   ratingValue: '4.9',
  //   reviewCount: '47',
  //   bestRating: '5',
  //   worstRating: '1',
  // },
};

/**
 * LocalBusiness Schema
 * For local search and Google Maps
 */
export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${baseUrl}/#localbusiness`,
  name: siteConfig.name,
  description: siteConfig.description,
  url: baseUrl,
  telephone: siteConfig.contact.phone,
  email: siteConfig.contact.email,
  image: `${baseUrl}/images/hero/joey-profile.jpg`,
  
  priceRange: '$$$$',
  
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Marietta',
    addressRegion: 'GA',
    addressCountry: 'US',
  },
  
  geo: {
    '@type': 'GeoCoordinates',
    // Add coordinates when available:
    // latitude: '33.9526',
    // longitude: '-84.5499',
  },
  
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
};

/**
 * Organization Schema
 * For brand identity and knowledge graph
 */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${baseUrl}/#organization`,
  name: siteConfig.fullName,
  alternateName: siteConfig.name,
  url: baseUrl,
  logo: {
    '@type': 'ImageObject',
    url: `${baseUrl}/images/brand/logo.png`,
    width: 600,
    height: 60,
  },
  
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: siteConfig.contact.phone,
    contactType: 'Customer Service',
    email: siteConfig.contact.email,
    areaServed: 'US',
    availableLanguage: 'English',
  },
  
  sameAs: [
    siteConfig.social.instagram,
    siteConfig.social.facebook,
    siteConfig.social.linkedin,
  ].filter(Boolean),
};

/**
 * WebSite Schema
 * For site-wide search and navigation
 */
export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${baseUrl}/#website`,
  url: baseUrl,
  name: siteConfig.name,
  description: siteConfig.description,
  publisher: {
    '@id': `${baseUrl}/#organization`,
  },
  
  // Site search functionality
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${baseUrl}/properties?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

/**
 * BreadcrumbList Schema
 * For navigation breadcrumbs in search results
 */
export function getBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Service Schema
 * For individual service pages
 */
export function getServiceSchema(service: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@id': `${baseUrl}/#realestateagent`,
    },
    areaServed: {
      '@type': 'City',
      name: 'Metro Atlanta',
    },
    url: `${baseUrl}${service.url}`,
  };
}

/**
 * FAQPage Schema
 * For FAQ sections (can be added to any page)
 */
export function getFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Review Schema
 * For client testimonials
 */
export function getReviewSchema(review: {
  author: string;
  rating: number;
  reviewBody: string;
  datePublished: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: {
      '@id': `${baseUrl}/#realestateagent`,
    },
    author: {
      '@type': 'Person',
      name: review.author,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    reviewBody: review.reviewBody,
    datePublished: review.datePublished,
  };
}

/**
 * Combined Schema for Homepage
 * Includes all primary schemas
 */
export const homepageSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    websiteSchema,
    organizationSchema,
    realEstateAgentSchema,
    localBusinessSchema,
  ],
};

// Made with Bob
