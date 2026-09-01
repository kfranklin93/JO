# Untrusted Input Hardening — Design

## Overview

Three sinks receive untrusted text, and each needs a different treatment. HTML needs escaping. Prompts need delimiting, because escaping is meaningless to a language model. The webhook needs authentication, because the request itself is untrusted, not just its contents.

A fourth, smaller change makes missing configuration announce itself instead of degrading quietly.

## Architecture

```mermaid
graph TD
    L["Lead form input"] --> S1["escapeHtml / escapeAttr<br/>src/lib/utils/escape.ts"]
    L --> S2["delimited data block<br/>joey-voice.ts"]
    W["Twilio webhook POST"] --> V["validateRequest<br/>signature check"]
    V -->|invalid| F403["403, no side effects"]
    V -->|valid| S2
    S1 --> E["Resend HTML email"]
    S2 --> B["Bedrock prompt"]
    R["Route handlers"] --> RE["requireEnv()"]
    RE -->|missing| F503["503 naming the variable"]
```

## Components and Interfaces

### `src/lib/utils/escape.ts` (new)

Two functions, because HTML text context and HTML attribute context have different rules. `src/lib/utils/` currently holds only `cn.ts`, which is why there was nowhere central for this to live.

```ts
export function escapeHtml(value: unknown): string;
export function escapeAttr(value: unknown): string;
export function safeMailto(email: unknown): string;
export function safeTel(phone: unknown): string;
```

`escapeHtml` handles `&`, `<`, `>`, `"`, `'`. Ampersand must be replaced first or subsequent replacements double-encode.

`escapeAttr` additionally guards the attribute-value boundary. Requirement 1.7 (apostrophes in names must read correctly) is satisfied because entity-encoded characters render as the original glyph in an HTML mail client — the encoding is invisible to the reader.

`safeMailto` and `safeTel` address Requirement 1.4. Escaping alone does not prevent `href="javascript:..."`, since that string contains no characters that escaping touches. These helpers validate the value against an expected shape and return an empty string rather than a dangerous scheme. For `tel:`, this also strips formatting characters that are not valid dial characters.

### `src/lib/prompts/joey-voice.ts` (modified)

Two separate fixes.

**`fillPromptTemplate`** (line 198) changes from a string replacement to a function replacement:

```ts
filled = filled.replace(new RegExp(`\\{${key}\\}`, 'g'), () => value);
```

A replacement function receives no pattern interpretation, so `$&` and friends pass through literally. This also resolves Requirement 2.3 — a function replacement means injected text is never re-scanned by later iterations, because each `replace` call operates on the result of the previous one and the injected content contains no unreplaced placeholders that a later key would match. To be certain, the loop is restructured to perform a single pass over the template with one combined pattern rather than sequential passes per key.

**`formatLeadContext`** (lines 160-189) wraps user-controlled fields in a delimited block:

```
<lead_data>
Name: ...
Intent: ...
Notes: ...
</lead_data>
```

Delimiter choice: XML-style tags, because Anthropic models are specifically trained to respect them as structural boundaries. Requirement 3.4 is handled by stripping any occurrence of the delimiter tokens from field values before interpolation, so a lead cannot emit `</lead_data>` to break out.

`JOEY_PERSONALITY` gains an instruction that content inside `<lead_data>` is information about the recipient and never an instruction to follow. Placing this in the system prompt rather than the user turn is deliberate — it gives the constraint higher standing than the injected text.

### `src/app/api/sms/webhook/route.ts` (modified)

Signature validation runs before anything else:

```ts
const signature = request.headers.get('x-twilio-signature');
const url = reconstructPublicUrl(request);
const params = Object.fromEntries(await request.formData());
if (!signature || !validateRequest(authToken, signature, url, params)) {
  return twimlResponse('', 403);
}
```

`validateRequest` comes from the already-installed `twilio` package — no new dependency.

URL reconstruction matters (Requirement 4.6). Twilio signs the public URL it was configured with. Behind Netlify's proxy, `request.url` may carry an internal host, which would make every signature fail. The reconstruction prefers `x-forwarded-proto` and `x-forwarded-host`, falling back to `host`, and drops the query string only if Twilio's configured URL omits it.

Requirement 4.8 — a missing `TWILIO_AUTH_TOKEN` rejects rather than skipping validation. This is the fail-closed inversion of the pattern found in the cron routes, and it is the whole point.

The error path changes from `NextResponse.json` to a TwiML response for consistency (Requirement 4.7). Twilio expects TwiML; a JSON error body is logged by Twilio as a malformed response.

### `src/config/env.ts` (modified) and `src/lib/utils/require-env.ts` (new)

The schema stays permissive. Making `DATABASE_URL` or `RESEND_API_KEY` required would move the failure to `next build`, because `env.ts` parses at module import (line 44) and is imported transitively by route modules. That trades a silent runtime failure for a broken deploy, which is worse.

Instead, an assertion helper runs at request time:

```ts
export class MissingEnvError extends Error {
  constructor(public readonly variables: string[]) { ... }
}
export function requireEnv(...names: RequiredEnvName[]): void;
export function envErrorResponse(error: unknown): NextResponse | null;
```

Routes call `requireEnv('RESEND_API_KEY')` inside their `try`, and the catch maps `MissingEnvError` to a 503 naming the variable. This satisfies Requirements 5.1, 5.2, and 5.5 without touching build behaviour.

`CRON_SECRET` is added to the Zod schema as `.optional()` (Requirement 5.3, 5.4). It becomes *required at request time* in Spec 4 Task 3 via `requireEnv`, which is the correct place for that change since that is where fail-closed cron auth is implemented.

## Error Handling

| Failure | Response | Side effects |
|---|---|---|
| Missing/invalid Twilio signature | 403 TwiML | None — rejected before Bedrock or SMS |
| `TWILIO_AUTH_TOKEN` unset | 403 TwiML | None |
| Missing required env var | 503 naming the variable | None |
| Handler error after valid signature | TwiML error response | Logged |

## Testing Strategy

- **Escaping**: unit tests per character (`&`, `<`, `>`, `"`, `'`), a `javascript:` URL in attribute position, a full `"><script>` payload, ampersand-first ordering to prove no double-encoding, and an apostrophe in a name rendering correctly
- **Template filling**: lead data containing `$&`, `` $` ``, `$'`, `$1`, and a literal `{area}` string
- **Delimiting**: every user-controlled field appears inside the delimiter block; an attempted `</lead_data>` breakout is neutralised
- **Webhook**: valid signature computed with a known test token, invalid signature, absent header, unset auth token. Each asserts both the status and that no Bedrock or SMS call occurred — the absence of side effects is the actual security property, so it is asserted directly via mock call counts.
- **requireEnv**: a route returns 503 naming the variable when it is absent, and proceeds when present

Prompt injection resistance (Requirement 3.3) is verified structurally — that delimiters and the system instruction are present — rather than by asserting model output, which is non-deterministic. The behavioural check is a manual demo step.
