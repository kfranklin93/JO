# AI Scheduling Assistant — Requirements

## Introduction

Joey needs an assistant that answers a lead's questions in his voice and books time on his calendar without him touching it. Today neither half exists: `/api/ai/chat` is a 501 stub, there is no chat surface anywhere on the public site, and the only scheduling mechanism is a static Calendly URL pasted into email signatures.

This spec adds a conversational assistant backed by AWS Bedrock with real booking through Calendly's Scheduling API. It is the first spec in this project where a language model is given the ability to cause a side effect — writing to Joey's calendar and sending mail to a third party under his name. That changes the threat model. Everything before this treated the model as a text generator whose output a human or a template would frame; here it takes actions. The requirements below are weighted accordingly: the validation and authorization rules are the substance of this spec, and the conversational quality is comparatively easy.

Two prerequisites sit outside the code. Bedrock model access must be granted for the configured model, and Calendly's Scheduling API requires the account to be on a paid plan — the read-only endpoints work on Free, but `POST /invitees` does not.

## Current state

Verified by reading source on the current tree:

- `src/app/api/ai/chat/route.ts` is five lines returning 501. Same for `/api/ai/follow-up`, `/api/analytics`, `/api/lofty/sync`, and `/api/lofty/webhook`.
- **No public chat surface exists.** Grepping `src/components/**/*.tsx` for "chat" matches only `src/components/dashboard/AiLogsPanel.tsx`, which renders `mockBedrockThreads` from `src/data/mockBedrockLogs.ts` — hardcoded fixtures, no fetch, no database. Its "Take Over Chat" button is wired to nothing.
- `src/lib/api/bedrock.ts` works but is minimal: `InvokeModelCommand` only, no `tools` in the payload, no streaming, and `sendBedrockMessage` collapses every failure into `throw new Error('Failed to get AI response')`, discarding the cause.
- **The `conversations` table is fully designed and never written.** `src/lib/db/schema.ts:126-157` models exactly what is needed — `type` (`sms | email | phone | in_person`), `direction` (`inbound | outbound`), `content`, `subject`, `metadata` jsonb for provider ids, and `ai_generated` defaulting to `false`. Nothing in `src` inserts into it. The live database holds 0 rows.
- The consequence is visible in the SMS path: `src/app/api/sms/webhook/route.ts:124` sets `const conversationHistory: string[] = []` under a `// TODO: Fetch conversation history from database`, so every inbound text is answered with no memory of the previous one. `buildSmsReplyPrompt` already accepts a history array; there is simply nothing to pass it.
- `src/lib/services/database-service.ts` already contains `createConversation`, `getConversationsByLeadId`, `getRecentConversations`, `markConversationAsOpened/Clicked/Replied`, `getLeadByPhone`, `updateLeadEngagement`, and `trackEvent`. The whole module is imported by zero source files.
- `follow_ups.conversation_id` exists as a nullable FK (`schema.ts:177`) and is never populated. `markFollowUpAsSent(id, conversationId)` in `database-service.ts:225` was written to populate it.
- `CALENDLY_LINK` is already in the env schema (`src/config/env.ts:52`, optional URL) and is appended to every outbound email (`email-service.ts:72`) and SMS (`sms-service.ts:59`). It is a static link only — nothing queries availability or books.
- Vocabulary for the outcome already exists: `leadStatusEnum` includes `appointment_set` and `showing_scheduled`; `eventTypeEnum` includes `appointment_booked`. Neither is ever set.
- `src/lib/prompts/joey-voice.ts` has real injection hardening: `stripPromptDelimiters` with a repeated-pass loop, XML delimiting via `<lead_data>` / `<sms_message>`, and standing instructions in `JOEY_PERSONALITY` telling the model that delimited content is data. This is sound for text generation and is **not** sufficient once tools are attached, because it constrains what the model is told, not what the server will execute.
- `src/lib/auth/rate-limit.ts` exists from the dashboard-session-security spec, but it counts **failures**, not requests (`recordFailure` is called only on a bad password), and its own doc comment states the counter is per-instance and "not a strong control." Neither property suits a paid-per-token public endpoint.
- `@aws-sdk/client-bedrock-runtime@^3.1084.0` is already a dependency. No new AWS package is needed. `tsx` is **not** installed, so the `npm run test:bedrock` command in `AWS_BEDROCK_INTEGRATION_GUIDE.md` does not work as written.
- All AWS variables plus `CALENDLY_LINK` are present and non-empty in `.env.local`. Whether Bedrock *model access* has been granted is a property of the AWS account, not the repo, and is unverified.

## Requirements

### Requirement 1 — Persisted conversation history

**User Story:** As a lead, I want the assistant to remember what I already told it, so that I am not asked my budget three times in one conversation.

#### Acceptance Criteria

