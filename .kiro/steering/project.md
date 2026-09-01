# Joey O. Real Estate — Project Context

> Read HANDOFF.md at the repo root before doing anything.
> It contains the full project setup, architecture, environment variables,
> DNS instructions, what is built, what is stubbed, and what still needs work.

## Quick orientation

- Next.js 16 / TypeScript / Tailwind CSS v4
- Hosted on Netlify at https://gowithjoeyo.netlify.app
- Database: Neon Serverless Postgres via Drizzle ORM
- AI: AWS Bedrock — Claude 3.5 Sonnet
- Email: Resend
- Domain: gowithjoeyo.com (Namecheap — DNS not yet pointed to Netlify)

## What needs to be done (priority order)

1. Point gowithjoeyo.com DNS to Netlify (Namecheap → custom nameservers)
2. Verify gowithjoeyo.com in Resend for email sending
3. Set AWS Bedrock env vars in Netlify (AI follow-ups depend on this)
4. Set up daily cron trigger at cron-job.org → /api/cron/follow-ups
5. Implement POST /api/ai/chat (src/app/api/ai/chat/route.ts — currently a 501 stub)
6. Implement POST /api/ai/follow-up (src/app/api/ai/follow-up/route.ts — currently a 501 stub)

## Key constraints

- Never commit .env.local
- All secrets go in Netlify environment variables
- After adding any env var in Netlify, trigger a manual redeploy
- The accent color system is a single source of truth in tailwind.config.ts — do not hardcode hex values
- Dashboard auth uses a simple cookie — do not replace with an external auth provider

## Full details

See HANDOFF.md in the repo root.
