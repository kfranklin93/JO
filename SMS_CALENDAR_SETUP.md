# SMS & Calendar Setup Guide

Quick setup for SMS conversations, calendar booking, and SMS alerts.

---

## 1. Twilio SMS Setup (15 min)

### Sign Up
1. Go to https://www.twilio.com/try-twilio
2. Sign up for free account ($15 credit)
3. Verify your phone number

### Get Credentials
1. Go to Console Dashboard
2. Copy **Account SID**
3. Copy **Auth Token**
4. Click "Get a Trial Number" → Copy phone number

### Configure Webhook
1. Go to Phone Numbers → Manage → Active Numbers
2. Click your phone number
3. Under "Messaging", set webhook URL:
   ```
   https://yourdomain.com/api/sms/webhook
   ```
4. Method: POST
5. Save

### Add to `.env.local`
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+17705551234
```

**Cost**: ~$1/month for phone number + $0.0075 per SMS

---

## 2. Calendar Booking Setup (5 min)

### Option A: Calendly (Easiest)
1. Sign up at https://calendly.com
2. Create event type: "15-Minute Call with Joey"
3. Copy your Calendly link
4. Add to `.env.local`:
   ```bash
   CALENDLY_LINK=https://calendly.com/joey/15min
   ```

**Cost**: Free (or $10/month for Pro)

### Option B: Cal.com (Free, Open Source)
1. Sign up at https://cal.com
2. Create event type
3. Copy booking link
4. Add to `.env.local`

**Cost**: Free

---

## 3. Test Everything

### Test SMS Conversations
```bash
# Text Joey's Twilio number
# AI should respond automatically
```

### Test SMS Alerts
```bash
# Submit a test lead on website
# Joey should get SMS alert
```

### Test Calendar Booking
```bash
# Check follow-up emails
# Should have "📅 Book a call" link
```

---

## What's Now Working

### ✅ SMS Conversations
- Clients text Joey's number
- AI responds instantly in Joey's voice
- Full conversation tracking

### ✅ Calendar Booking
- Every email has booking link
- One-click scheduling
- Auto-reminders

### ✅ SMS Alerts
- Joey gets SMS for new leads
- Instant notifications
- Never miss a hot lead

---

## Total Monthly Cost

| Service | Cost |
|---------|------|
| Twilio SMS | $1 + $0.0075/SMS (~$50-100 total) |
| Calendly | $0-10 |
| **Total** | **$50-110/month** |

**ROI**: One extra deal = $10,000+ commission

---

## Next: Deploy to Production

1. Add all env variables to Vercel
2. Deploy
3. Update Twilio webhook URL to production domain
4. Test with real phone number
5. Start converting leads!