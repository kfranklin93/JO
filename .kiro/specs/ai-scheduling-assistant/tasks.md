# AI Scheduling Assistant — Tasks

Ordered so each task leaves the tree working. Tasks 1-3 need no Bedrock access and no Calendly plan, so they can proceed while those are being arranged.

- [ ] 1. Extend the schema for messages and appointments
  - Add `web` to `conversationTypeEnum` in `src/lib/db/schema.ts` — the enum is `sms | email | phone | in_person` today and overloading `email` would corrupt the `type = 'email'` filter in `getConversionFunnel`
  - Add an `appointment_status` enum with `scheduled` and `canceled`
  - Add the `appointments` table per the design: `lead_id` FK cascade, `calendly_event_uri`, `calendly_invitee_uri`, `event_type_uri`, `start_time`, `end_time`, `status`, `cancel_url`, `reschedule_url`, `created_at`
  - Add `appointments_lead_id_idx`, a unique index on `calendly_event_uri`, and a partial unique on `(lead_id, start_time) WHERE status = 'scheduled'`
  - Add an assistant-disabled boolean to `leads` for the takeover behaviour in task 9
  - Run `npm run db:push` and confirm the enum value, table, and all three indexes are live
  - Note in a comment that Postgres cannot easily remove an enum value, so these names are effectively permanent
  - _Requirements: 3.6, 3.8, 8.4, 8.5_

- [ ] 2. Write the conversation log and start using it
  - Create `src/lib/services/conversation-log.ts` with `logMessage`, `loadRecentTurns`, and `countTurns`, delegating to the existing functions in `src/lib/services/database-service.ts` rather than reimplementing them — that module is complete and imported nowhere
  - Return `loadRecentTurns` oldest-first for prompt assembly; `getConversationsByLeadId` orders `desc`, and getting this backwards produces an incoherent conversation rather than an error
  - Bound `loadRecentTurns` to a fixed recent-turn count
  - Wire the SMS webhook to it: replace `const conversationHistory: string[] = []` at `src/app/api/sms/webhook/route.ts:124` with real history, add a `getLeadByPhone` lookup so inbound texts attach to a lead, log the inbound row before generating, and log the outbound row with the Twilio `MessageSid` in `metadata`
  - Populate `follow_ups.conversation_id` on send via the existing `markFollowUpAsSent(id, conversationId)`, retiring a dangling FK
  - Write tests: inbound-before-generation ordering, an inbound insert failure preventing any model call, history bounded to the limit, and ordering asserted explicitly
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [ ] 3. Build the Calendly client
  - Add `CALENDLY_API_TOKEN` and `CALENDLY_EVENT_TYPE_URI` to `src/config/env.ts` as optional strings, following the established optional-at-parse pattern; neither may ever appear under a `NEXT_PUBLIC_` name
  - Create `src/lib/api/calendly.ts` with `isCalendlyConfigured`, `listEventTypes`, `listAvailableTimes`, and `createInvitee`
  - Clamp `listAvailableTimes` to a 31-day maximum range and reject past start times inside the module, so no caller can violate the documented Calendly constraints
  - Normalise every outgoing `start_time` to UTC with a trailing `Z` inside this module
  - Handle the `location` object correctly: required unless the event type specifies no location, in which case omitted; when the host's kind can require invitee input (`ask_invitee`, `outbound_call`, or multiple custom or physical locations) it must carry `location.location`
  - Map 400/401/403/404/5xx to distinct typed errors so callers can respond differently; never let a provider payload or token reach a caller's error message
  - Write tests against recorded fixtures with no network: the 31-day clamp, UTC normalisation, each error mapping, and the omit-vs-require location branches
  - _Requirements: 2.4, 2.5, 6.5, 7.1, 7.2_

- [ ] 4. Add tool support to the Bedrock client
  - Add `converseWithTools` to `src/lib/api/bedrock.ts` using `ConverseCommand` with `toolConfig`, leaving `sendBedrockMessage` untouched — the follow-up-automation AI content source depends on it
  - Default `maxToolRounds` to 3; on reaching the cap, request a final text answer instead of continuing to loop
  - Bound `max_tokens` from configuration
  - Preserve error causes instead of collapsing everything into `throw new Error('Failed to get AI response')`, so `AccessDeniedException` (model access not granted) is distinguishable from throttling
  - Write tests: a single tool round trip, the round cap producing a usable partial answer, and each error class surfacing distinguishably
  - _Requirements: 4.2, 4.3, 4.5, 6.1_

- [ ] 5. Build the tool layer — the security boundary
  - Create `src/lib/ai/tools.ts` with `buildToolset` and `makeToolExecutor` over an `AssistantContext` of `{ leadId, leadEmail, leadName, timezone }` resolved from the database before the loop starts
  - Give `book_appointment` exactly one input, `startTime`. No email, no name, no event type — those come from `AssistantContext`, so an injected "book for someone@else.com" has no argument to land in
  - Validate every tool argument with Zod; return validation failures to the model as tool errors rather than throwing
  - In `book_appointment`: normalise to UTC, **re-query availability for the containing day, require an exact match**, then book with the context email; treat a unique-constraint violation on insert as success
  - On success: insert the `appointments` row, advance lead status to `appointment_set`, record an `appointment_booked` analytics event via the existing `trackEvent`
  - Return structured tool results, not interpolated prose
  - Offer both tools only when `isCalendlyConfigured()` returns true
  - Write tests: hallucinated slot refused with no booking call, stale slot refused with alternatives offered, injected email ignored, concurrent double-booking yielding one row, and empty toolset when unconfigured
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 3.1, 3.5, 3.6, 3.7, 3.8, 5.2, 5.3, 5.4, 5.7, 6.2_

