import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { env } from '@/config/env';

// Initialize Bedrock client
let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    const config: any = {
      region: env.AWS_REGION,
    };
    
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      };
    }
    
    bedrockClient = new BedrockRuntimeClient(config);
  }
  return bedrockClient;
}

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockChatOptions {
  messages: BedrockMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Send a message to AWS Bedrock and get a response
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
    const client = getBedrockClient();
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error('Bedrock API Error:', error);
    throw new Error('Failed to get AI response');
  }
}

/**
 * Generate an email using Joey's voice
 */
export async function generateJoeyEmail(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  return sendBedrockMessage({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 1000,
    temperature: 0.7,
  });
}

/**
 * Test Bedrock connection
 */
export async function testBedrockConnection(): Promise<boolean> {
  try {
    const response = await sendBedrockMessage({
      messages: [{ role: 'user', content: 'Respond with OK' }],
      maxTokens: 10,
    });
    return response.toLowerCase().includes('ok');
  } catch (error) {
    console.error('Bedrock connection test failed:', error);
    return false;
  }
}

// Made with Bob
