export const navigationConfig = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  {
    label: 'Services',
    href: '/services',
    children: [
      { label: 'Buy a Home', href: '/buy-home' },
      { label: 'Sell Your Home', href: '/sell-home' },
      { label: 'Home Insurance', href: '/home-insurance' },
      { label: 'Closing Services', href: '/closing-services' },
    ],
  },
  { label: 'Contact', href: '/contact' },
] as const;
