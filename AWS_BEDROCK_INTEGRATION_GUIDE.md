# AWS Bedrock Integration Guide
## Complete Setup for Joey O. Real Estate Platform

This guide provides step-by-step instructions for integrating AWS Bedrock AI capabilities into your Next.js real estate platform, from AWS account creation through production deployment.

---

## Table of Contents

1. [AWS Account & Bedrock Setup](#phase-1-aws-account--bedrock-setup)
2. [Local Development Configuration](#phase-2-local-development-configuration)
3. [Code Implementation](#phase-3-code-implementation)
4. [Testing & Validation](#phase-4-testing--validation)
5. [Production Deployment](#phase-5-production-deployment)
6. [Cost Optimization](#cost-optimization)
7. [Troubleshooting](#troubleshooting)

---

## Phase 1: AWS Account & Bedrock Setup

### Step 1.1: Create AWS Account (15 minutes)

1. **Sign Up**
   - Go to https://aws.amazon.com
   - Click "Create an AWS Account"
   - Provide email address and choose account name: `joey-o-real-estate`
   - Create strong password

2. **Account Information**
   - Select "Business" account type
   - Enter business contact information
   - Provide payment method (credit card required, but free tier available)

3. **Verification**
   - Complete phone verification
   - Choose "Basic Support" plan (free)
   - Wait for account activation email (usually instant)

### Step 1.2: Enable AWS Bedrock Access (10 minutes)

1. **Navigate to Bedrock**
   - Sign in to AWS Console: https://console.aws.amazon.com
   - In the search bar, type "Bedrock"
   - Click "Amazon Bedrock" service

2. **Select Region**
   - Choose region from top-right dropdown
   - **Recommended**: `us-east-1` (N. Virginia) or `us-west-2` (Oregon)
   - Note: Bedrock availability varies by region

3. **Request Model Access**
   - Click "Model access" in left sidebar
   - Click "Manage model access" button
   - Enable these models:
     - ✅ **Anthropic Claude 3.5 Sonnet v2** (Primary - best for conversations)
     - ✅ **Anthropic Claude 3 Haiku** (Optional - faster/cheaper for simple tasks)
   - Click "Request model access"
   - Wait for approval (usually 1-5 minutes)

4. **Verify Access**
   - Refresh the page
   - Status should show "Access granted" with green checkmark

**Model IDs to Use**:
```
Primary: anthropic.claude-3-5-sonnet-20241022-v2:0
Backup: anthropic.claude-3-haiku-20240307-v1:0
```

### Step 1.3: Create IAM User with Bedrock Permissions (15 minutes)

1. **Navigate to IAM**
   - Search for "IAM" in AWS Console
   - Click "Identity and Access Management"

2. **Create User**
   - Click "Users" in left sidebar
   - Click "Create user" button
   - Username: `joey-o-bedrock-app`
   - **DO NOT** select "Provide user access to AWS Management Console"
   - Click "Next"

3. **Attach Permissions**
   - Select "Attach policies directly"
   - Search and select: `AmazonBedrockFullAccess`
   - Click "Next"
   - Review and click "Create user"

4. **Create Access Keys**
   - Click on the newly created user
   - Go to "Security credentials" tab
   - Scroll to "Access keys" section
   - Click "Create access key"
   - Select use case: "Application running outside AWS"
   - Click "Next"
   - Add description: "Joey O Real Estate Next.js App"
   - Click "Create access key"

5. **Save Credentials** ⚠️ CRITICAL
   - **Access Key ID**: Copy and save securely
   - **Secret Access Key**: Copy and save securely (shown only once!)
   - Download CSV file as backup
   - Store in password manager (1Password, LastPass, etc.)
   - **NEVER commit these to Git**

---

## Phase 2: Local Development Configuration

### Step 2.1: Install AWS SDK Dependencies

```bash
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers
```

**Package Purposes**:
- `@aws-sdk/client-bedrock-runtime`: Core Bedrock API client
- `@aws-sdk/credential-providers`: Secure credential management

### Step 2.2: Configure Environment Variables

1. **Create `.env.local` file** (if not exists):

```bash
# .env.local

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Bedrock Configuration
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_MAX_TOKENS=2048
AWS_BEDROCK_TEMPERATURE=0.7

# Application URLs
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

2. **Update `.env.example`** for team reference:

```bash
# .env.example

# AWS Configuration (Required for AI features)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Bedrock Configuration
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_MAX_TOKENS=2048
AWS_BEDROCK_TEMPERATURE=0.7
```

3. **Verify `.gitignore` includes**:

```
.env.local
.env*.local
```

### Step 2.3: Update Environment Configuration

Update `src/config/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Existing variables
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('Joey O. Real Estate'),
  
  // AWS Bedrock Configuration
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_BEDROCK_MODEL_ID: z.string().default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
  AWS_BEDROCK_MAX_TOKENS: z.coerce.number().default(2048),
  AWS_BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.7),
  
  // Existing Lofty CRM config
  LOFTY_API_BASE_URL: z.string().optional(),
  LOFTY_API_KEY: z.string().optional(),
  ANALYTICS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  AWS_REGION: process.env.AWS_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_BEDROCK_MODEL_ID: process.env.AWS_BEDROCK_MODEL_ID,
  AWS_BEDROCK_MAX_TOKENS: process.env.AWS_BEDROCK_MAX_TOKENS,
  AWS_BEDROCK_TEMPERATURE: process.env.AWS_BEDROCK_TEMPERATURE,
  LOFTY_API_BASE_URL: process.env.LOFTY_API_BASE_URL,
  LOFTY_API_KEY: process.env.LOFTY_API_KEY,
  ANALYTICS_API_KEY: process.env.ANALYTICS_API_KEY,
});
```

---

## Phase 3: Code Implementation

### Step 3.1: Create Bedrock Client Utility

Create `src/lib/api/bedrock.ts`:

```typescript
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { env } from '@/config/env';

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockChatOptions {
  messages: BedrockMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Send a chat message to Bedrock (non-streaming)
 */
export async function sendBedrockMessage(
  options: BedrockChatOptions
): Promise<string> {
  const {
    messages,
    systemPrompt,
    maxTokens = env.AWS_BEDROCK_MAX_TOKENS,
    temperature = env.AWS_BEDROCK_TEMPERATURE,
  } = options;

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  const command = new InvokeModelCommand({
    modelId: env.AWS_BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  try {
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error('Bedrock API Error:', error);
    throw new Error('Failed to get AI response');
  }
}

/**
 * Send a chat message to Bedrock with streaming response
 */
export async function* streamBedrockMessage(
  options: BedrockChatOptions
): AsyncGenerator<string> {
  const {
    messages,
    systemPrompt,
    maxTokens = env.AWS_BEDROCK_MAX_TOKENS,
    temperature = env.AWS_BEDROCK_TEMPERATURE,
  } = options;

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: env.AWS_BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  try {
    const response = await bedrockClient.send(command);

    if (!response.body) {
      throw new Error('No response body from Bedrock');
    }

    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        
        if (chunk.type === 'content_block_delta') {
          yield chunk.delta.text;
        }
      }
    }
  } catch (error) {
    console.error('Bedrock Streaming Error:', error);
    throw new Error('Failed to stream AI response');
  }
}

/**
 * Test Bedrock connection
 */
export async function testBedrockConnection(): Promise<boolean> {
  try {
    const response = await sendBedrockMessage({
      messages: [{ role: 'user', content: 'Hello, respond with OK' }],
      maxTokens: 10,
    });
    return response.toLowerCase().includes('ok');
  } catch (error) {
    console.error('Bedrock connection test failed:', error);
    return false;
  }
}
```

### Step 3.2: Create Real Estate Prompt Templates

Create `src/lib/prompts/real-estate.ts`:

```typescript
export const REAL_ESTATE_SYSTEM_PROMPT = `You are an expert real estate assistant for Joey Oberndorfer, a luxury real estate agent in the Atlanta metro area. Your role is to:

1. Qualify leads by understanding their needs, budget, timeline, and preferences
2. Provide helpful information about the home buying/selling process
3. Answer questions about neighborhoods, market conditions, and property values
4. Schedule consultations and property viewings
5. Be professional, friendly, and knowledgeable

Key Information:
- Agent: Joey Oberndorfer
- Location: Atlanta Metro Area (Marietta, Kennesaw, East Cobb)
- Specialties: Luxury homes, first-time buyers, investment properties
- Services: Home buying, home selling, home insurance, closing services

Guidelines:
- Always be helpful and professional
- Ask clarifying questions to understand needs
- Provide specific, actionable advice
- Encourage scheduling a consultation for detailed discussions
- Never make up property listings or specific prices
- If you don't know something, admit it and offer to have Joey follow up

Keep responses concise and conversational (2-3 paragraphs max).`;

export const LEAD_QUALIFICATION_PROMPT = `Based on the conversation, extract the following lead information:

1. Intent: buying, selling, insurance, or closing services
2. Timeline: immediate (0-3 months), near-term (3-6 months), or long-term (6+ months)
3. Budget range: if mentioned
4. Property type: single-family, condo, townhouse, etc.
5. Location preferences: specific neighborhoods or areas
6. Key requirements: bedrooms, bathrooms, features
7. Current situation: first-time buyer, relocating, upgrading, downsizing, etc.

Format as JSON with these fields. Only include fields that were explicitly mentioned.`;

export const FOLLOW_UP_EMAIL_PROMPT = `Generate a personalized follow-up email for this lead based on the conversation history.

The email should:
1. Reference specific details from the conversation
2. Provide relevant next steps or resources
3. Include a clear call-to-action (schedule consultation, view properties, etc.)
4. Be warm and professional
5. Be 3-4 paragraphs maximum

Sign the email as:
Joey Oberndorfer
Real Estate Agent
[Contact information will be added automatically]`;

export function getConversationStarter(intent: string): string {
  const starters = {
    buy: "Hi! I'm here to help you find your dream home in the Atlanta area. What type of property are you looking for?",
    sell: "Hello! I'd be happy to help you sell your home. Can you tell me a bit about your property and your timeline?",
    insurance: "Hi! I can help you find the right home insurance. Are you looking for coverage on a new purchase or your current home?",
    closing: "Hello! I can assist with closing services. Are you buying or selling, and when is your expected closing date?",
    general: "Hi! I'm Joey's AI assistant. How can I help you with your real estate needs today?",
  };

  return starters[intent as keyof typeof starters] || starters.general;
}
```

### Step 3.3: Implement AI Chat API Endpoint

Update `src/app/api/ai/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { streamBedrockMessage } from '@/lib/api/bedrock';
import { REAL_ESTATE_SYSTEM_PROMPT } from '@/lib/prompts/real-estate';
import type { AIChatRequest } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body: AIChatRequest = await request.json();
    const { message, context } = body;

    // Validate request
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Build conversation history
    const messages = [
      ...(context?.conversationHistory || []).map((msg) => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamBedrockMessage({
            messages,
            systemPrompt: REAL_ESTATE_SYSTEM_PROMPT,
          })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
```

### Step 3.4: Implement AI Follow-up API Endpoint

Update `src/app/api/ai/follow-up/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sendBedrockMessage } from '@/lib/api/bedrock';
import { FOLLOW_UP_EMAIL_PROMPT, REAL_ESTATE_SYSTEM_PROMPT } from '@/lib/prompts/real-estate';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, conversationHistory, intent } = body;

    // Validate request
    if (!leadId || !conversationHistory) {
      return NextResponse.json(
        { error: 'Lead ID and conversation history are required' },
        { status: 400 }
      );
    }

    // Build context for follow-up email
    const conversationSummary = conversationHistory
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const prompt = `${FOLLOW_UP_EMAIL_PROMPT}\n\nConversation:\n${conversationSummary}\n\nIntent: ${intent}`;

    // Generate follow-up email
    const emailContent = await sendBedrockMessage({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: REAL_ESTATE_SYSTEM_PROMPT,
      maxTokens: 1000,
    });

    return NextResponse.json({
      leadId,
      emailContent,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Follow-up Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate follow-up' },
      { status: 500 }
    );
  }
}
```

### Step 3.5: Create AI Service Layer

Create `src/lib/services/ai-service.ts`:

```typescript
import { sendBedrockMessage } from '@/lib/api/bedrock';
import { LEAD_QUALIFICATION_PROMPT, REAL_ESTATE_SYSTEM_PROMPT } from '@/lib/prompts/real-estate';
import type { AIMessage, AIConversationContext } from '@/types/ai';

export class AIService {
  /**
   * Qualify a lead based on conversation history
   */
  static async qualifyLead(
    conversationHistory: AIMessage[]
  ): Promise<Record<string, any>> {
    const conversationText = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const prompt = `${LEAD_QUALIFICATION_PROMPT}\n\nConversation:\n${conversationText}`;

    try {
      const response = await sendBedrockMessage({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: REAL_ESTATE_SYSTEM_PROMPT,
        maxTokens: 500,
        temperature: 0.3, // Lower temperature for more consistent JSON
      });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {};
    } catch (error) {
      console.error('Lead qualification error:', error);
      return {};
    }
  }

  /**
   * Generate property recommendations based on lead preferences
   */
  static async generatePropertyRecommendations(
    context: AIConversationContext
  ): Promise<string[]> {
    const prompt = `Based on this lead's preferences, suggest 3-5 specific property search criteria or neighborhood recommendations in the Atlanta metro area.

Lead Intent: ${context.intent}
Conversation: ${context.conversationHistory.map((m) => m.content).join(' ')}

Provide specific, actionable recommendations.`;

    try {
      const response = await sendBedrockMessage({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: REAL_ESTATE_SYSTEM_PROMPT,
        maxTokens: 500,
      });

      // Parse recommendations from response
      return response
        .split('\n')
        .filter((line) => line.trim().match(/^[\d\-\*]/))
        .map((line) => line.replace(/^[\d\-\*\.\)]\s*/, '').trim())
        .filter(Boolean);
    } catch (error) {
      console.error('Recommendation generation error:', error);
      return [];
    }
  }

  /**
   * Analyze conversation sentiment and engagement level
   */
  static async analyzeConversation(
    conversationHistory: AIMessage[]
  ): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    engagementLevel: 'high' | 'medium' | 'low';
    readyToConvert: boolean;
  }> {
    const conversationText = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const prompt = `Analyze this conversation and provide:
1. Sentiment: positive, neutral, or negative
2. Engagement level: high, medium, or low
3. Ready to convert: true or false (are they ready to schedule a consultation?)

Conversation:
${conversationText}

Respond in JSON format with keys: sentiment, engagementLevel, readyToConvert`;

    try {
      const response = await sendBedrockMessage({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: REAL_ESTATE_SYSTEM_PROMPT,
        maxTokens: 200,
        temperature: 0.3,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        sentiment: 'neutral',
        engagementLevel: 'medium',
        readyToConvert: false,
      };
    } catch (error) {
      console.error('Conversation analysis error:', error);
      return {
        sentiment: 'neutral',
        engagementLevel: 'medium',
        readyToConvert: false,
      };
    }
  }
}
```

---

## Phase 4: Testing & Validation

### Step 4.1: Create Test Script

Create `scripts/test-bedrock.ts`:

```typescript
import { testBedrockConnection, sendBedrockMessage } from '../src/lib/api/bedrock';

async function testBedrock() {
  console.log('🧪 Testing AWS Bedrock Connection...\n');

  // Test 1: Connection
  console.log('Test 1: Connection Test');
  const isConnected = await testBedrockConnection();
  console.log(isConnected ? '✅ Connected successfully' : '❌ Connection failed');
  console.log('');

  if (!isConnected) {
    console.error('Cannot proceed with tests - connection failed');
    process.exit(1);
  }

  // Test 2: Simple Message
  console.log('Test 2: Simple Message');
  try {
    const response = await sendBedrockMessage({
      messages: [
        { role: 'user', content: 'What services does Joey Oberndorfer offer?' },
      ],
      maxTokens: 200,
    });
    console.log('✅ Response received:');
    console.log(response);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  console.log('');

  // Test 3: Conversation Context
  console.log('Test 3: Multi-turn Conversation');
  try {
    const response = await sendBedrockMessage({
      messages: [
        { role: 'user', content: "I'm looking to buy a home in Marietta" },
        {
          role: 'assistant',
          content: "Great! I'd be happy to help you find a home in Marietta. What's your budget range?",
        },
        { role: 'user', content: 'Around $500,000' },
      ],
      maxTokens: 300,
    });
    console.log('✅ Response received:');
    console.log(response);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  console.log('\n✅ All tests completed!');
}

testBedrock().catch(console.error);
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:bedrock": "tsx scripts/test-bedrock.ts"
  }
}
```

Install tsx: `npm install -D tsx`

Run test: `npm run test:bedrock`

### Step 4.2: Manual Testing Checklist

Test these scenarios in your application:

- [ ] AI chat responds to basic questions
- [ ] Streaming works correctly (text appears gradually)
- [ ] Conversation context is maintained across messages
- [ ] Lead qualification extracts correct information
- [ ] Follow-up emails are personalized and relevant
- [ ] Error handling works (test with invalid credentials)
- [ ] Rate limiting prevents abuse
- [ ] Responses are appropriate for real estate context

---

## Phase 5: Production Deployment

### Step 5.1: Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add these variables for **Production**, **Preview**, and **Development**:

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_production_key
AWS_SECRET_ACCESS_KEY=your_production_secret
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_MAX_TOKENS=2048
AWS_BEDROCK_TEMPERATURE=0.7
```

### Step 5.2: Security Best Practices

1. **Rotate Credentials Regularly**
   - Set calendar reminder to rotate AWS keys every 90 days
   - Create new IAM user, update env vars, delete old user

2. **Monitor Usage**
   - Set up AWS CloudWatch alarms for unusual activity
   - Monitor Bedrock costs in AWS Cost Explorer
   - Set billing alerts

3. **Rate Limiting**
   - Implement rate limiting on API routes
   - Consider using Vercel Edge Config for rate limit storage

4. **Input Validation**
   - Always validate and sanitize user input
   - Limit message length (e.g., 1000 characters)
   - Implement CAPTCHA for public-facing chat

---

## Cost Optimization

### Bedrock Pricing (as of 2024)

**Claude 3.5 Sonnet v2**:
- Input: $3.00 per million tokens (~750,000 words)
- Output: $15.00 per million tokens (~750,000 words)

**Estimated Monthly Costs**:
- 100 conversations/day × 30 days = 3,000 conversations
- Average 10 messages per conversation = 30,000 messages
- Average 200 tokens per message = 6M tokens
- **Estimated cost: $18-30/month**

### Cost Reduction Strategies

1. **Use Claude 3 Haiku for Simple Tasks**
   - 5x cheaper than Sonnet
   - Good for follow-up emails, simple questions

2. **Implement Caching**
   - Cache common questions and responses
   - Use Redis or Vercel KV for response caching

3. **Set Token Limits**
   - Limit max_tokens to prevent runaway costs
   - Use shorter system prompts

4. **Monitor and Alert**
   - Set AWS budget alerts
   - Track cost per conversation
   - Optimize prompts based on usage patterns

---

## Troubleshooting

### Common Issues

**Issue**: "Access Denied" error
- **Solution**: Verify IAM user has `AmazonBedrockFullAccess` policy
- Check that model access is granted in Bedrock console

**Issue**: "Model not found" error
- **Solution**: Verify model ID is correct for your region
- Check that you requested access to the specific model

**Issue**: Slow responses
- **Solution**: Use streaming for better UX
- Consider using Claude 3 Haiku for faster responses
- Check network latency to AWS region

**Issue**: High costs
- **Solution**: Implement response caching
- Use shorter max_tokens limits
- Switch to Haiku for simple queries

**Issue**: Rate limiting errors
- **Solution**: Implement exponential backoff
- Add request queuing
- Consider upgrading AWS service quotas

---

## Next Steps

After completing this integration:

1. ✅ Test thoroughly in development
2. ✅ Deploy to staging environment
3. ✅ Conduct user acceptance testing
4. ✅ Monitor costs and performance
5. ✅ Gather user feedback
6. ✅ Iterate on prompts and responses
7. ✅ Document any custom modifications

---

## Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Anthropic Claude API Reference](https://docs.anthropic.com/claude/reference)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

## Support

For issues or questions:
1. Check AWS Bedrock service health status
2. Review CloudWatch logs for errors
3. Test with AWS CLI to isolate issues
4. Contact AWS Support if needed

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-10  
**Maintained By**: Development Team