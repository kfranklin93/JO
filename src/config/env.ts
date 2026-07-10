import { z } from 'zod';

const envSchema = z.object({
  // Public variables
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('Joey O. Real Estate'),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  
  // Database Configuration
  DATABASE_URL: z.string().url().optional(),
  
  // AWS Bedrock Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_BEDROCK_MODEL_ID: z.string().default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
  AWS_BEDROCK_MAX_TOKENS: z.coerce.number().default(2048),
  AWS_BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.7),
  
  // Email Configuration
  RESEND_API_KEY: z.string().optional(),
  JOEY_EMAIL: z.string().email().default('joey@example.com'),
  JOEY_PHONE: z.string().default('(770) 555-0100'),
  
  // Twilio SMS Configuration
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // Calendar Configuration
  CALENDLY_LINK: z.string().url().optional(),
  
  // CRM Configuration
  LOFTY_API_BASE_URL: z.string().optional(),
  LOFTY_API_KEY: z.string().optional(),
  
  // Analytics
  ANALYTICS_API_KEY: z.string().optional(),
  
  // Admin Dashboard
  ADMIN_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  AWS_REGION: process.env.AWS_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_BEDROCK_MODEL_ID: process.env.AWS_BEDROCK_MODEL_ID,
  AWS_BEDROCK_MAX_TOKENS: process.env.AWS_BEDROCK_MAX_TOKENS,
  AWS_BEDROCK_TEMPERATURE: process.env.AWS_BEDROCK_TEMPERATURE,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  JOEY_EMAIL: process.env.JOEY_EMAIL,
  JOEY_PHONE: process.env.JOEY_PHONE,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  CALENDLY_LINK: process.env.CALENDLY_LINK,
  LOFTY_API_BASE_URL: process.env.LOFTY_API_BASE_URL,
  LOFTY_API_KEY: process.env.LOFTY_API_KEY,
  ANALYTICS_API_KEY: process.env.ANALYTICS_API_KEY,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
});
