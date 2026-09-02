import twilio from 'twilio';
import { env } from '@/config/env';

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!twilioClient && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  if (!twilioClient) {
    throw new Error('Twilio not configured');
  }
  return twilioClient;
}

/**
 * Send SMS message
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    const client = getTwilioClient();
    
    if (!env.TWILIO_PHONE_NUMBER) {
      throw new Error('Twilio phone number not configured');
    }
    
    await client.messages.create({
      body: message,
      from: env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    console.log(`SMS sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return false;
  }
}

/**
 * Send SMS alert to Joey
 */
export async function sendSMSAlert(
  subject: string,
  message: string
): Promise<boolean> {
  const fullMessage = `${subject}\n\n${message}`;
  return sendSMS(env.JOEY_PHONE, fullMessage);
}

/**
 * Send SMS with calendar booking link
 */
export async function sendSMSWithBooking(
  to: string,
  message: string
): Promise<boolean> {
  const bookingLink = env.CALENDLY_LINK || 'https://calendly.com/joey';
  const fullMessage = `${message}\n\n📅 Book a call: ${bookingLink}`;
  return sendSMS(to, fullMessage);
}

