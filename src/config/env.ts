import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('Joey O. Real Estate'),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  LOFTY_API_BASE_URL: z.string().optional(),
  LOFTY_API_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_BEDROCK_MODEL_ID: z.string().optional(),
  ANALYTICS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  LOFTY_API_BASE_URL: process.env.LOFTY_API_BASE_URL,
  LOFTY_API_KEY: process.env.LOFTY_API_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_BEDROCK_MODEL_ID: process.env.AWS_BEDROCK_MODEL_ID,
  ANALYTICS_API_KEY: process.env.ANALYTICS_API_KEY,
});
