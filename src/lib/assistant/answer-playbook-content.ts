/**
 * Answer Playbook content — the answers themselves.
 *
 * Prose lives here so Joey can edit it without reading the matcher, the same
 * split as src/lib/services/follow-up-content.ts. See ./answer-playbook.ts for
 * how an entry is selected and how the hard-rule guard treats a bad edit.
 *
 * ## Editing an entry
 *
 * - `keywords` are phrases a real person would type. Each matched phrase scores
 *   its word count, and an entry needs 2 to fire, so a one-word keyword never
 *   triggers the entry by itself. Put the term in `strongKeywords` instead when
 *   one word really is decisive.
 * - `answer` must quote no dollar figure, no percentage, and promise no outcome.
 *   The loader silently withholds any entry that does, so a violation costs you
 *   this answer rather than producing one Joey would not stand behind.
 * - Order matters only for ties: when two entries score the same, the earlier
 *   one wins.
 *
 * ## Approving an entry
 *
 * Every entry below ships as `PENDING_APPROVAL` — drafted to be safe and in
 * Joey's register, but not yet confirmed by him. To approve, replace the marker
 * with a name and date:
 *
 *     approval: 'Joey Oberndorfer 2026-10-01',
 *
 * Pending entries are still served. What Joey's review adds is voice and factual
 * accuracy, neither of which the guard can check for him.
 *
 * ## Facts referenced here
 *
 * Service area and intent vocabulary are kept consistent with
 * src/lib/services/follow-up-content.ts ('the Atlanta metro', and the six
 * LEAD_INTENTS: buy / sell / invest / insurance / closing / general).
 */

import { PENDING_APPROVAL, type PlaybookEntry } from './answer-playbook';