- [ ] 6. Establish chat identity and request limiting
  - Create `src/lib/ai/chat-session.ts` reusing the HMAC approach from `src/lib/auth/session.ts` with its own cookie name and a `{ leadId, exp }` payload signed with `SESSION_SECRET`
  - Set the cookie from the existing validated lead-creation path so the gate form goes through `POST /api/leads` and its Zod validation rather than a new unvalidated route
  - Read `leadId` from the signed cookie and from nowhere else; no session means no conversation and no booking
  - Create `src/lib/api/request-limit.ts` with `checkAndCount`, importing `rateLimitKey` from `src/lib/auth/rate-limit.ts` for its Netlify header ordering and shared fallback bucket
  - Do not refactor `rate-limit.ts` itself — it is a shipped control whose model is failure-counting, and every chat request must count
  - Restate the per-instance limitation at the call site, and note that here the exposure is spend rather than password guessing
  - Write tests: forged and expired cookies rejected, limit counting successes as well as failures, and `Retry-After` present on refusal
  - _Requirements: 3.2, 3.3, 3.4, 4.6, 4.7, 4.8, 4.9_

- [ ] 7. Implement the chat endpoint
  - Replace the 501 stub at `src/app/api/ai/chat/route.ts`, with `export const runtime = 'nodejs'`
  - Keep the order fixed: rate limit → verify chat session → `requireEnv` → Zod-validate the message including a length cap → turn cap via `countTurns` → write inbound row → load and re-delimit history → `converseWithTools` → write outbound row → reply
  - Assert configuration *after* rate limiting and session verification so an unauthenticated caller cannot enumerate missing variables, matching the ordering already used in `/api/dashboard/data`
  - Derive the turn cap from row count, not from a cookie counter, so replaying an older cookie cannot reset it
  - Re-delimit stored inbound content with `stripPromptDelimiters` when replaying history — being in the database does not make it trusted
  - Use `JOEY_PERSONALITY` as the system prompt and `getConversationStarter` for the opener
  - When Calendly is unconfigured, share the static `CALENDLY_LINK`, say booking is not available directly, and never claim an appointment was made
  - Keep provider detail, status codes, and configuration values out of every response; keep message bodies and email addresses out of informational logs
  - Write tests: 429 before any Bedrock call, turn cap surviving cookie replay, history re-delimiting, no-promise behaviour when unconfigured, and the env-probing case
  - _Requirements: 4.1, 4.4, 5.1, 5.5, 5.6, 6.1, 6.3, 6.4, 6.6, 6.7, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 8. Build the chat widget
  - Create `src/components/chat/ChatWidget.tsx` with the gate form (name, email, intent), message list, and composer
  - Announce replies through a live region, move focus predictably between gate and composer, trap focus while the panel is open, restore it on close, and support Escape
  - Take every colour from the `@theme` tokens in `src/app/globals.css` — no hardcoded hex, no arbitrary values like `bg-[black]`, per the project steering rule
  - Show the booking confirmation from the Calendly response, including the cancel and reschedule links
  - Mount it only where intended, and not at all while Bedrock is unconfigured
  - Write tests: keyboard-only traversal, live-region announcement, and focus restoration
  - _Requirements: 2.7, 8.4, 9.4_

- [ ] 9. Give Joey visibility and takeover
  - Create `src/app/api/dashboard/leads/[id]/history/route.ts`, session-verified with `verifySession` exactly as `/api/dashboard/data` is, scoped to one lead rather than widening the existing payload — which already fetches every follow-up unbounded
  - Return messages chronologically with direction, channel, timestamp, and the `ai_generated` flag, plus any appointments for that lead
  - Add a timeline block to the expanded lead detail panel in `src/app/dashboard/page.tsx`, which today shows only `"3 sent · 1 pending"`
  - Repoint `src/components/dashboard/AiLogsPanel.tsx` at live data with an adapter from `direction` to its `client | ai` view model, and delete `src/data/mockBedrockLogs.ts` once nothing imports it
  - Make "Take Over Chat" set the assistant-disabled flag from task 1 so inbound messages are still logged but receive no generated reply
  - Write tests: history requires a session, model-generated messages are distinguishable, and a disabled assistant logs without replying
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [ ] 10. Verify the spec
  - Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`
  - Confirm `POST /api/ai/chat` without a chat session is refused, and that exceeding the request limit returns 429 with `Retry-After` and produces no Bedrock call
  - Drive a full conversation to a real booking against a Calendly test event type; confirm the appointment appears on the calendar, the `appointments` row exists, lead status is `appointment_set`, and an `appointment_booked` event was recorded
  - Ask the assistant to book a time it was never offered; confirm refusal and that no calendar event is created
  - Send a message instructing it to book for a different email; confirm the booking used the session lead's address
  - Unset `CALENDLY_API_TOKEN` and confirm the assistant still answers, offers the static link, and claims no booking
  - Confirm the dashboard shows the full history for that lead with model-generated messages distinguishable, and that "Take Over Chat" stops replies while still logging inbound messages
  - Text the Twilio number twice and confirm the second reply reflects the first message, which is the regression the empty history array caused
  - _Requirements: 2.1, 2.3, 3.1, 3.5, 4.7, 6.3, 6.4, 8.1, 8.5, 1.9_
