# AWS Bedrock Implementation Checklist

Quick reference checklist for implementing AWS Bedrock AI features. See [`AWS_BEDROCK_INTEGRATION_GUIDE.md`](AWS_BEDROCK_INTEGRATION_GUIDE.md) for detailed instructions.

---

## Phase 1: AWS Setup (Day 1)

### AWS Account & Bedrock Access
- [ ] Create AWS account at https://aws.amazon.com
- [ ] Navigate to AWS Bedrock service
- [ ] Select region: `us-east-1` or `us-west-2`
- [ ] Request model access:
  - [ ] Anthropic Claude 3.5 Sonnet v2
  - [ ] Anthropic Claude 3 Haiku (optional)
- [ ] Wait for approval (usually 1-5 minutes)
- [ ] Verify "Access granted" status

### IAM User & Credentials
- [ ] Navigate to IAM service
- [ ] Create user: `joey-o-bedrock-app`
- [ ] Attach policy: `AmazonBedrockFullAccess`
- [ ] Create access keys
- [ ] Save credentials securely:
  - [ ] Access Key ID
  - [ ] Secret Access Key
  - [ ] Download CSV backup
- [ ] Store in password manager

---

## Phase 2: Local Development (Day 1-2)

### Install Dependencies
```bash
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers
npm install -D tsx  # For testing
```

### Environment Configuration
- [ ] Create/update `.env.local`:
  ```bash
  AWS_REGION=us-east-1
  AWS_ACCESS_KEY_ID=your_key_here
  AWS_SECRET_ACCESS_KEY=your_secret_here
  AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
  AWS_BEDROCK_MAX_TOKENS=2048
  AWS_BEDROCK_TEMPERATURE=0.7
  ```
- [ ] Update `.env.example` with template
- [ ] Verify `.gitignore` includes `.env.local`
- [ ] Update [`src/config/env.ts`](src/config/env.ts) with AWS variables

---

## Phase 3: Code Implementation (Day 2-3)

### Core Files to Create

#### 1. Bedrock Client Utility
- [ ] Create [`src/lib/api/bedrock.ts`](src/lib/api/bedrock.ts)
  - [ ] `sendBedrockMessage()` - Non-streaming
  - [ ] `streamBedrockMessage()` - Streaming generator
  - [ ] `testBedrockConnection()` - Connection test
  - [ ] Error handling and retry logic

#### 2. Prompt Templates
- [ ] Create [`src/lib/prompts/real-estate.ts`](src/lib/prompts/real-estate.ts)
  - [ ] `REAL_ESTATE_SYSTEM_PROMPT` - Main system prompt
  - [ ] `LEAD_QUALIFICATION_PROMPT` - Extract lead info
  - [ ] `FOLLOW_UP_EMAIL_PROMPT` - Generate follow-ups
  - [ ] `getConversationStarter()` - Intent-based greetings

#### 3. API Endpoints
- [ ] Update [`src/app/api/ai/chat/route.ts`](src/app/api/ai/chat/route.ts)
  - [ ] POST handler with streaming
  - [ ] Request validation
  - [ ] Conversation history management
  - [ ] Error handling
  
- [ ] Update [`src/app/api/ai/follow-up/route.ts`](src/app/api/ai/follow-up/route.ts)
  - [ ] POST handler for follow-up generation
  - [ ] Lead context processing
  - [ ] Email content generation

#### 4. AI Service Layer
- [ ] Create [`src/lib/services/ai-service.ts`](src/lib/services/ai-service.ts)
  - [ ] `qualifyLead()` - Extract lead information
  - [ ] `generatePropertyRecommendations()` - Suggest properties
  - [ ] `analyzeConversation()` - Sentiment analysis

---

## Phase 4: Testing (Day 3-4)

### Automated Tests
- [ ] Create [`scripts/test-bedrock.ts`](scripts/test-bedrock.ts)
- [ ] Add `test:bedrock` script to [`package.json`](package.json)
- [ ] Run connection test: `npm run test:bedrock`
- [ ] Verify all tests pass

### Manual Testing Scenarios
- [ ] Basic chat interaction
- [ ] Streaming response works
- [ ] Multi-turn conversation maintains context
- [ ] Lead qualification extracts correct data
- [ ] Follow-up emails are personalized
- [ ] Error handling (invalid credentials)
- [ ] Rate limiting (if implemented)
- [ ] Real estate context is appropriate

