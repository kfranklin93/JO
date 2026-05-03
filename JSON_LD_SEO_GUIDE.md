# JSON-LD Structured Data for Local SEO

## What is JSON-LD?

JSON-LD (JavaScript Object Notation for Linked Data) is a method of encoding structured data using JSON. It helps search engines understand your business information, leading to:

- **Better local search rankings** in Google Maps and local pack results
- **Rich snippets** in search results (star ratings, business hours, contact info)
- **Knowledge panels** showing your business details
- **Voice search optimization** for "near me" queries
- **Enhanced click-through rates** with rich result displays

---

## What We've Implemented

### 1. **RealEstateAgent Schema** (`realEstateAgentSchema`)
**Purpose:** Tells Google that Joey is a real estate professional

**Includes:**
- Name, description, contact information
- Service areas (Atlanta, Marietta, Buckhead, Sandy Springs, Roswell)
- Services offered (residential sales, insurance referrals, closing coordination)
- Professional credentials and expertise
- Social media profiles
- Business hours
- Office address (when available)

**Used on:** Homepage, About page

---

### 2. **LocalBusiness Schema** (`localBusinessSchema`)
**Purpose:** Helps with Google Maps and local search results

**Includes:**
- Business name and description
- Contact information
- Address and geo-coordinates (when available)
- Price range indicator ($$$$)
- Operating hours

**Used on:** Homepage

---

### 3. **Organization Schema** (`organizationSchema`)
**Purpose:** Establishes brand identity for knowledge graph

**Includes:**
- Organization name and logo
- Contact points
- Social media profiles
- Brand identity information

**Used on:** Homepage

---

### 4. **WebSite Schema** (`websiteSchema`)
**Purpose:** Enables site search in Google results

**Includes:**
- Site URL and description
- Search functionality template
- Publisher information

**Used on:** Homepage

---

### 5. **BreadcrumbList Schema** (`getBreadcrumbSchema()`)
**Purpose:** Shows navigation path in search results

**Example:**
```
Home > About > Services
```

**Used on:** All interior pages (About, Services, Contact, etc.)

---

## How to Use

### Adding to a Page

```tsx
import { StructuredData } from '@/components/seo/StructuredData';
import { realEstateAgentSchema, getBreadcrumbSchema } from '@/config/structured-data';

export default function MyPage() {
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'My Page', url: '/my-page' },
  ]);

  return (
    <>
      <StructuredData data={realEstateAgentSchema} />
      <StructuredData data={breadcrumbs} />
      <main>
        {/* Your page content */}
      </main>
    </>
  );
}
```

---

## Customization Required

### 1. **Update Contact Information**

**File:** `src/config/site.ts`

```typescript
export const siteConfig = {
  contact: {
    phone: '(770) XXX-XXXX', // Update with real phone
    email: 'joey@joeyoberndorfer.com', // Update with real email
  },
};
```

### 2. **Add Physical Address**

**File:** `src/config/structured-data.ts`

Find the `address` section and uncomment:

```typescript
address: {
  '@type': 'PostalAddress',
  streetAddress: '123 Main Street', // Add real address
  addressLocality: 'Marietta',
  addressRegion: 'GA',
  postalCode: '30060', // Add real zip code
  addressCountry: 'US',
},
```

### 3. **Add Geo-Coordinates**

Get coordinates from Google Maps, then update:

```typescript
geo: {
  '@type': 'GeoCoordinates',
  latitude: '33.9526', // Your office latitude
  longitude: '-84.5499', // Your office longitude
},
```

### 4. **Add Aggregate Ratings** (When You Have Reviews)

Uncomment in `realEstateAgentSchema`:

```typescript
aggregateRating: {
  '@type': 'AggregateRating',
  ratingValue: '4.9', // Average rating
  reviewCount: '47', // Total reviews
  bestRating: '5',
  worstRating: '1',
},
```

### 5. **Update Social Media Links**

**File:** `src/config/site.ts`

