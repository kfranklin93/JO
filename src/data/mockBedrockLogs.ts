/**
 * Mock Amazon Bedrock AI Conversation Logs
 *
 * Realistic luxury real estate client interactions with metadata.
 * Used by the AI Copilot Oversight Panel in the dashboard.
 */

export type ConfidenceTier = 'high' | 'review' | 'escalated';
export type SentimentLabel = 'Hot Lead' | 'Zoning Inquiry' | 'Schedule Request' | 'Financing' | 'General';

export interface BedrockSource {
  id: string;
  label: string;
  type: 'crm' | 'document' | 'calendar' | 'upload';
}

export interface BedrockMessage {
  role: 'client' | 'ai';
  content: string;
  timestamp: string;
  // AI message metadata (only on role === 'ai')
  meta?: {
    latencyMs: number;
    model: string;
    groundedness: number;      // 0-100
    tokenCount: number;
    sources: BedrockSource[];
    flagReason?: string;       // present when groundedness < 70
  };
}

export interface BedrockThread {
  id: string;
  clientName: string;
  propertyContext: string;
  propertyAddress: string;
  sentiment: SentimentLabel;
  confidenceTier: ConfidenceTier;
  latestConfidence: number;    // 0-100 — drives the tier badge
  aiPaused: boolean;
  createdAt: string;
  messages: BedrockMessage[];
}

// ─────────────────────────────────────────────────────────────────────────────

