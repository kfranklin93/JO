# Untrusted Input Hardening — Requirements

## Introduction

Once the lead forms are connected (Spec 1), visitor-supplied text reaches three destinations that currently treat it as trusted: HTML email sent to Joey, prompts sent to Claude, and an unauthenticated SMS webhook. This spec makes each of those paths treat inbound text as data.

The ordering matters. None of these are reachable today because the forms don't submit. Spec 1 makes them reachable, so this spec follows immediately behind it and must land before the drip goes live in Spec 4.

## Current state

Verified by reading source:

- `src/lib/services/email-service.ts:120-128` interpolates lead fields straight into HTML, including two attribute contexts: `href="mailto:${lead.email}"` (line 124) and `href="tel:${lead.phone}"` (line 125). `sendDailyLeadSummary` does the same across lines 185-200. `textToHtml` (line 81) wraps generated content, itself derived from lead input, with no escaping.
- `src/lib/prompts/joey-voice.ts:160-189` (`formatLeadContext`) concatenates raw lead fields into the prompt, including `Notes: ${lead.additionalNotes}` at line 184. There are no delimiters and no instruction marking the content as untrusted.
- `src/lib/prompts/joey-voice.ts:198` calls `filled.replace(new RegExp(...), value)` with a user-controlled `value` as the replacement string, so `$&`, `` $` ``, `$'`, and `$1` in lead data expand as replacement patterns instead of appearing literally.
- `src/app/api/sms/webhook/route.ts` reads `request.formData()` with no signature check. It then embeds the raw inbound message body into a Bedrock prompt (line 23) and sends an outbound SMS to the `From` value (line 29). The success path returns TwiML; the error path returns JSON, which is inconsistent.
- `src/config/env.ts:44` runs `envSchema.parse()` at module top level. `DATABASE_URL`, `RESEND_API_KEY`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` are all `.optional()`. `JOEY_EMAIL` defaults to `joey@example.com` and `JOEY_PHONE` to `(770) 555-0100`. A half-configured deploy boots cleanly and fails silently per request.
- `CRON_SECRET` is absent from the env schema entirely; both cron routes read `process.env.CRON_SECRET` directly.

## Requirements

### Requirement 1 — HTML-safe email rendering

**User Story:** As Joey, I want lead text rendered inert in my email client, so that a submission cannot inject markup or a malicious link into my inbox.

#### Acceptance Criteria

1. WHEN lead-supplied text is interpolated into email HTML THEN it SHALL be escaped
2. WHEN lead-supplied text is interpolated into an HTML attribute value THEN it SHALL be escaped for attribute context, including quote characters
3. WHEN a lead submits `"><script>alert(1)</script>` in any field THEN the rendered email SHALL display it as literal text and SHALL NOT execute or produce markup
4. WHEN an email address or phone number is placed into an `href` THEN a scheme other than `mailto:` or `tel:` SHALL NOT be produced
5. WHEN the daily summary email renders lead rows THEN every lead-derived cell SHALL be escaped
6. WHEN generated email content passes through `textToHtml` THEN it SHALL be escaped before markup is added
7. WHEN escaping is applied THEN legitimate characters such as apostrophes in names SHALL still render correctly and SHALL NOT appear as entity codes to the reader

### Requirement 2 — Correct template substitution

**User Story:** As a developer, I want template filling to be literal, so that lead text containing `$` sequences is not silently corrupted.

#### Acceptance Criteria

1. WHEN lead data containing `$&`, `` $` ``, `$'`, or `$1` is substituted into a prompt template THEN the output SHALL contain those characters literally
2. WHEN a template placeholder is replaced THEN the replacement SHALL NOT be interpreted as a regular-expression replacement pattern
3. WHEN lead data itself contains a string resembling a placeholder such as `{area}` THEN a later substitution pass SHALL NOT substitute into the injected text

### Requirement 3 — Prompt injection containment

**User Story:** As Joey, I want AI-generated email to follow my instructions rather than a lead's, so that nothing goes out under my name that I did not intend.

#### Acceptance Criteria

1. WHEN lead-supplied fields are placed into a prompt THEN they SHALL be enclosed in explicit delimiters that mark the boundary of untrusted content
2. WHEN the prompt is constructed THEN it SHALL instruct the model to treat the delimited block as data and not as instructions
3. WHEN a lead submits text attempting to redirect the model, such as instructions to change the message subject or content THEN the generated output SHALL follow the original system instruction
4. IF lead-supplied content contains the delimiter sequence itself THEN the delimiter SHALL be neutralised so the boundary cannot be escaped
5. WHEN inbound SMS text is placed into a prompt THEN it SHALL receive the same delimiting treatment as form-supplied text

### Requirement 4 — Authenticated SMS webhook

**User Story:** As Joey, I want only Twilio to be able to invoke the SMS webhook, so that nobody can run up my AI bill or relay messages through my number.

#### Acceptance Criteria

1. WHEN a request arrives at the SMS webhook THEN its Twilio signature SHALL be validated before any other processing
2. WHEN the signature header is absent THEN the request SHALL be rejected with HTTP 403
3. WHEN the signature is present but does not validate THEN the request SHALL be rejected with HTTP 403
4. WHEN a request is rejected THEN no Bedrock call and no outbound SMS SHALL occur
5. WHEN the signature validates THEN the request SHALL be processed and a valid TwiML response returned
6. WHERE the application runs behind a proxy THE URL used for signature validation SHALL be reconstructed from the forwarded protocol and host headers, so validation does not fail against the internal URL
7. WHEN the handler encounters an error after a valid signature THEN it SHALL respond with TwiML, consistent with the success path, rather than JSON
8. IF the Twilio auth token is not configured THEN the webhook SHALL reject requests rather than skip validation

### Requirement 5 — Explicit configuration failure

**User Story:** As a developer, I want missing configuration to name itself, so that a half-configured deployment is obvious rather than silently degraded.

#### Acceptance Criteria

1. WHEN a route requires an environment variable that is not set THEN the response SHALL be HTTP 503 identifying the missing variable by name
2. WHEN `RESEND_API_KEY` is absent and an email send is attempted THEN the failure SHALL be explicit rather than a `console.error` behind a `false` return
3. WHEN `CRON_SECRET` is referenced THEN it SHALL be part of the validated env schema rather than a direct `process.env` read
4. WHEN the env schema is evaluated THEN currently-optional variables SHALL remain optional in the schema, so that `next build` does not fail when a variable is absent at build time
5. WHEN a required variable is missing THEN the check SHALL occur at request time, not at module import time

## Out of scope

- Rate limiting the SMS webhook beyond signature validation
- Persisting SMS conversation history (`conversations` table remains unwritten)
- Redacting PII before it is sent to Bedrock, or a retention policy for `conversations.promptUsed`
- An unsubscribe link in follow-up email (CAN-SPAM exposure is noted but deferred)
- Making `DATABASE_URL` or the AWS credentials required in the Zod schema