```typescript
social: {
  instagram: 'https://instagram.com/gowithjoeyo',
  facebook: 'https://facebook.com/joeyoberndorfer',
  linkedin: 'https://linkedin.com/in/joeyoberndorfer',
},
```

---

## Testing Your Structured Data

### 1. **Google Rich Results Test**
URL: https://search.google.com/test/rich-results

1. Enter your page URL
2. Click "Test URL"
3. Check for errors or warnings
4. Verify all schemas are detected

### 2. **Schema Markup Validator**
URL: https://validator.schema.org/

1. Paste your page URL or HTML
2. Review validation results
3. Fix any errors

### 3. **Google Search Console**
1. Go to Search Console
2. Navigate to "Enhancements"
3. Check for structured data errors
4. Monitor rich result performance

---

## Service-Specific Schemas

### For Service Pages (Buy Home, Sell Home, etc.)

```tsx
import { getServiceSchema } from '@/config/structured-data';

const serviceSchema = getServiceSchema({
  name: 'Home Buying Services',
  description: 'Expert guidance for buying luxury homes in Metro Atlanta',
  url: '/buy-home',
});

<StructuredData data={serviceSchema} />
```

### For FAQ Sections

```tsx
import { getFAQSchema } from '@/config/structured-data';

const faqSchema = getFAQSchema([
  {
    question: 'How long does it take to sell a home?',
    answer: 'On average, homes in Metro Atlanta sell within 30-45 days...',
  },
  // Add more FAQs
]);

<StructuredData data={faqSchema} />
```

### For Client Testimonials

```tsx
import { getReviewSchema } from '@/config/structured-data';

const reviewSchema = getReviewSchema({
  author: 'John Smith',
  rating: 5,
  reviewBody: 'Joey helped us find our dream home...',
  datePublished: '2024-01-15',
});

<StructuredData data={reviewSchema} />
```

---

## SEO Impact

### Local Search Benefits

1. **"Real estate agent near me"** - Your business appears in local pack
2. **Google Maps visibility** - Shows up with correct info and hours
3. **Knowledge panel** - Displays business details in sidebar
4. **Rich snippets** - Star ratings and contact info in results

### Expected Timeline

- **Immediate:** Google can read the structured data
- **1-2 weeks:** May appear in rich results
- **1-3 months:** Full local SEO impact visible

---

## Monitoring Performance

### Key Metrics to Track

1. **Local Pack Appearances** - How often you show in the 3-pack
2. **Rich Result Impressions** - Views with enhanced display
3. **Click-Through Rate** - Improvement from rich snippets
4. **"Near Me" Rankings** - Position for local queries

### Tools

- Google Search Console (Enhancements report)
- Google Business Profile Insights
- Local rank tracking tools (BrightLocal, Whitespark)

---

## Common Issues & Fixes

### Issue: "Missing required field"
**Fix:** Add the required property to the schema in `structured-data.ts`

### Issue: "Invalid URL"
**Fix:** Ensure `NEXT_PUBLIC_SITE_URL` is set in `.env.local`

### Issue: "Duplicate schema"
**Fix:** Only include each schema type once per page

### Issue: "Incorrect format"
**Fix:** Validate JSON syntax in the schema configuration

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/config/structured-data.ts` | All schema definitions |
| `src/components/seo/StructuredData.tsx` | Component to inject JSON-LD |
| `src/config/site.ts` | Business contact info |
| `.env.local` | Site URL configuration |

---

## Next Steps

1. ✅ **Implemented:** Base schemas for homepage and about page
2. ⚠️ **Required:** Update contact info, address, and coordinates
3. 📋 **Recommended:** Add service schemas to all service pages
4. 📋 **Optional:** Add FAQ and review schemas when content is ready
5. 🧪 **Test:** Validate with Google Rich Results Test
6. 📊 **Monitor:** Track performance in Search Console

---

## Resources

- [Schema.org Documentation](https://schema.org/)
- [Google Search Central - Structured Data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [JSON-LD Playground](https://json-ld.org/playground/)
- [Google Rich Results Test](https://search.google.com/test/rich-results)