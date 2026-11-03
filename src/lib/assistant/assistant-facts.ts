/**
 * What the assistant knows about Joey, as prose.
 *
 * ## Why this file exists
 *
 * `src/lib/assistant/system-prompt.ts` carries six {{PLACEHOLDER}} tokens, and
 * `getAssistantEnv()` in ./agent.ts filled them from `ASSISTANT_*` environment
 * variables. None of those variables was ever set in the Netlify environment,
 * so the live system prompt read, literally:
 *
 *     - Buying representation: {{BUYER_SERVICES_SUMMARY}}
 *
 * The assistant therefore did not know what Joey offers or where he works, and
 * nothing surfaced it: the unfilled-placeholder warning in `getSystemPrompt`
 * only fires when NODE_ENV is development. The defaults below are the fallback,
 * so an unconfigured deployment gets Joey's actual answers rather than a token.
 * `env.ASSISTANT_*` still wins where it is set, so tuning a value without a
 * deploy is still possible.
 *
 * Prose lives here and the substitution lives in ./agent.ts, the same split as
 * ./answer-playbook-content.ts from ./answer-playbook.ts.
 *
 * ## Provenance
 *
 * Every sentence below traces to one of Joey's approved answers in
 * ./answer-playbook-content.ts or to the service pages built from them. Each
 * entry names its sources. Nothing here may introduce a statistic, a timeline,
 * a guarantee, a price or a promise, because none of those is traceable — hence
 * the guards in ./assistant-facts.test.ts: no dollar figure, no percentage, no
 * surviving {{TOKEN}}, and the fee word Joey replaced spelled nowhere.
 *
 * Two boundaries matter more than the rest and are repeated as HARD RULES in
 * the prompt, because a placeholder is overridable by an environment variable
 * and a boundary that disappears when someone tunes a variable is not a
 * boundary: Joey is not an insurance agent, and he is not a title or escrow
 * company. He refers and he coordinates.
 */

export const ASSISTANT_FACT_DEFAULTS = {
  /**
   * Source: playbook entry `service-area`; the "Across Georgia" column of
   * src/app/(marketing)/buy-home/page.tsx.
   */
  SERVICE_AREA: 'all of Georgia, with deep expertise in Metro Atlanta',

  /**
   * Source: playbook entry `service-area`; the "Where Joey Works" section of
   * src/app/(marketing)/buy-home/page.tsx.
   */
  SERVICE_AREA_LIST:
    'All of Georgia, with deep expertise in Metro Atlanta including Cobb, ' +
    'Fulton, DeKalb and Gwinnett counties. For a client moving out of state or ' +
    'out of the country, Joey connects them with top agents anywhere in the ' +
    "world through eXp Realty's global network, and stays in their corner the " +
    'whole way.',

  /**
   * Source: playbook entries `first-time-buyer`, `pre-approval-first` and
   * `who-is-joey`; src/app/(marketing)/buy-home/page.tsx.
   */
  BUYER_SERVICES_SUMMARY:
    "Every buyer's path is different, and the buyers who win start with a " +
    'plan. Joey builds it with you personally: goals, budget, next steps. He ' +
    'walks every buyer through pre-approval himself and connects them with a ' +
    'trusted lending partner when they are ready. He treats real estate as a ' +
    "wealth-building strategy, so a move should build the client's financial " +
    'future and not just close a deal.',

  /**
   * Source: playbook entries `home-valuation` and `compensation`;
   * src/app/(marketing)/sell-home/page.tsx.
   *
   * The word is "compensation". Joey replaced the other one, and this value is
   * one of the places it would be easiest to reintroduce.
   */
  SELLER_SERVICES_SUMMARY:
    "Price and timing depend on the home's condition, the market right now " +
    'and recent sales nearby, so Joey reviews the home personally instead of ' +
    'giving a generic online estimate. He covers it in a seller consultation, ' +
    'including strategies to buy the next home before selling. Compensation ' +
    'depends on whether they are buying or selling and what they need, so he ' +
    'discusses it personally with every client.',

  /**
   * Source: the absence of any approved guide answer, plus the retirement of
   * the one guide the site ever named.
   *
   * This slot previously read `{{GUIDE_SUMMARY}}`, and a model handed an empty
   * slot labelled "guide" invents a guide to fill it. Naming the absence is
   * what stops that, the same move `bookIntroCallResult` makes for a missing
   * booking link.
   */
  GUIDE_SUMMARY:
    'There is no downloadable guide and no market report to send. The guidance ' +
    'is personal: Joey walks buyers through pre-approval and sellers through ' +
    'pricing and timing himself. You hold no market statistics and must not ' +
    'quote one.',

  /**
   * Source: playbook entries `who-is-joey` and `am-i-talking-to-a-bot`; the
   * "Who You Are Talking To" section of src/app/(marketing)/contact/page.tsx.
   */
  TEAM_SUMMARY:
    'Joey Oberndorfer is a licensed Georgia Realtor with eXp Realty and an ' +
    'eXp ICON Agent, serving clients across all of Georgia with a global ' +
    'network of agents and properties. He is also an active real estate ' +
    'investor in rentals and flips. He handles every client personally, and ' +
    'you are his assistant, not a second agent.',
} as const;

/** The six slots the system prompt carries. */
export type AssistantFactKey = keyof typeof ASSISTANT_FACT_DEFAULTS;
