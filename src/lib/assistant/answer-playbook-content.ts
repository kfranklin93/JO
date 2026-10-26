/**
 * Answer Playbook content — the answers themselves.
 *
 * Prose lives here so Joey can edit it without reading the matcher, the same
 * split as src/lib/services/follow-up-content.ts. See ./answer-playbook.ts for
 * how an entry is selected and how the hard-rule guard treats a bad edit.
 *
 * ## These are Joey's words, not drafts
 *
 * Every answer below was supplied by Joey verbatim and is marked approved. Do
 * not reword them for tone, length or grammar. If one reads awkwardly, that is
 * a conversation to have with him, not an edit to make here — the whole point of
 * the playbook is that the assistant says what he decided it would say.
 *
 * Two of his instructions are easy to undo by accident:
 *
 *  - **Never the word "commission".** He says "compensation". The entry is named
 *    `compensation` for that reason. Its *keywords* still include "commission",
 *    because that is the word clients type — match on theirs, answer in his.
 *  - **"Joey Oberndorfer" and "Go With Joey O."**, spelled exactly so.
 *
 * ## The [Name] token
 *
 * Several answers contain `[Name]`. It is deliberately left literal here. The
 * directive built in ./answer-playbook.ts tells the model to substitute the
 * client's first name, or to drop the token and its surrounding punctuation when
 * no name has been given yet — which is why these read naturally either way and
 * why the literal string never reaches a client.
 *
 * ## Editing an entry
 *
 * - `keywords` are phrases a real person would type. Each matched phrase scores
 *   its word count, and an entry needs 2 to fire, so a one-word keyword never
 *   triggers the entry by itself. Put the term in `strongKeywords` instead when
 *   one word really is decisive.
 * - `answer` must quote no dollar figure, no percentage, and promise no outcome.
 *   The loader silently withholds any entry that does.
 * - Order matters only for ties: when two entries score the same, the earlier
 *   one wins.
 */

import { type PlaybookEntry } from './answer-playbook';

/**
 * Joey's sign-off, recorded in place of the pending marker.
 *
 * Replaces `PENDING_APPROVAL` on every entry because he wrote these himself and
 * sent them through for use as-is.
 */
const APPROVED = 'Joey Oberndorfer — verbatim from brief';