### Integration Testing
- [ ] Test with lead capture form
- [ ] Test with different intents (buy/sell/insurance/closing)
- [ ] Test conversation flow end-to-end
- [ ] Test follow-up generation workflow
- [ ] Verify data flows to Lofty CRM (if integrated)

---

## Phase 5: Production Deployment (Day 4-5)

### Vercel Configuration
- [ ] Add environment variables in Vercel dashboard:
  - [ ] Production environment
  - [ ] Preview environment
  - [ ] Development environment
- [ ] Deploy to staging first
- [ ] Test in staging environment
- [ ] Deploy to production

### Security Checklist
- [ ] AWS credentials stored securely (not in code)
- [ ] Environment variables configured in Vercel
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] CAPTCHA or honeypot for public chat
- [ ] Error messages don't expose sensitive info
- [ ] Logging configured (no credential logging)

### Monitoring Setup
- [ ] AWS CloudWatch alarms configured
- [ ] Billing alerts set up
- [ ] Cost tracking enabled
- [ ] Performance monitoring active
- [ ] Error tracking configured

---

## Phase 6: Optimization & Maintenance

### Cost Optimization
- [ ] Implement response caching
- [ ] Set appropriate token limits
- [ ] Use Haiku for simple queries
- [ ] Monitor usage patterns
- [ ] Optimize prompts based on data

### Performance Optimization
- [ ] Implement streaming for better UX
- [ ] Add request queuing if needed
- [ ] Optimize prompt length
- [ ] Cache common responses
- [ ] Monitor response times

### Documentation
- [ ] Document API endpoints
- [ ] Create usage examples
- [ ] Document prompt templates
- [ ] Add troubleshooting guide
- [ ] Document cost optimization strategies

---

## Quick Reference: File Structure

```
src/
├── app/
│   └── api/
│       └── ai/
│           ├── chat/
│           │   └── route.ts          ✅ Streaming chat endpoint
│           └── follow-up/
│               └── route.ts          ✅ Follow-up generation
├── lib/
│   ├── api/
│   │   └── bedrock.ts                ✅ Bedrock client utility
│   ├── prompts/
│   │   └── real-estate.ts            ✅ Prompt templates
│   └── services/
│       └── ai-service.ts             ✅ AI business logic
├── config/
│   └── env.ts                        ✅ Environment config
└── types/
    └── ai.ts                         ✅ AI type definitions

scripts/
└── test-bedrock.ts                   ✅ Testing script

.env.local                            ✅ Local environment vars
```

---

## Common Commands

```bash
# Install dependencies
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers

# Test Bedrock connection
npm run test:bedrock

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

---

## Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| AWS Setup | 1-2 hours | Account, Bedrock access, IAM user |
| Local Config | 1 hour | Dependencies, environment variables |
| Implementation | 4-6 hours | Core files, API endpoints, services |
| Testing | 2-3 hours | Automated and manual testing |
| Deployment | 1-2 hours | Vercel setup, production deploy |
| **Total** | **9-14 hours** | **Complete integration** |

---

## Success Criteria

✅ AWS Bedrock connection successful  
✅ AI chat responds appropriately to real estate queries  
✅ Streaming works smoothly  
✅ Conversation context maintained  
✅ Lead qualification extracts relevant data  
✅ Follow-up emails are personalized  
✅ All tests passing  
✅ Production deployment successful  
✅ Monitoring and alerts configured  
✅ Documentation complete  

---

## Support Resources

- **Detailed Guide**: [`AWS_BEDROCK_INTEGRATION_GUIDE.md`](AWS_BEDROCK_INTEGRATION_GUIDE.md)
- **Architecture**: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- **Development Roadmap**: [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md)
- **AWS Bedrock Docs**: https://docs.aws.amazon.com/bedrock/
- **Anthropic Claude Docs**: https://docs.anthropic.com/claude/

---

## Next Steps After Integration

1. Integrate with Lofty CRM for lead sync
2. Add analytics tracking for AI interactions
3. Implement A/B testing for prompts
4. Create admin dashboard for monitoring
5. Add conversation export functionality
6. Implement multi-language support
7. Create custom training data pipeline

---

**Quick Start**: Follow Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 in order. Don't skip testing!