export const mockBedrockThreads: BedrockThread[] = [
  // ── Thread 1: Marcus Vance — High Confidence ─────────────────────────────
  {
    id: 'thread_001',
    clientName: 'Marcus Vance',
    propertyContext: 'Dunwoody Estate — $1.45M',
    propertyAddress: '420 Peachtree Dunwoody Rd, Dunwoody, GA 30338',
    sentiment: 'Hot Lead',
    confidenceTier: 'high',
    latestConfidence: 98,
    aiPaused: false,
    createdAt: '2025-07-28T14:22:00Z',
    messages: [
      {
        role: 'client',
        content:
          'Is the price negotiable on the Dunwoody estate, and what are the HOA fees?',
        timestamp: '2025-07-28T14:22:00Z',
      },
      {
        role: 'ai',
        content:
          "The property is currently listed at $1.45M. Per Joey's listing notes, seller financing options are open for qualified buyers. The HOA fee is $450/month, covering concierge, pool, and gate maintenance. Would you like me to schedule a private viewing with Joey this Thursday?",
        timestamp: '2025-07-28T14:22:00Z',
        meta: {
          latencyMs: 380,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 98,
          tokenCount: 312,
          sources: [
            { id: 'lofty-402', label: 'Lofty CRM Listing #402', type: 'crm' },
            { id: 'doc-seller-disc', label: 'Seller Disclosure PDF', type: 'document' },
          ],
        },
      },
      {
        role: 'client',
        content: "Thursday works. Can you also confirm if the pool is heated year-round?",
        timestamp: '2025-07-28T14:31:00Z',
      },
      {
        role: 'ai',
        content:
          "Great — I've penciled in Thursday at 2:00 PM and sent Joey a calendar notification. On the pool: yes, it's a heated saltwater pool with a heat pump, so it runs year-round. I'll include the full amenity sheet in the showing confirmation email.",
        timestamp: '2025-07-28T14:31:22Z',
        meta: {
          latencyMs: 290,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 97,
          tokenCount: 284,
          sources: [
            { id: 'lofty-402', label: 'Lofty CRM Listing #402', type: 'crm' },
          ],
        },
      },
    ],
  },

  // ── Thread 2: Elena Rostova — Needs Review ───────────────────────────────
  {
    id: 'thread_002',
    clientName: 'Elena Rostova',
    propertyContext: 'Decatur Compound — $2.1M',
    propertyAddress: '88 Sycamore Creek Ln, Decatur, GA 30030',
    sentiment: 'Zoning Inquiry',
    confidenceTier: 'review',
    latestConfidence: 68,
    aiPaused: false,
    createdAt: '2025-07-27T09:15:00Z',
    messages: [
      {
        role: 'client',
        content:
          "Can I add a guesthouse on the back half-acre of the property?",
        timestamp: '2025-07-27T09:15:00Z',
      },
      {
        role: 'ai',
        content:
          "Zoning in this precinct generally allows accessory dwelling units (ADUs), but specific set-back rules apply. I have flagged this for Joey to verify with DeKalb County planning before confirming.",
        timestamp: '2025-07-27T09:15:31Z',
        meta: {
          latencyMs: 510,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 68,
          tokenCount: 198,
          sources: [
            { id: 'zoning-dekalb', label: 'DeKalb County Zoning Code (2023)', type: 'document' },
          ],
          flagReason:
            'Ambiguous County Zoning — ADU set-back requirements vary by sub-district. Requires human verification.',
        },
      },
      {
        role: 'client',
        content: "Okay, when can Joey call me about this?",
        timestamp: '2025-07-27T09:22:00Z',
      },
      {
        role: 'ai',
        content:
          "I've escalated this thread to Joey with a priority flag. He'll reach out within 2 business hours. I've also attached the DeKalb ADU overview document to this conversation for reference.",
        timestamp: '2025-07-27T09:22:18Z',
        meta: {
          latencyMs: 420,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 91,
          tokenCount: 175,
          sources: [
            { id: 'calendar-joey', label: "Joey's Calendar API", type: 'calendar' },
          ],
        },
      },
    ],
  },

  // ── Thread 3: David & Sarah Chen — High Confidence ───────────────────────
  {
    id: 'thread_003',
    clientName: 'David & Sarah Chen',
    propertyContext: 'Buckhead Penthouse — $1.98M',
    propertyAddress: '3200 Peachtree Rd NE #2401, Atlanta, GA 30305',
    sentiment: 'Schedule Request',
    confidenceTier: 'high',
    latestConfidence: 94,
    aiPaused: false,
    createdAt: '2025-07-28T11:05:00Z',
    messages: [
      {
        role: 'client',
        content:
          "We're pre-approved for $2M with Chase. Can we see the listing tomorrow at 3 PM?",
        timestamp: '2025-07-28T11:05:00Z',
      },
      {
        role: 'ai',
        content:
          "Congratulations on the pre-approval! I have reserved a tentative slot for tomorrow at 3:00 PM and notified Joey. He will confirm the lockbox access shortly.",
        timestamp: '2025-07-28T11:05:15Z',
        meta: {
          latencyMs: 290,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 94,
          tokenCount: 241,
          sources: [
            { id: 'calendar-joey', label: "Joey's Calendar API", type: 'calendar' },
            { id: 'preapproval-upload', label: 'Pre-Approval Upload (Chase)', type: 'upload' },
          ],
        },
      },
      {
        role: 'client',
        content:
          "Perfect. Will parking be available? We're driving from Smyrna.",
        timestamp: '2025-07-28T11:09:00Z',
      },
      {
        role: 'ai',
        content:
          "Absolutely — the building has a dedicated visitor parking garage on the P1 level. I'll include access instructions in your confirmation. It's about a 22-minute drive from Smyrna via I-285 E. See you tomorrow!",
        timestamp: '2025-07-28T11:09:22Z',
        meta: {
          latencyMs: 310,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 95,
          tokenCount: 259,
          sources: [
            { id: 'lofty-888', label: 'Lofty CRM Listing #888', type: 'crm' },
          ],
        },
      },
    ],
  },

  // ── Thread 4: Priya Nair — Escalated ─────────────────────────────────────
  {
    id: 'thread_004',
    clientName: 'Priya Nair',
    propertyContext: 'East Cobb New Build — $875K',
    propertyAddress: '14 Whisper Falls Ct, Marietta, GA 30068',
    sentiment: 'Financing',
    confidenceTier: 'escalated',
    latestConfidence: 52,
    aiPaused: true,
    createdAt: '2025-07-26T16:40:00Z',
    messages: [
      {
        role: 'client',
        content:
          "I have an ITIN mortgage from a credit union in California. Will that be accepted by the seller?",
        timestamp: '2025-07-26T16:40:00Z',
      },
      {
        role: 'ai',
        content:
          "ITIN mortgages are a valid form of financing and are generally accepted in Georgia transactions. However, seller acceptance depends on specific contract terms. I've paused automated responses and escalated this to Joey immediately — ITIN financing has nuances that require his direct guidance.",
        timestamp: '2025-07-26T16:40:28Z',
        meta: {
          latencyMs: 605,
          model: 'Claude 3.5 Sonnet (Amazon Bedrock)',
          groundedness: 52,
          tokenCount: 312,
          sources: [
            { id: 'doc-ga-contract', label: 'GA Purchase Contract Template', type: 'document' },
          ],
          flagReason:
            'Low confidence on ITIN mortgage acceptance specifics. Seller terms and lender acceptance criteria are outside verified data sources. Escalated to agent.',
        },
      },
    ],
  },
];

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function getConfidenceColor(score: number): string {
  if (score >= 85) return '#16a34a';  // green-600
  if (score >= 70) return '#d97706';  // amber-600
  return '#dc2626';                   // red-600
}

export function getConfidenceBgClass(tier: ConfidenceTier): string {
  if (tier === 'high') return 'bg-emerald-100 text-emerald-800';
  if (tier === 'review') return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export function getTierLabel(tier: ConfidenceTier): string {
  if (tier === 'high') return 'High Confidence';
  if (tier === 'review') return 'Needs Review';
  return 'Escalated';
}

// Made with Bob
