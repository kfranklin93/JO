export interface Property {
  title: string;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  image: string;
  status: string;
}

export const featuredProperties: Property[] = [
  {
    title: 'Modern Estate in East Cobb',
    price: '$1,250,000',
    beds: 5,
    baths: 4.5,
    sqft: '4,200',
    image: '/images/properties/now-selling.jpg',
    status: 'Just Listed'
  },
  {
    title: 'Luxury Townhome in Marietta',
    price: '$875,000',
    beds: 4,
    baths: 3.5,
    sqft: '3,100',
    image: '/images/properties/future-visions.jpg',
    status: 'Open House Sat'
  },
  {
    title: 'Executive Home in Roswell',
    price: '$1,450,000',
    beds: 6,
    baths: 5,
    sqft: '5,500',
    image: '/images/properties/legacy.jpg',
    status: 'Price Reduced'
  }
];

// Made with Bob
