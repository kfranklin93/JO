// JOEY UPDATE: Created neighborhoods data structure for browsing section
// Replace placeholder content with real neighborhood data, images, and links

export interface Neighborhood {
  name: string;
  description: string;
  image: string;
  priceRange: string;
  highlights: string[];
  slug: string;
}

export const atlantaNeighborhoods: Neighborhood[] = [
  {
    name: 'Midtown Atlanta',
    description: 'Urban sophistication meets walkable lifestyle in Atlanta\'s cultural heart.',
    image: '/images/neighborhoods/midtown.jpg',
    priceRange: '$400K - $2M+',
    highlights: ['Piedmont Park', 'Arts District', 'Fine Dining', 'High-Rise Living'],
    slug: 'midtown-atlanta',
  },
  {
    name: 'Buckhead',
    description: 'Luxury living with world-class shopping, dining, and entertainment.',
    image: '/images/neighborhoods/buckhead.jpg',
    priceRange: '$600K - $5M+',
    highlights: ['Phipps Plaza', 'Top Schools', 'Luxury Estates', 'Fine Dining'],
    slug: 'buckhead',
  },
  {
    name: 'East Cobb',
    description: 'Family-friendly suburbs with excellent schools and spacious homes.',
    image: '/images/neighborhoods/east-cobb.jpg',
    priceRange: '$500K - $2M+',
    highlights: ['Top-Rated Schools', 'Parks & Recreation', 'Family Community', 'New Construction'],
    slug: 'east-cobb',
  },
  {
    name: 'Roswell',
    description: 'Historic charm with modern amenities and strong community feel.',
    image: '/images/neighborhoods/roswell.jpg',
    priceRange: '$450K - $1.5M',
    highlights: ['Historic District', 'Chattahoochee River', 'Great Schools', 'Local Shops'],
    slug: 'roswell',
  },
  {
    name: 'Kennesaw',
    description: 'Growing community with affordable options and outdoor recreation.',
    image: '/images/neighborhoods/kennesaw.jpg',
    priceRange: '$350K - $800K',
    highlights: ['Kennesaw Mountain', 'Affordable Living', 'Growing Market', 'Family Friendly'],
    slug: 'kennesaw',
  },
  {
    name: 'Smyrna',
    description: 'Vibrant downtown with easy access to Atlanta and great local amenities.',
    image: '/images/neighborhoods/smyrna.jpg',
    priceRange: '$400K - $900K',
    highlights: ['Market Village', 'SunTrust Park', 'Local Dining', 'Community Events'],
    slug: 'smyrna',
  },
];

// Made with Bob