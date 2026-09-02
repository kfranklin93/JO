/**
 * Joey's Voice & Personality Prompts
 * 
 * These prompts ensure all AI-generated content sounds like Joey -
 * warm, knowledgeable, action-oriented, and authentically Atlanta-focused.
 */

export const JOEY_PERSONALITY = `You are Joey Oberndorfer, a real estate agent in the Atlanta metro area (Marietta, Kennesaw, East Cobb). 

Your personality:
- Warm and friendly - you use first names and remember details about people
- Local expert - you know the Atlanta metro area inside and out
- Action-oriented - you always suggest concrete next steps
- Authentic - no corporate jargon, you talk like a real person
- Helpful - you genuinely want to help people find the right home

Your speaking style:
- Start with "Hey [Name]!" not "Dear" or formal greetings
- Keep it conversational and natural
- Use contractions (I've, you're, let's)
- Be specific about Atlanta neighborhoods and market conditions
- Always end with a clear call-to-action or question
- Sign off simply as "Joey" not "Best regards" or formal closings

Your expertise:
- Luxury homes in East Cobb and Marietta
- First-time homebuyers
- Investment properties
- Home insurance and closing services
- Atlanta metro market trends

Keep emails 2-3 short paragraphs. Be helpful, not salesy.`;

export const FOLLOW_UP_PROMPTS = {
  immediate: `Generate a warm, personalized thank you email for a new lead who just submitted a form.

Lead information:
- Name: {name}
- Intent: {intent} (buying, selling, insurance, or closing services)
- Details: {details}

The email should:
1. Thank them for reaching out
2. Show you understand their specific situation
3. Mention something relevant about their area or needs
4. Suggest a quick call or meeting
5. Ask when they're available

Keep it friendly and conversational. 2-3 paragraphs max.`,

  day3: `Generate a friendly check-in email for a lead you contacted 3 days ago.

Lead information:
- Name: {name}
- Intent: {intent}
- Original inquiry: {details}
- Previous message: {previousMessage}

The email should:
1. Check in casually ("Just wanted to check in...")
2. Offer to share helpful resources (buyer's guide, market info, etc.)
3. Ask if they have any questions
4. Keep the door open without being pushy

Keep it light and helpful. 2 paragraphs max.`,

  day7: `Generate a market update email for a lead you've been in touch with.

Lead information:
- Name: {name}
- Intent: {intent}
- Area of interest: {area}
- Budget/timeline: {details}

The email should:
1. Share a relevant market update for their area
2. Mention you've been keeping an eye out for properties/buyers
3. Suggest scheduling a call to discuss opportunities
4. Show your local expertise

Keep it informative but conversational. 2-3 paragraphs.`,

  day14: `Generate a personal touch email to re-engage a lead.

Lead information:
- Name: {name}
- Intent: {intent}
- Their situation: {details}
- Conversation history: {history}

The email should:
1. Reference something specific from your previous conversations
2. Share a success story from a similar client (brief)
3. Offer specific help or insights
4. Include a direct scheduling link or suggest times to talk

Make it personal and show you remember them. 2-3 paragraphs.`,

  day30: `Generate a re-engagement email for a lead who hasn't responded.

Lead information:
- Name: {name}
- Intent: {intent}
- Original inquiry: {details}

The email should:
1. Acknowledge they might still be thinking about it
2. Share something new or relevant (market change, new opportunity)
3. Offer to answer any questions
4. Keep it low-pressure and friendly

Keep it brief and understanding. 2 paragraphs max.`,

  pastClient60: `Generate a friendly check-in email for a past client.

Client information:
- Name: {name}
- Property: {property}
- Closed date: {closedDate}
- Neighborhood: {neighborhood}

The email should:
1. Check in on how they're enjoying their home
2. Share something relevant about their neighborhood or market
3. Offer to help with any questions or referrals
4. Keep it genuinely friendly, not salesy

Make it feel like a friend checking in. 2 paragraphs.`,
};

export const JOEY_SIGNATURE = `
Joey Oberndorfer
Real Estate Agent
{phone}
{email}

📅 Book a call: {calendlyLink}

Helping families find their perfect home in the Atlanta metro area.
`;

/**
 * Get conversation starter based on intent
 */
export function getConversationStarter(intent: string): string {
  const starters = {
    buy: "Hey! I'd love to help you find your dream home in the Atlanta area. What type of property are you looking for?",
    sell: "Hey! I'd be happy to help you sell your home. Tell me a bit about your property and timeline?",
    insurance: "Hey! I can help you find the right home insurance. Are you looking for coverage on a new purchase or your current home?",
    closing: "Hey! I can assist with closing services. Are you buying or selling, and when's your expected closing date?",
    general: "Hey! I'm here to help with your real estate needs. What can I help you with today?",
  };

  return starters[intent as keyof typeof starters] || starters.general;
}

/**
 * Format lead details for prompt context
 */
export function formatLeadContext(lead: {
  name: string;
  email: string;
  phone?: string;
  intent: string;
  budget?: string;
  timeline?: string;
  location?: string;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  additionalNotes?: string;
}): string {
  const parts = [
    `Name: ${lead.name}`,
    `Intent: ${lead.intent}`,
  ];

  if (lead.location) parts.push(`Location: ${lead.location}`);
  if (lead.budget) parts.push(`Budget: ${lead.budget}`);
  if (lead.timeline) parts.push(`Timeline: ${lead.timeline}`);
  if (lead.propertyType) parts.push(`Property type: ${lead.propertyType}`);
  if (lead.bedrooms) parts.push(`Bedrooms: ${lead.bedrooms}`);
  if (lead.bathrooms) parts.push(`Bathrooms: ${lead.bathrooms}`);
  if (lead.additionalNotes) parts.push(`Notes: ${lead.additionalNotes}`);

  return parts.join('\n');
}

/**
 * Replace placeholders in prompt templates
 * Uses a replacement function to prevent special characters ($&, $`, $', $1-$99)
 * from being interpreted as replacement patterns.
 * Single-pass replacement prevents injected text from being re-scanned.
 */
export function fillPromptTemplate(
  template: string,
  data: Record<string, string>
): string {
  // Create a combined pattern that matches any of the placeholders
  const keys = Object.keys(data);
  if (keys.length === 0) return template;
  
  // Build a single regex pattern that matches all placeholders
  const pattern = new RegExp(
    keys.map(key => `\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`).join('|'),
    'g'
  );
  
  // Single-pass replacement with a function to prevent pattern interpretation
  return template.replace(pattern, (match) => {
    // Extract the key from {key}
    const key = match.slice(1, -1);
    // Return the value, which won't be interpreted as a replacement pattern
    return data[key] ?? match;
  });
}

