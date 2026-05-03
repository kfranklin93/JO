export const siteConfig = {
  name: 'GoWithJoeyO',
  fullName: 'Joey Oberndorfer',
  title: 'Joey Oberndorfer | Luxury Real Estate in Marietta & Greater Atlanta',
  tagline: 'One-Tour Conversion Mastery',
  description:
    'Award-winning luxury real estate specialist in Marietta and Greater Atlanta. 59 closed deals, $23.9M in volume. Experience the difference of working with a high-performance professional.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  
  // Performance Stats
  stats: {
    closedDeals: 59,
    totalVolume: '$23.9M',
    avgDaysOnMarket: '0-4-7 Months',
    conversionRate: 'One-Tour',
  },
  
  // Contact Information
  contact: {
    phone: '(770) 123-4567', // TODO: Add real phone
    email: 'joey@gowithjoey.com', // TODO: Add real email
    location: 'Marietta, GA',
  },
  
  // Social Links
  social: {
    facebook: 'https://facebook.com/gowithjoeyO',
    instagram: 'https://instagram.com/gowithjoeyO',
    linkedin: 'https://linkedin.com/in/joeyoberndorfer',
  },
  
  // Awards & Recognition
  awards: [
    'Greater Atlanta Home Builders Association Award Winner',
    'Top Producer - Marietta Market',
  ],
} as const;