export const ANSWER_PLAYBOOK: readonly PlaybookEntry[] = [
  {
    id: 'am-i-talking-to-a-bot',
    question:
      'Am I talking to a real person? / When can we schedule a consultation? / Can I meet with Joey?',
    // Joey asked for this answer to cover the scheduling and meeting questions
    // too, not just the is-this-a-bot one. It overlaps with `book-a-call`
    // below; this entry is earlier, so it wins a tie.
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
      'when can we schedule',
      'schedule a consultation',
      'book a consultation',
      'can i meet with joey',
      'meet with joey',
      'meet joey',
      'set up a meeting',
    ],
    strongKeywords: ['chatbot'],
    answer: `I'm Joey's AI assistant, [Name]. I'm here to get you connected, but Joey handles every client personally. The best way to get his full attention is a short consultation.`,
    approval: APPROVED,
  },
  {
    id: 'compensation',
    question: 'What do you charge? What is your compensation?',
    // The keywords keep "commission" because that is what clients ask. The
    // answer never uses it — see the note at the top of this file.
    keywords: [
      'your commission',
      'the commission',
      'what commission',
      'percent commission',
      'commission rate',
      'how much commission',
      'commission do you charge',
      'your compensation',
      'how are you compensated',
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
    answer: `Great question, [Name]. Compensation depends on whether you're buying or selling and what you need, so Joey discusses it personally with every client. But in the end, it's not the compensation that matters, it's the results, and Joey will show you exactly how he gets them.`,
    approval: APPROVED,
  },
  {
    id: 'home-valuation',
    question: "What's my home worth? / How long will it take to sell?",
    // Joey merged valuation and time-to-sell into one answer, so the keywords
    // from both questions point here. The old `how-long-to-sell` entry is gone.
    keywords: [
      'what is my house worth',
      'what is my home worth',
      'my house worth',
      'my home worth',
      'how much is my house',
      'how much is my home',
      'what could i sell for',
      'what would my house list for',
      'home value',
      'value my home',
      'how long to sell',
      'how long does it take to sell',
      'how long will it take to sell',
      'how fast can you sell',
      'how quickly can i sell',
      'time to sell',
      'days on market',
    ],
    strongKeywords: ['valuation', 'appraisal'],
    answer: `Every home is different, [Name]. Price and timing depend on your home's condition, the market right now, and recent sales near you, so Joey reviews your home personally instead of giving a generic online estimate. He'll go over it with you in a seller consultation, including strategies to buy your next home before you sell so you don't miss out on one you love.`,
    // Joey's note: ask for the address if we do not already have it. Carried as
    // a follow-up instruction rather than appended to the answer, so the model
    // only asks when it actually needs to.
    followUp: `If the property address has not been given yet, ask for it: "What's the property address?"`,
    approval: APPROVED,
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
    answer: `Great question, [Name], and the answer depends on your situation. Joey walks every buyer through the pre-approval process personally and connects you with a trusted lending partner when you're ready. Starting with a plan puts you ahead of most buyers.`,
    approval: APPROVED,
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
      'out of state',
      'out of the country',
      'moving to another state',
      'relocating',
    ],
    answer: `Joey serves all of Georgia, with deep expertise in Metro Atlanta, including Cobb, Fulton, DeKalb, and Gwinnett counties. Moving out of state or out of the country? Through eXp Realty's global network, Joey connects his clients with top agents anywhere in the world, and stays in your corner the whole way.`,
    approval: APPROVED,
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
      'flip a house',
      'flipping houses',
    ],
    answer: `Absolutely, [Name]. Joey is an investor himself in rentals and flips, so he looks at every deal numbers first. The right strategy depends on your goals, and Joey loves talking through them with fellow investors.`,
    approval: APPROVED,
  },
  {
    id: 'insurance-help',
    question: 'Can you help with home insurance?',
    // Correction from Joey: he is NOT an insurance agent. The earlier draft of
    // this answer said insurance was something he handles, which was wrong and
    // would have misrepresented a licensed professional's services. This is the
    // answer his review produced.
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
    answer: `Joey isn't an insurance agent, but he has trusted insurance professionals he connects his clients with so there are no surprises before closing. He's happy to share them and learn more about your plans.`,
    approval: APPROVED,
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
    answer: `Joey personally manages every deal from contract to closing, has trusted closing partners when you need a resource, and attends every one of his closings in person. You'll never be left wondering what's next.`,
    approval: APPROVED,
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
    answer: `Welcome, [Name], you're in the right place! Every first-time buyer's path is different, and the buyers who win start with a plan. Joey builds that plan with you personally: your goals, your budget, and your next steps.`,
    approval: APPROVED,
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
      'his background',
    ],
    answer: `Joey Oberndorfer is a licensed Georgia Realtor with eXp Realty and an eXp ICON Agent, serving clients across all of Georgia with a global network of agents and properties. He's also an active real estate investor in rentals and flips, so he treats real estate as a wealth-building strategy: every move should build your financial future, not just close a deal. First-time buyer, seller, investor, or relocating across the world, Joey has a plan for you. His philosophy: Preparation Creates Confidence. Execution Creates Wins.`,
    approval: APPROVED,
  },
  {
    id: 'book-a-call',
    question: 'Can I just talk to Joey?',
    // Narrower than `am-i-talking-to-a-bot` on purpose: Joey routed the
    // scheduling and meeting phrasings to that entry, so this one keeps only
    // the direct "talk to Joey" forms.
    keywords: [
      'talk to joey',
      'speak to joey',
      'speak with joey',
      'call joey',
      'book a call',
      'schedule a call',
      'set up a call',
      'talk to a person',
      'talk to someone',
      'have him call me',
      'get joey on the phone',
    ],
    answer: `Absolutely, [Name], Joey would love to connect with you.`,
    followUp:
      'Then move straight to offering the consultation — a call, a text, or an email, their choice.',
    approval: APPROVED,
  },
];
