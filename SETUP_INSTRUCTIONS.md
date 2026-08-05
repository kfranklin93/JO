# Joey's AI Follow-up System - Setup Instructions

Quick setup guide to get the automated follow-up system running.

---

## Step 1: Install Dependencies

Run this command to install all required packages:

```bash
npm install @aws-sdk/client-bedrock-runtime resend
```

---

## Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Fill in your credentials in `.env.local`:

```bash
# AWS Bedrock (from AWS Console)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_actual_access_key
AWS_SECRET_ACCESS_KEY=your_actual_secret_key

# Email (from Resend.com)
RESEND_API_KEY=re_your_actual_key
JOEY_EMAIL=joey@yourdomain.com
JOEY_PHONE=(770) 555-0100

# Optional: Cron security
CRON_SECRET=generate_random_string_here
```

---

## Step 3: Test the Setup

Run the development server:
```bash
npm run dev
```

Test the lead submission endpoint:
```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "intent": "buy",
    "location": "Marietta",
    "budget": "$400,000"
  }'
```

You should receive an immediate follow-up email!

---

## Step 4: Deploy to Vercel

1. Push your code to GitHub
2. Connect your repo to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

The cron job will automatically run daily at 9 AM to send scheduled follow-ups.

---

## What You Get:

✅ **Immediate Response**: New leads get a personalized email within seconds  
✅ **Automated Follow-ups**: Day 3, 7, 14, 30 check-ins  
✅ **Joey's Voice**: All emails sound like Joey  
✅ **Past Client Check-ins**: Every 60 days for referrals  

---

## Need Help?

See [`JOEY_AI_SETUP.md`](JOEY_AI_SETUP.md) for detailed AWS and email setup instructions.