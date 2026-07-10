import { NextRequest, NextResponse } from 'next/server';
import { generateJoeyEmail } from '@/lib/api/bedrock';
import { JOEY_PERSONALITY } from '@/lib/prompts/joey-voice';
import { sendSMS } from '@/lib/services/sms-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const messageId = formData.get('MessageSid') as string;

    console.log(`SMS received from ${from}: ${body}`);

    // TODO: Fetch conversation history from database
    const conversationHistory: string[] = [];

    // Build context for AI
    const context = conversationHistory.length > 0
      ? `Previous conversation:\n${conversationHistory.join('\n')}\n\n`
      : '';

    const prompt = `${context}Client just texted: "${body}"\n\nRespond as Joey in a brief, friendly text message (2-3 sentences max). Keep it conversational and helpful.`;

    // Generate AI response
    const aiResponse = await generateJoeyEmail(prompt, JOEY_PERSONALITY);

    // Send SMS response
    await sendSMS(from, aiResponse);

    // TODO: Save conversation to database
    // await saveConversation({ from, body, response: aiResponse, messageId });

    // Respond to Twilio webhook
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    console.error('SMS webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process SMS' },
      { status: 500 }
    );
  }
}

// Made with Bob