1. WHEN a message is received from a lead THEN a `conversations` row SHALL be written with `direction` `inbound` before any model call is made
2. WHEN the assistant produces a reply THEN a `conversations` row SHALL be written with `direction` `outbound`
3. WHEN an outbound row is written for model-generated content THEN `ai_generated` SHALL be true and `ai_model` SHALL record the model id used
4. WHEN an outbound row is written for templated or static content THEN `ai_generated` SHALL be false
5. WHEN a conversation turn is assembled THEN prior turns SHALL be loaded from `conversations` for that lead
6. WHEN history is loaded THEN it SHALL be bounded to a fixed number of recent turns rather than the full history
7. WHEN a provider returns a message identifier THEN it SHALL be stored in `metadata`
8. WHEN the inbound row cannot be written THEN the request SHALL fail without calling the model, so a reply is never sent that cannot be reconstructed
9. WHERE the SMS webhook currently passes an empty history array THE same persisted history SHALL be used instead

### Requirement 2 — The model never originates a bookable time

**User Story:** As Joey, I want every offered appointment slot to have come from my actual calendar, so that the assistant cannot invent or promise a time I am not free.

#### Acceptance Criteria

1. WHEN availability is presented to a lead THEN every slot SHALL have been returned by a live Calendly availability query during the current request
2. WHEN a booking is attempted THEN the requested start time SHALL be validated against a freshly retrieved set of available slots before the booking call is made
3. IF the requested start time is not present in the freshly retrieved set THEN the booking SHALL be refused and alternatives SHALL be offered
4. WHEN a start time is sent to Calendly THEN it SHALL be normalised to UTC with a trailing `Z`
5. WHEN an availability query is issued THEN its date range SHALL NOT exceed 31 days, which is the documented Calendly maximum
6. WHEN the model emits a time that did not come from a tool result THEN the server SHALL NOT treat it as bookable
7. WHEN a booking succeeds THEN the confirmation shown to the lead SHALL be rendered from the Calendly response rather than from model output
8. WHEN a slot is taken between availability retrieval and booking THEN the resulting Calendly error SHALL be handled as a recoverable condition and fresh alternatives offered

### Requirement 3 — Bookings are bound to a server-established identity

**User Story:** As Joey, I want appointments booked only for the person actually in the conversation, so that my calendar and my sending reputation cannot be used to send invitations to strangers.

#### Acceptance Criteria

1. WHEN a booking is made THEN the invitee email SHALL be taken from the server's record of the conversation's lead, not from text the model extracted
2. WHEN a conversation has no associated lead THEN booking SHALL be unavailable
3. WHEN a lead identity is established THEN it SHALL come from a validated form field rather than free-text conversation
4. WHEN an email address is supplied THEN it SHALL be validated with the existing Zod validation before a lead row is created or matched
5. IF conversation content requests booking for a different address than the established one THEN the request SHALL be refused
6. WHEN a booking succeeds THEN the lead's status SHALL be advanced to `appointment_set`
7. WHEN a booking succeeds THEN an `appointment_booked` analytics event SHALL be recorded
8. WHEN the same conversation attempts a second booking for an already-booked slot THEN it SHALL be treated as idempotent rather than producing a duplicate appointment

### Requirement 4 — Bounded model interaction

**User Story:** As Joey, I want a hard ceiling on what one conversation can consume, so that a single visitor cannot run up an unbounded AWS bill.

#### Acceptance Criteria

1. WHEN a chat request is received THEN the inbound message length SHALL be capped and over-long input rejected before any model call
2. WHEN a tool-use loop runs THEN the number of tool round trips within one request SHALL be capped
3. WHEN the tool round-trip cap is reached THEN the assistant SHALL return a useful partial response rather than looping
4. WHEN a conversation reaches a configured maximum number of turns THEN further requests SHALL be refused with a message directing the lead to contact Joey directly
5. WHEN a model call is made THEN `max_tokens` SHALL be bounded by configuration
6. WHEN a chat request is received THEN it SHALL be counted against a per-client request limit regardless of outcome
7. WHEN a client exceeds the request limit THEN the endpoint SHALL return HTTP 429 with a `Retry-After` header and SHALL NOT call the model
8. WHERE the existing rate limiter counts only failed attempts THE chat limiter SHALL count every request
9. WHEN the rate limiter's storage is per-instance THEN that limitation SHALL be documented at the call site, as it is for the login limiter

### Requirement 5 — Injection cannot reach a side effect

**User Story:** As Joey, I want a hostile message to be unable to make the assistant act, so that instructions typed by a visitor cannot book, cancel, or leak.

#### Acceptance Criteria

1. WHEN lead-supplied text is placed in a prompt THEN it SHALL be delimited and stripped using the existing `stripPromptDelimiters` helper
2. WHEN a tool call is returned by the model THEN its arguments SHALL be validated against a schema before execution
3. WHEN a tool argument fails validation THEN the tool SHALL NOT execute and the failure SHALL be returned to the model as a tool error
4. WHEN a tool executes THEN its authority SHALL be limited to the established lead, so no argument can widen its scope
5. WHEN the assistant is asked to reveal its instructions THEN it SHALL decline, per the existing standing instruction
6. WHEN conversation history is replayed into a prompt THEN stored inbound content SHALL be re-delimited on the way in rather than trusted because it is already in the database
7. WHEN a tool result is returned to the model THEN it SHALL be structured data rather than interpolated prose

