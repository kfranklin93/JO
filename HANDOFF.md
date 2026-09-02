# Joey O. Real Estate — Project Handoff Document

> Written for a developer joining the project to help stand up the remaining infrastructure.
> No credentials are included here. All secrets are managed via environment variables.

---

## Project Overview

A Next.js 16 / TypeScript real estate site for Joey Oberndorfer, Atlanta-area agent.
The site has three layers:

1. **Marketing site** — public-facing pages (home, buy, sell, insurance, closing, about, contact)
2. **Lead capture** — forms that collect buyer/seller leads and store them in a database
3. **Agent dashboard** — password-protected backend at `/dashboard` where Joey manages leads, views stats, and monitors AI activity

The AI layer uses **AWS Bedrock (Claude 4.5 Sonnet)** to write personalized follow-up emails in Joey's voice, delivered via **Resend**.

---

## Live URLs

| Environment                 | URL                                       |
| --------------------------- | ----------------------------------------- |
| Production                  | https://gowithjoeyo.netlify.app           |
| Custom domain (pending DNS) | https://gowithjoeyo.com                   |
| Dashboard                   | https://gowithjoeyo.netlify.app/dashboard |

---

## Tech Stack

| Layer            | Technology                                                                    |
| ---------------- | ----------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router), TypeScript                                           |
| Styling          | Tailwind CSS v4                                                               |
| Database         | Neon Serverless Postgres                                                      |
| ORM              | Drizzle ORM                                                                   |
| AI               | AWS Bedrock — Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20241022-v2:0`) |
| Email            | Resend                                                                        |
| SMS              | Twilio (configured, not yet activated)                                        |
| Hosting          | Netlify                                                                       |
| Domain registrar | Namecheap                                                                     |

---

## Repository Structure

```
/
├── src/
│   ├── app/
│   │   ├── (marketing)/        # Public pages — home, buy, sell, etc.
│   │   ├── dashboard/          # Protected agent dashboard
│   │   │   ├── page.tsx        # Main dashboard UI (leads table, stats)
│   │   │   ├── layout.tsx      # Dashboard layout wrapper
│   │   │   └── login/page.tsx  # Password login page
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/      # Sets auth cookie on correct password
│   │       │   └── logout/     # Clears auth cookie
│   │       ├── leads/          # POST — saves lead + schedules follow-ups
│   │       ├── dashboard/data/ # GET — returns lead stats (auth required)
│   │       ├── ai/
│   │       │   ├── chat/       # 🔴 STUB — not yet implemented
│   │       │   └── follow-up/  # 🔴 STUB — not yet implemented
│   │       └── cron/
│   │           ├── follow-ups/ # ✅ Reads DB, sends due emails, updates status
│   │           └── daily-summary/ # Sends Joey a daily lead digest
│   ├── components/
│   │   ├── layout/             # Header, Footer, MobileMenu, Navigation
│   │   ├── sections/           # Marketing page sections
│   │   ├── forms/              # Lead capture forms
│   │   ├── dashboard/          # AiLogsPanel (AI copilot UI)
│   │   └── ui/                 # Button, Input, Modal, etc.
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts        # Neon + Drizzle client (lazy init)
│   │   │   └── schema.ts       # All table definitions
│   │   ├── api/
│   │   │   ├── bedrock.ts      # AWS Bedrock client + helpers
│   │   │   └── lofty.ts        # Lofty CRM integration (optional)
│   │   ├── services/
│   │   │   ├── email-service.ts       # Resend email helpers
│   │   │   ├── follow-up-scheduler.ts # AI email generation + send logic
│   │   │   └── sms-service.ts         # Twilio SMS helpers
│   │   └── prompts/
│   │       └── joey-voice.ts   # All AI prompt templates in Joey's voice
│   ├── config/
│   │   ├── env.ts              # Zod-validated env var schema
│   │   └── site.ts             # Site-wide constants (name, stats, contact)
│   └── proxy.ts                # Redirect affordance — sends /dashboard to /login
├── tailwind.config.ts          # Color tokens (cerulean, bronze, navy, etc.)
├── next.config.ts              # Image config, security headers
└── .env.local                  # Local dev secrets — NEVER commit this
```

---

## Auth Flow

Dashboard is protected by a simple password cookie:

1. User visits `/dashboard` → `src/proxy.ts` checks whether a `dashboard_auth` cookie is present
2. If absent → redirected to `/dashboard/login`
3. Login page POSTs password to `/api/auth/login`
4. Route compares against `ADMIN_PASSWORD` env var
5. On match → sets a signed `dashboard_auth` cookie (7 days)
6. Every `/dashboard` render and every `/api/dashboard/*` request verifies that signature

The proxy is a redirect affordance only — it checks presence, never validity. The
real checks are in `src/app/dashboard/layout.tsx` and
`src/app/api/dashboard/data/route.ts`, which both run in the Node runtime where the
signing secret is reliably readable.

No external auth provider. The cookie carries an HMAC-signed payload with an embedded
expiry, so it cannot be fabricated from anything in this repository. `SESSION_SECRET`
must be set in Netlify or login returns 503.

---

## Database Schema

Five tables in Neon Postgres. Managed via Drizzle ORM.

```
leads           — core lead info, status, engagement score
follow_ups      — scheduled/sent email follow-up tracking per lead
conversations   — SMS and email message history
analytics_events — conversion and engagement event tracking
ab_tests        — A/B testing for message variants
```

**To push schema to a fresh database:**

```bash
npm run db:push
```

**To open Drizzle Studio (visual DB browser):**

```bash
npm run db:studio
```

---

## Lead Flow (what happens on form submit)

```
Customer submits form
  → POST /api/leads
  → Lead saved to Neon (leads table)
  → 4 follow-up rows inserted (follow_ups table): day3, day7, day14, day30
  → Immediate follow-up email generated by Claude and sent via Resend
  → Joey notified via email (Resend)
  → Joey notified via SMS (Twilio — if configured)
  → Lead synced to Lofty CRM (if configured)
```

---

## Cron / Automated Follow-ups

The cron endpoint at `/api/cron/follow-ups` runs daily and:

1. Queries `follow_ups` where `status = 'scheduled'` AND `scheduledFor <= now`
2. For each due follow-up, generates a personalized email via Claude
3. Sends it via Resend
4. Updates the DB row to `status = 'sent'` or `'failed'`

**Must be triggered externally** — Netlify does not auto-schedule this.

Set up a free cron at **[cron-job.org](https://cron-job.org)**:

- URL: `https://gowithjoeyo.netlify.app/api/cron/follow-ups`
- Method: `GET`
- Schedule: `0 7 * * *` (7am daily)
- Header: `Authorization: Bearer <CRON_SECRET value>`

---

## Environment Variables

All secrets live in Netlify → Site configuration → Environment variables.
For local dev, copy `.env.example` to `.env.local` and fill in real values.

### Required (site is broken without these)

| Variable               | Purpose                                 | Where to get it                         |
| ---------------------- | --------------------------------------- | --------------------------------------- |
| `DATABASE_URL`         | Neon Postgres connection string         | neon.tech → Project → Connection string |
| `ADMIN_PASSWORD`       | Dashboard login password                | Choose a strong one                     |
| `RESEND_API_KEY`       | Email sending                           | resend.com → API Keys                   |
| `JOEY_EMAIL`           | Send-from address + notification target | Verified in Resend dashboard            |
| `JOEY_PHONE`           | Joey's phone for SMS alerts             | Joey's real number                      |
| `NEXT_PUBLIC_SITE_URL` | Used in email links                     | `https://gowithjoeyo.com` (after DNS)   |

### Required for AI follow-ups

| Variable                | Purpose        | Where to get it                       |
| ----------------------- | -------------- | ------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | Bedrock auth   | AWS IAM → User → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Bedrock auth   | Same as above                         |
| `AWS_REGION`            | Bedrock region | `us-east-1`                           |

> ⚠️ Bedrock model access must be explicitly requested in the AWS console.
> Go to **Bedrock → Model access → Manage** and enable `Claude 3.5 Sonnet`.
> Model ID: `anthropic.claude-3-5-sonnet-20241022-v2:0`

### Optional

| Variable              | Purpose                          |
| --------------------- | -------------------------------- |
| `TWILIO_ACCOUNT_SID`  | SMS alerts to Joey               |
| `TWILIO_AUTH_TOKEN`   | SMS alerts to Joey               |
| `TWILIO_PHONE_NUMBER` | SMS sender number                |
| `CALENDLY_LINK`       | Booking link in email signatures |
| `CRON_SECRET`         | Secures the cron endpoint        |
| `LOFTY_API_KEY`       | Lofty CRM sync                   |
| `LOFTY_API_BASE_URL`  | Lofty CRM base URL               |

---

## DNS Setup (Namecheap → Netlify)

Domain: `gowithjoeyo.com`
Registrar: Namecheap (account name has a typo — `JoeyObernorfer` — cannot be changed)

**To point the domain to Netlify:**

In Netlify → Site → Domain management → Add custom domain → `gowithjoeyo.com`
Netlify will give you nameservers. Then in Namecheap:

1. Log into Namecheap
2. Domain List → `gowithjoeyo.com` → Manage
3. Nameservers → Custom DNS
4. Enter the 4 Netlify nameservers (look like `dns1.p0X.nsone.net`)

DNS propagation: 10 minutes to a few hours.

**To set up email sending from `@gowithjoeyo.com` (Resend):**

After DNS is live, in Resend → Domains → Add domain → `gowithjoeyo.com`
Add the MX, TXT (SPF), and CNAME (DKIM) records Resend provides to Namecheap DNS.

---

## What Still Needs to Be Built

### 🔴 Blockers (app is incomplete without these)

| Item                   | File             | Notes                                                  |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| AWS Bedrock keys       | Netlify env vars | AI emails won't generate without this                  |
| DNS pointed to Netlify | Namecheap        | `gowithjoeyo.com` not live yet                         |
| Resend domain verified | resend.com       | Emails send from generic address until this is done    |
| Cron job scheduled     | cron-job.org     | Follow-up sequence won't fire without external trigger |

### 🟡 Code stubs (not yet implemented)

| Endpoint                 | File                                | What it should do                                       |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| `POST /api/ai/chat`      | `src/app/api/ai/chat/route.ts`      | Accept a message + lead context, return Claude response |
| `POST /api/ai/follow-up` | `src/app/api/ai/follow-up/route.ts` | Trigger a manual follow-up for a specific lead          |

These power the AI Copilot panel in the dashboard (`src/components/dashboard/AiLogsPanel.tsx`). Currently the panel shows mock data from `src/data/mockBedrockLogs.ts`.

### ⚪ Nice to have

| Item                   | Notes                                              |
| ---------------------- | -------------------------------------------------- |
| Twilio SMS             | Service is built, just needs keys                  |
| Lofty CRM sync         | Service is built, just needs API key from Lofty    |
| Real property listings | `src/data/properties.ts` has mock data             |
| Real testimonials      | `src/data/testimonials.ts` has placeholder content |
| Google Maps API        | For neighborhood/property maps                     |

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file and fill in real values
cp .env.example .env.local

# Push schema to your Neon database (one time)
npm run db:push

# Start dev server
npm run dev

# Type check
npm run typecheck

# Format
npm run format
```

---

## Deployment

Hosted on Netlify. Deploys automatically on push to `main`.

To trigger a manual redeploy (e.g. after adding env vars):
Netlify dashboard → Deploys → Trigger deploy → Deploy site

**After adding any new env var in Netlify, you must redeploy for it to take effect.**

---

## Color System

The site uses a custom Tailwind palette. Accent color is a single source of truth:

```ts
// tailwind.config.ts
accent: {
  DEFAULT: '#0A7EA4';
} // Cerulean — change here to update everywhere
```

Key tokens:

- `cerulean` (`#0A7EA4`) — interactive elements, CTAs, focus rings
- `bronze` (`#A0522D`) — decorative accents, ratings, identity elements
- `navy` (`#1C2A39`) — primary dark color, headings
- `champagne` (`#C5A059`) — legacy token, still in config but replaced by cerulean/bronze in UI

---

## Contact

- **Joey Oberndorfer** — client, real estate agent — `Gowithjoeyo@gmail.com`
- **Kenan Franklin** — lead developer

---

_Last updated: see git log_
