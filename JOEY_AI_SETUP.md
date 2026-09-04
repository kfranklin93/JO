# Joey's AI Assistant - Quick Setup Guide

Simple setup for automated follow-ups and client check-ins that sound like Joey.

---

## Step 1: AWS Setup (30 minutes)

### Create AWS Account
1. Go to https://aws.amazon.com → "Create Account"
2. Enter email, password, payment info
3. Choose "Basic Support" (free)

### Enable Bedrock
1. Sign in to AWS Console
2. Search "Bedrock" → Select region: **us-east-1**
3. Click "Model access" → "Manage model access"
4. Enable: **Anthropic Claude 3.5 Sonnet v2**
5. Wait for approval (1-5 minutes)

### Get Credentials
1. Search "IAM" → "Users" → "Create user"
2. Name: `joey-ai-assistant`
3. Attach policy: `AmazonBedrockFullAccess`
4. Create access key → **Save both keys securely**

---

## Step 2: Install & Configure (15 minutes)

### Install Dependencies
```bash
npm install @aws-sdk/client-bedrock-runtime resend
```

### Add to `.env.local`
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# Email service
RESEND_API_KEY=your_resend_key
JOEY_EMAIL=joey@example.com
```

---

## Step 3: Joey's Voice & Personality

Joey's AI should sound like him - friendly, knowledgeable, Atlanta-focused, and genuinely helpful.

### Key Traits:
- **Warm & Personal**: Uses first names, remembers details
- **Local Expert**: Knows Atlanta metro, neighborhoods, market trends
- **Action-Oriented**: Always suggests next steps
- **Authentic**: No corporate jargon, real conversations
- **Responsive**: Quick follow-ups, stays in touch

### Example Joey Messages:

**New Lead Follow-up:**
> Hey [Name]! Thanks for reaching out about [buying/selling] in [area]. I've been helping families in the Atlanta metro for years, and I'd love to help you too. 
>
> Based on what you shared, I think [specific insight]. Let's hop on a quick call this week - I have some ideas that might be perfect for you.
>
> When works best for you?

**30-Day Check-in:**
> Hey [Name]! Just wanted to check in - how's everything going with your home search in [area]? 
>
> The market's been [current trend], and I've seen some great properties come up that might interest you. Want me to send over a few?
>
> Either way, I'm here if you need anything!

**Past Client (6 months):**
> Hey [Name]! Hope you're loving the new place in [neighborhood]! 
>
> I was thinking about you because [relevant reason - market update, neighborhood news, etc.]. 
>
> Also, if you know anyone looking to buy or sell, I'd love to help them out. Thanks for thinking of me!

---

## Step 4: Automated Follow-up System

### Follow-up Schedule:
- **Immediate**: Thank you + next steps (within 1 hour)
- **Day 3**: Check-in + resources
- **Day 7**: Market update + property suggestions
- **Day 14**: Personal touch + scheduling
- **Day 30**: Re-engagement if no response
- **Every 60 days**: Past client check-ins

### Implementation Files Needed:

1. **`src/lib/prompts/joey-voice.ts`** - Joey's personality
2. **`src/lib/services/follow-up-scheduler.ts`** - Scheduling logic
3. **`src/lib/services/email-service.ts`** - Email sending
4. **`src/app/api/cron/follow-ups/route.ts`** - Automated trigger

---

## Step 5: Email Service Setup

### Resend (Recommended)
1. Sign up at https://resend.com
2. Get API key from dashboard
3. Add to `.env.local`
4. Verify domain (optional but recommended)

---

## Step 6: Deploy

### Netlify Setup:
1. Add environment variables in Netlify → Site configuration → Environment variables, including `CRON_SECRET`, then trigger a redeploy
2. Schedule the follow-up run externally. Netlify has no equivalent of a
   `vercel.json` `crons` block, and its scheduled functions cannot be invoked by
   URL, so they cannot drive a Next route handler. Create a cron-job.org job:
   - `GET https://gowithjoeyo.netlify.app/api/cron/follow-ups`
   - Header `Authorization: Bearer <CRON_SECRET>`
   - Schedule `0 11 * * *` (UTC — about 7 AM Eastern)
3. Deploy!

Full cron configuration, including the daily digest job, is in the Cron section of [`HANDOFF.md`](HANDOFF.md).

---

## What Gets Built:

### 1. Automated Follow-ups
- New leads get immediate response
- Scheduled follow-ups based on lead stage
- Personalized based on conversation history

### 2. Client Check-ins
- Past clients get periodic check-ins
- Market updates relevant to their area
- Referral requests at appropriate times

### 3. Joey's Voice
- All messages sound like Joey
- Context-aware (remembers conversations)
- Action-oriented (always suggests next steps)

---

## Cost Estimate:
- **AWS Bedrock**: ~$20-30/month (100 leads/day)
- **Resend Email**: Free tier (100 emails/day)
- **Total**: ~$20-30/month

---

## Next Steps:

Ready to implement? Switch to Code mode and I'll build:
1. Joey's voice prompt system
2. Automated follow-up scheduler
3. Email integration
4. Cron job for periodic check-ins

Just say: "Let's build it" and I'll get started!