export const ANSWER_PLAYBOOK: readonly PlaybookEntry[] = [
  {
    id: 'am-i-talking-to-a-bot',
    question: 'Am I talking to a real person? Are you Joey?',
    keywords: [
      'are you a bot',
      'are you ai',
      'are you an ai',
      'is this a bot',
      'is this automated',
      'are you a real person',
      'are you a human',
      'am i talking to a robot',
      'am i talking to a person',
      'are you joey',
      'is this joey',
    ],
    strongKeywords: ['chatbot'],
    answer: `I'm the AI assistant on Joey's team, not Joey himself — I'd rather be straight with you about that up front. I can answer questions about how he works, and I'll make sure your details get to him. Anything that needs his actual judgment goes to him personally. What can I help you with?`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'commission-and-fees',
    question: 'What do you charge? What is your commission?',
    keywords: [
      'your commission',
      'the commission',
      'what commission',
      'percent commission',
      'commission rate',
      'how much commission',
      'commission do you charge',
      'do you charge',
      'what do you charge',
      'how much do you charge',
      'what does it cost to work with',
      'your fee',
      'your fees',
      'agent fees',
      'realtor fees',
      'how much is your',
    ],
    answer: `There isn't a flat published rate, and I'd be doing you a disservice if I made one up — what makes sense depends on the property and on what you actually need from Joey. He'd rather walk you through it honestly than hand you a number that turns out not to apply to your situation. Give me your name and the best email for you and I'll get that conversation set up.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'home-valuation',
    question: "What's my house worth?",
    keywords: [
      'what is my house worth',
      'my house worth',
      'my home worth',
      'how much is my house',
      'how much is my home',
      'what could i sell for',
      'what would my house list for',
      'home value',
      'value my home',
    ],
    strongKeywords: ['valuation', 'appraisal'],
    answer: `That's a question Joey likes to answer properly rather than quickly. The online estimates miss the things that actually move the number — condition, what you've updated, and what's been happening on your particular street. He'll put together a real figure based on your actual place. If you share your name, email and the neighborhood or address, I'll get him started on it.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'pre-approval-first',
    question: 'Do I need to be pre-approved before I start looking?',
    keywords: [
      'pre approved',
      'pre approval',
      'get approved',
      'need a lender',
      'talk to a lender',
      'find a lender',
      'mortgage first',
      'loan first',
      'do i need financing',
    ],
    strongKeywords: ['preapproval', 'preapproved'],
    answer: `You don't need it to start a conversation with Joey, but you'll want it before you make an offer — sellers here take a pre-approved buyer a good deal more seriously. Plenty of people talk to Joey first and sort the lender piece out after, and he can point you toward lenders he's worked with directly. Want me to set that up? I just need your name and email.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'first-time-buyer',
    question: "I've never bought a house before. Where do I start?",
    keywords: [
      'first time buyer',
      'first time home buyer',
      'first time buying',
      'never bought a house',
      'never bought a home',
      'my first house',
      'my first home',
      'where do i start',
      'where to start',
      'new to this',
      'no idea what im doing',
    ],
    answer: `Right about where you are, honestly. Most of Joey's clients start with a conversation and a long list of questions — that's the point of it, not a sign you're behind. He'll lay out the whole sequence so nothing catches you off guard later, and there's no expectation that you're ready to buy anything. What's the best email for you? I'll get you some time with him.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'how-long-to-sell',
    question: 'How long will it take to sell my house?',
    keywords: [
      'how long to sell',
      'how long does it take to sell',
      'how long will it take to sell',
      'how fast can you sell',
      'how quickly can i sell',
      'time to sell',
      'days on market',
    ],
    answer: `It depends a lot on the neighborhood and on how the place shows, so I won't guess at it for you. Joey watches the Atlanta metro closely and can tell you what's actually been happening with homes like yours recently — far more useful than an average. Share your name and email and he'll pull that together.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'service-area',
    question: 'Do you work in my area?',
    keywords: [
      'do you work in',
      'do you cover',
      'do you serve',
      'your service area',
      'what areas do you',
      'where do you work',
      'are you in atlanta',
      'do you work with',
    ],
    answer: `Joey works across the Atlanta metro. Tell me the city or neighborhood you have in mind and I'll confirm it's one he covers — and if it isn't, he'd rather refer you to someone good there than stretch outside what he knows well.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'who-is-joey',
    question: 'Who is Joey? Are you a licensed agent?',
    keywords: [
      'who is joey',
      'about joey',
      'tell me about joey',
      'are you licensed',
      'licensed agent',
      'licensed realtor',
      'your credentials',
      'how long have you been doing',
      'your experience',
      'how long has joey',
    ],
    answer: `Joey Oberndorfer is a licensed real estate agent working the Atlanta metro, and GoWithJoeyO is his practice. The thing people tend to notice first is that he isn't a pressure guy — he'd rather you make a good decision slowly than a fast one you regret. Happy to have him tell you about his background himself if you'd like to talk.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'investment-property',
    question: 'Do you help with investment or rental property?',
    keywords: [
      'investment property',
      'investment properties',
      'rental property',
      'rental properties',
      'rental income',
      'buy to rent',
      'cash flow',
      'income property',
      'build a portfolio',
      'as an investor',
    ],
    answer: `Yes — that's a real part of what Joey does. The conversation looks different from a primary residence, because it's about what the numbers do rather than how the kitchen feels. He'll go through which pockets of the metro are actually working right now for the kind of return you're after. What's your name and email?`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'insurance-help',
    question: 'Can you help with home insurance?',
    keywords: [
      'home insurance',
      'homeowners insurance',
      'house insurance',
      'about insurance',
      'with insurance',
      'insurance questions',
      'handle insurance',
      'need insurance',
      'insure the house',
      'insure my home',
      'get coverage',
    ],
    answer: `Yes, insurance is one of the things Joey can take off your plate — it's the piece people usually leave until the last week and then rush. He'll help you compare what coverage actually makes sense for the property rather than just finding the cheapest line item. Want me to have him reach out about it?`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'closing-services',
    question: 'What do you mean by closing services? Title and escrow?',
    keywords: [
      'closing services',
      'closing costs',
      'closing process',
      'closing table',
      'title company',
      'title work',
      'what happens at closing',
      'how does closing work',
    ],
    strongKeywords: ['escrow'],
    answer: `It's the last stretch — title work, escrow, the paperwork, and the coordination that all has to land on the same day. Joey helps manage that piece so you're not chasing five different parties in your final week. Tell me roughly where you are in the process and he can walk you through what's coming next.`,
    approval: PENDING_APPROVAL,
  },
  {
    id: 'book-a-call',
    question: 'Can I just talk to Joey?',
    keywords: [
      'talk to joey',
      'speak to joey',
      'speak with joey',
      'call joey',
      'book a call',
      'schedule a call',
      'set up a call',
      'schedule a time',
      'talk to a person',
      'talk to someone',
      'have him call me',
    ],
    answer: `Of course — that's usually the fastest way through. Give me your name and the best email for you and I'll get you on his calendar. If there's a time of day that works better for you, say so and I'll pass it along with it.`,
    approval: PENDING_APPROVAL,
  },
];
