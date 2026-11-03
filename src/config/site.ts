export const siteConfig = {
  name: 'GoWithJoeyO',
  fullName: 'Joey Oberndorfer',
  title: 'Joey Oberndorfer | Top Real Estate Agent in Atlanta & Greater Metro',
  tagline: 'Built to close.',
  // Positioning line, from the brand sheet. The eXp ICON Agent and Zillow
  // Rising Star credentials that used to live here are genuine local-search
  // ranking signals, so they stay in `description` below (which feeds page
  // metadata and every JSON-LD schema) and in `awards`. They are not lost.
  subtitle: 'REALTOR · ADVISOR · INVESTOR',
  description:
    'Award-winning real estate specialist in Atlanta. Former law enforcement officer turned top producer with 60+ closed deals and $23.9M in volume. eXp ICON Agent and Zillow Rising Star Award winner.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  
  // Performance Stats
  //
  // `closedDeals` and `totalVolume` match the figures Joey publishes in his
  // bio and on his brokerage profiles. Note `closedDeals` already carries its
  // own '+' — appending another renders "60++", which was live on the closing
  // CTA. It counts closed transactions, not clients.
  //
  // UNVERIFIED — this one still needs Joey's real number:
  //
  //   conversionRate   'One-Tour'      A descriptor, not a rate. Labelled
  //                                    "First-Tour Buyers" rather than
  //                                    "Conversion Rate" so the label matches
  //                                    the value it actually holds. Wants a
  //                                    real percentage.
  //
  // Do not substitute plausible-looking numbers here. These are a licensed
  // agent's published performance claims; an invented one is a professional
  // and a legal problem, not a copy problem.
  //
  // `avgDaysOnMarket` is gone. It held a day count written in months, taken
  // from the named inventory framework the owner has since said is not a real
  // concept — so the value is retired as data rather than merely hidden from
  // the page. Add a real day count under a new field if one ever exists.
  stats: {
    closedDeals: '60+',
    totalVolume: '$23.9M',
    conversionRate: 'One-Tour',
  },
  
  // Contact Information
  contact: {
    phone: '619-997-1090',
    phoneDisplay: '(619) 997-1090',
    // Canonical public address, confirmed by Joey. This is what the structured
    // data publishes, so it has to match his Google Business Profile and his
    // Zillow, Realtor.com and Homes.com listings exactly — inconsistent contact
    // details across sources actively dilute local search ranking.
    //
    // Note this is the address clients see and reply to. Outbound mail is sent
    // from MAIL_FROM instead, because Resend will only send from a verified
    // domain and gmail.com can never be one. See the note in src/config/env.ts.
    email: 'gowithjoeyo@gmail.com',
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
  
  // RealScout web components — the real MLS search and listings widgets.
  //
  // `agentEncodedId` is a *public embed identifier*, not a credential. It is
  // rendered into the page as the `agent-encoded-id` attribute of every
  // RealScout custom element, so it is visible in page source by design and
  // belongs in source control rather than in an environment variable. It is
  // kept here so the one place to change it when Joey's RealScout account
  // changes is this file.
  //
  // `scriptSrc` is the single UMD bundle that upgrades all three elements —
  // simple-search, advanced-search and your-listings. It is the same URL for
  // every widget, which is why it lives here once: a page hosting two widgets
  // must load it once, and React dedupes an async script by `src`.
  realscout: {
    agentEncodedId: 'QWdlbnQtMjcyNDY1',
    scriptSrc: 'https://em.realscout.com/widgets/realscout-web-components.umd.js',
  },

  // Featured Content
  featured: {
    youtubeInterview: 'https://www.youtube.com/watch?v=zdibORytY2c',
    interviewTitle: 'Real Estate Success Stories: The Mindset That Makes Millions',
  },
} as const;

