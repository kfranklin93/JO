/**
 * StructuredData Component
 * 
 * Injects JSON-LD structured data into the page <head> for SEO.
 * Used for local business, real estate agent, and other schema.org markup.
 * 
 * @example
 * ```tsx
 * import { StructuredData } from '@/components/seo/StructuredData';
 * import { homepageSchema } from '@/config/structured-data';
 * 
 * export default function HomePage() {
 *   return (
 *     <>
 *       <StructuredData data={homepageSchema} />
 *       <main>...</main>
 *     </>
 *   );
 * }
 * ```
 */

interface StructuredDataProps {
  /**
   * The JSON-LD structured data object
   */
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data, null, 0),
      }}
    />
  );
}

// Made with Bob
