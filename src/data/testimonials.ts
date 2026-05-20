// JOEY UPDATE: Created testimonials data structure for social proof section
// Replace placeholder content with real client testimonials

export interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
  image?: string;
  location?: string;
}

export const clientTestimonials: Testimonial[] = [
  {
    name: 'Sarah & Michael Thompson',
    role: 'First-Time Homebuyers',
    location: 'Roswell, GA',
    content: 'Joey made our first home buying experience seamless and stress-free. His knowledge of the Atlanta market and dedication to finding us the perfect home was exceptional. We closed in just 30 days!',
    rating: 5,
    image: '/images/testimonials/client-1.jpg',
  },
  {
    name: 'David Chen',
    role: 'Luxury Home Seller',
    location: 'Buckhead, GA',
    content: 'Working with Joey was a game-changer. His marketing strategy and negotiation skills helped us sell our home for 8% over asking price. His professionalism and attention to detail are unmatched.',
    rating: 5,
    image: '/images/testimonials/client-2.jpg',
  },
  {
    name: 'Jennifer Martinez',
    role: 'Investment Property Buyer',
    location: 'Midtown Atlanta',
    content: 'Joey\'s market expertise and responsiveness made all the difference. He helped me identify and secure a fantastic investment property in a competitive market. I highly recommend him!',
    rating: 5,
    image: '/images/testimonials/client-3.jpg',
  },
  {
    name: 'Robert & Lisa Johnson',
    role: 'Relocating Family',
    location: 'East Cobb, GA',
    content: 'Relocating from out of state was daunting, but Joey made it easy. He took the time to understand our needs and showed us homes that truly fit our lifestyle. We couldn\'t be happier!',
    rating: 5,
    image: '/images/testimonials/client-4.jpg',
  },
  {
    name: 'Amanda Williams',
    role: 'Condo Buyer',
    location: 'Smyrna, GA',
    content: 'Joey is incredibly knowledgeable and patient. He walked me through every step of the buying process and negotiated a great deal. I felt supported and informed throughout.',
    rating: 5,
    image: '/images/testimonials/client-5.jpg',
  },
  {
    name: 'Mark & Patricia Davis',
    role: 'Downsizing Sellers',
    location: 'Kennesaw, GA',
    content: 'After 25 years in our home, we needed someone we could trust. Joey exceeded our expectations with his marketing, staging advice, and negotiation skills. Sold in 10 days!',
    rating: 5,
    image: '/images/testimonials/client-6.jpg',
  },
];

// Made with Bob