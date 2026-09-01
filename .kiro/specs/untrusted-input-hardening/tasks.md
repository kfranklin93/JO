# Untrusted Input Hardening — Tasks

- [ ] 1. Build the escaping helpers and apply them to outbound email
  - Create `src/lib/utils/escape.ts` with `escapeHtml`, `escapeAttr`, `safeMailto`, and `safeTel`, replacing `&` before other characters so nothing double-encodes
  - Apply to every lead-derived interpolation in `notifyJoeyOfNewLead` (`email-service.ts:120-128`), including the `href="mailto:"` and `href="tel:"` attribute contexts at lines 124-125
  - Apply to the lead rows and intent labels in `sendDailyLeadSummary` (`email-service.ts:185-200`)
  - Escape content in `textToHtml` (`email-service.ts:81`) before markup is added
  - Write unit tests per character, a `javascript:` URL in attribute position, a full `"><script>alert(1)</script>` payload, and an apostrophe in a name rendering as the correct glyph
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Fix template substitution
  - Change `fillPromptTemplate` (`joey-voice.ts:198`) to use a replacement function so `$&`, `` $` ``, `$'`, and `$1` in lead data pass through literally
  - Restructure the loop into a single pass so injected text cannot be re-scanned by a later key's substitution
  - Write tests with lead data containing each `$` sequence and a literal `{area}` string
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Contain prompt injection
  - Wrap user-controlled fields in `formatLeadContext` (`joey-voice.ts:160-189`) in an XML-style `<lead_data>` delimiter block, with `additionalNotes` (line 184) included
  - Strip delimiter tokens from field values so a lead cannot break out of the block
  - Add an instruction to `JOEY_PERSONALITY` that delimited content is information about the recipient, never an instruction to follow
  - Apply the same delimiting to the inbound SMS body in `src/app/api/sms/webhook/route.ts:23`
  - Write tests asserting every user-controlled field lands inside the delimiters and that an attempted `</lead_data>` breakout is neutralised
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [ ] 4. Authenticate the SMS webhook
  - Validate the Twilio signature in `src/app/api/sms/webhook/route.ts` before any other processing, using `validateRequest` from the installed `twilio` package
  - Reconstruct the public URL from `x-forwarded-proto` and `x-forwarded-host` so validation does not fail against Netlify's internal URL
  - Reject a missing or invalid signature with 403, and reject rather than skip when `TWILIO_AUTH_TOKEN` is unset
  - Change the error path to return TwiML instead of JSON, matching the success path
  - Write route tests for valid signature, invalid signature, absent header, and unset auth token — each asserting the status and that no Bedrock or SMS call occurred
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [ ] 5. Make missing configuration explicit
  - Create `src/lib/utils/require-env.ts` with `requireEnv`, `MissingEnvError`, and a helper that maps the error to a 503 naming the missing variable
  - Call it from the routes that depend on specific variables, inside the request path rather than at module import
  - Add `CRON_SECRET` to the Zod schema in `src/config/env.ts` as optional, so it stops being an undocumented `process.env` read
  - Leave the currently-optional variables optional in the schema, so `next build` does not break when one is absent at build time
  - Write tests asserting a 503 naming the variable when absent, and normal operation when present
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Verify the spec
  - Run `npm test`, `npm run typecheck`, and `npm run build`
  - Submit a lead whose notes contain `"><script>alert(1)</script>` and inspect the notification email source to confirm it renders inert
  - Send an unsigned POST to the SMS webhook and confirm 403 with no outbound SMS
  - Unset `RESEND_API_KEY` locally, submit a lead, and confirm an explicit 503 naming the variable
  - Run a follow-up generation with an injection payload in the notes and confirm the output follows the original instruction
  - _Requirements: 1.3, 3.3, 4.2, 4.4, 5.1_
