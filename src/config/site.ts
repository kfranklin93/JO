export const siteConfig = {
  name: 'GoWithJoeyO',
  fullName: 'Joey Oberndorfer',
  title: 'Joey Oberndorfer | Top Real Estate Agent in Atlanta & Greater Metro',
  tagline: "Built on results. Driven by connection. Let's win together. 🏠🔑",
  subtitle: 'eXp ICON Agent | Zillow Rising Star',
  description:
    'Award-winning real estate specialist in Atlanta. Former law enforcement officer turned top producer with 60+ closed deals and $23.9M in volume. eXp ICON Agent and Zillow Rising Star Award winner.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  
  // Performance Stats
  stats: {
    closedDeals: '60+',
    totalVolume: '$23.9M',
    avgDaysOnMarket: '0-4-7 Months',
    conversionRate: 'One-Tour',
  },
  
  // Contact Information
  contact: {
    phone: '619-997-1090',
    phoneDisplay: '(619) 997-1090',
    email: 'JoeyObern@gmail.com',
    location: 'Atlanta, GA',
    office: '1230 Peachtree St, Atlanta, GA 30309',
    brokerage: 'eXp Realty LLC',
  },
  
  // Social Links
  social: {
    instagram: 'https://www.instagram.com/joeyoberndorfer/',
    facebook: 'https://www.facebook.com/joey.oberndorfer',
    linkedin: 'https://www.linkedin.com/in/joey-oberndorfer-4a5a54100/',
    youtube: 'https://www.youtube.com/@joeyoberndorfer',
    zillow: 'https://www.zillow.com/profile/JoeyOberndorfer',
    realtor: 'https://www.realtor.com/realestateagents/66b77b21faed6467a4c2c68d',
    homescom: 'https://www.homes.com/real-estate-agents/joseph-oberndorfer/09rw4p2/',
  },
  
  // Awards & Recognition
  awards: [
    'eXp Realty ICON Agent',
    'Zillow Excellence Award - Rising Star',
    'Top Producer - Atlanta Metro Market',
  ],
  
  // Professional Background
  background: {
    education: 'B.S. in Interdisciplinary Sciences, South Dakota School of Mines and Technology',
    previousCareer: 'San Diego Police Department Officer',
    athletics: 'Division II Football Player',
    specialties: [
      'First-time Homebuyers',
      'Complex Listings',
      'Atlanta Metro Market (Midtown, Kennesaw, Roswell, Smyrna)',
    ],
  },
  
  // Featured Content
  featured: {
    youtubeInterview: 'https://www.youtube.com/watch?v=zdibORytY2c',
    interviewTitle: 'Real Estate Success Stories: The Mindset That Makes Millions',
  },
} as const;

