/**
 * Client testimonials.
 *
 * ## This file held six invented people
 *
 * `clientTestimonials` shipped with six fabricated reviews — names, roles,
 * neighbourhoods, quoted outcomes ("8% over asking", "sold in 10 days",
 * "closed in just 30 days") and a 5-star rating each — under a comment asking
 * whoever came next to "replace placeholder content with real client
 * testimonials". Nobody did, and they went live and got indexed as endorsements
 * of a licensed real estate agent. They are deleted, not reworded: there is no
 * edit that turns an invented endorsement into a real one.
 *
 * The array is empty and that is the correct state. It stays empty until Joey
 * supplies reviews that exist somewhere a visitor can go and read them.
 *
 * ## Why `source` is required
 *
 * The old shape was `{ name, role, content, rating, image?, location? }`. It
 * had no field for where a review came from, so an invented entry and a real
 * one were the same object and nothing — not the type, not the component, not a
 * test — could tell them apart. That is the actual defect, and it outlived the
 * six entries.
 *
 * `source` is non-optional. TypeScript rejects an entry without it, so adding a
 * testimonial now means naming the platform it was published on, linking to it,
 * and dating it, or the build fails. `platform` is a union rather than a free
 * string on purpose: the members are the places Joey actually has a public
 * review profile (see `siteConfig.social` and the Google Business Profile note
 * in src/config/site.ts), so "a client emailed me this" has nowhere to go.
 *
 * A review's rating and date feed the JSON-LD directly — see
 * `getReviewSchemas` and `getAggregateRating` in src/config/structured-data.ts.
 * Adding one entry here lights up both the homepage section and the review
 * schema with no other edit.
 */

/** Where a review was published, and the public page a visitor can verify it on. */
export interface TestimonialSource {
  /**
   * The platform the review was left on. Restricted to the profiles Joey
   * publicly holds — a review with no public home is not a testimonial we can
   * show, because a visitor has no way to check it.
   */
  platform: 'Zillow' | 'Realtor.com' | 'Homes.com' | 'Google' | 'Facebook';
  /** Direct link to the review, or to the profile page that lists it. */
  url: string;
  /** Publication date, ISO 8601 `YYYY-MM-DD`. Fed to `datePublished` in JSON-LD. */
  datePublished: string;
}

export interface Testimonial {
  name: string;
  role: string;
  content: string;
  /** 1–5, as left by the reviewer on `source.platform`. Never assigned by us. */
  rating: number;
  /** Required. See the note at the top of this file. */
  source: TestimonialSource;
  image?: string;
  location?: string;
}

/**
 * Real, attributable client reviews. Empty until Joey provides them.
 *
 * Do not add an entry you cannot link to.
 */
export const clientTestimonials: Testimonial[] = [];