### Requirement 6 — Fail closed and never over-promise

**User Story:** As a lead, I want the assistant to be honest about what it can do, so that it never tells me I am booked when it could not book anything.

#### Acceptance Criteria

1. WHEN Bedrock configuration is absent THEN the chat endpoint SHALL return a named configuration error rather than a generic failure
2. WHEN Calendly configuration is absent THEN the booking and availability tools SHALL NOT be offered to the model
3. WHEN the booking tools are unavailable THEN the assistant SHALL fall back to sharing the static `CALENDLY_LINK` and SHALL say that it cannot book directly
4. WHEN the booking tools are unavailable THEN the assistant SHALL NOT claim an appointment was made
5. WHEN a Calendly call fails THEN the lead-facing message SHALL be useful and SHALL NOT expose provider error detail, status codes, or tokens
6. WHEN a required environment variable is missing THEN the failure SHALL use the existing `requireEnv` mechanism and its named 503
7. WHEN configuration is asserted THEN it SHALL be asserted after rate limiting, so an unauthenticated caller cannot probe which variables a deployment is missing

### Requirement 7 — Secrets and personal data are handled correctly

**User Story:** As Joey, I want client details and API credentials kept out of places they can leak, so that a log file or a browser bundle is not a disclosure.

#### Acceptance Criteria

1. WHEN the Calendly token is configured THEN it SHALL be a server-only variable and SHALL NOT be exposed through any `NEXT_PUBLIC_` name
2. WHEN a Calendly or Bedrock call is logged THEN credentials SHALL NOT appear in the log output
3. WHEN conversation content is logged THEN message bodies and email addresses SHALL NOT be written at informational level
4. WHEN an error is returned to the browser THEN it SHALL NOT include provider responses, stack traces, or configuration values
5. WHEN the chat endpoint runs THEN it SHALL run in the Node.js runtime so server-only configuration is reliably readable

### Requirement 8 — Joey can see and take over

**User Story:** As Joey, I want to read what the assistant said and step in myself, so that I stay in control of my own client relationships.

#### Acceptance Criteria

1. WHEN Joey opens a lead in the dashboard THEN the full message history SHALL be visible in chronological order
2. WHEN a message is displayed THEN its direction, channel, and timestamp SHALL be distinguishable
3. WHEN a message was model-generated THEN it SHALL be visually distinct from one Joey sent himself
4. WHEN a booking has been made for a lead THEN it SHALL be visible on that lead alongside the message history
5. WHEN Joey disables the assistant for a lead THEN subsequent inbound messages SHALL be recorded but SHALL NOT receive a generated reply
6. WHEN history is requested THEN it SHALL be served by an endpoint scoped to a single lead rather than by widening the existing dashboard payload
7. WHEN the history endpoint is called THEN it SHALL require a valid dashboard session, verified the same way as the existing dashboard data route
8. WHERE `AiLogsPanel` currently renders fixtures THE panel SHALL render live rows or be removed

### Requirement 9 — Answer quality in Joey's voice

**User Story:** As a lead, I want replies that sound like a knowledgeable local agent, so that the conversation is worth having.

#### Acceptance Criteria

1. WHEN the assistant replies THEN it SHALL use the existing `JOEY_PERSONALITY` system prompt as its voice definition
2. WHEN the assistant does not know something THEN it SHALL say so and offer to have Joey follow up
3. WHEN the assistant discusses a property or a price THEN it SHALL NOT state specifics it was not given
4. WHEN a lead expresses scheduling intent THEN the assistant SHALL offer a small number of concrete times rather than a link
5. WHEN a lead confirms a time THEN the assistant SHALL confirm explicitly before booking
6. WHEN the conversation begins THEN the opener SHALL reflect the lead's intent, reusing the existing `getConversationStarter`

## Out of scope

- Google Calendar as an alternative backend. Calendly is the decision; the client is isolated behind an interface so a second implementation is possible later, but none is written here.
- Rescheduling and cancellation flows. Calendly returns `reschedule_url` and `cancel_url` on booking; this spec surfaces those links rather than driving those operations through the assistant.
- Streaming responses. The chat returns a complete reply. Streaming is a UX improvement that complicates the tool loop and is deliberately deferred.
- A durable, shared-state rate limiter. The per-instance limitation is inherited and documented, not fixed. The `login_attempts`-table approach noted in `rate-limit.ts` would address both call sites at once and belongs in its own spec.
- Resend open/click webhooks and Twilio status callbacks. The `delivered_at` / `opened_at` / `clicked_at` columns still get no writer here.
- Populating `analytics_events` beyond the single `appointment_booked` event required by Requirement 3.7.
- Voice calls, and any inbound channel other than web chat and the existing SMS webhook.
- Lofty CRM synchronisation of appointments.
- Multi-agent or team routing. Calendly's event-type mapping supports it; Joey is a single host.
