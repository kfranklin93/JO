/**
 * Bedrock readiness diagnostic.
 *
 * Run:  npm run check:bedrock
 * (equivalently: node --env-file=.env.local scripts/check-bedrock.mjs)
 *
 * Answers one question — "can this project actually call Claude right now?" —
 * and when the answer is no, says which setup step is missing rather than
 * leaving you to decode an AWS exception name.
 *
 * Deliberately dependency-free beyond the AWS SDK the project already has.
 * `tsx` is not installed, so the `test:bedrock` command in
 * AWS_BEDROCK_INTEGRATION_GUIDE.md does not run; Node 24's --env-file covers it.
 *
 * Never prints secret values. The access key id is shown as its last four
 * characters only, because that is enough to tell two keys apart, and the secret
 * is only ever reported as present or absent.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

const ok = (m) => console.log(`${GREEN}  PASS${OFF}  ${m}`);
const bad = (m) => console.log(`${RED}  FAIL${OFF}  ${m}`);
const warn = (m) => console.log(`${YELLOW}  WARN${OFF}  ${m}`);
const info = (m) => console.log(`${DIM}        ${m}${OFF}`);
const heading = (m) => console.log(`\n${BOLD}${m}${OFF}`);

/** Turn a base model id into its US cross-region inference profile id. */
function toInferenceProfile(modelId) {
  if (/^(us|eu|apac|global)\./.test(modelId)) return null;
  return `us.${modelId}`;
}

/**
 * Whether a value is still the placeholder from the setup guide.
 *
 * Worth detecting separately from "wrong credentials": the remedy is completely
 * different (create an AWS account vs. rotate a key), and a copied .env.example
 * is the single most likely state for a project that has never called Bedrock.
 */
function looksLikePlaceholder(value) {
  return /your_|_here$|xxxx|placeholder|changeme|<.*>/i.test(value);
}

/**
 * Shape checks for AWS long-term credentials.
 *
 * Access key ids are 20 characters and begin AKIA (IAM user) or ASIA
 * (temporary/STS). Secret access keys are 40 characters. Checking locally turns
 * an opaque 403 from AWS into a specific, immediate answer.
 */
function credentialShapeProblems(keyId, secret) {
  const problems = [];

  if (looksLikePlaceholder(keyId)) {
    problems.push('AWS_ACCESS_KEY_ID is still a placeholder, not a real key');
  } else if (keyId.length !== 20) {
    problems.push(`AWS_ACCESS_KEY_ID is ${keyId.length} characters; real ones are 20`);
  } else if (!/^(AKIA|ASIA)/.test(keyId)) {
    problems.push('AWS_ACCESS_KEY_ID does not begin with AKIA or ASIA');
  }

  if (looksLikePlaceholder(secret)) {
    problems.push('AWS_SECRET_ACCESS_KEY is still a placeholder, not a real key');
  } else if (secret.length !== 40) {
    problems.push(`AWS_SECRET_ACCESS_KEY is ${secret.length} characters; real ones are 40`);
  }

  return problems;
}

/** One minimal Converse round trip. Returns a discriminated result. */
async function tryConverse(client, modelId) {
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: 'Reply with the single word OK.' }] }],
        inferenceConfig: { maxTokens: 16, temperature: 0 },
      }),
    );

    const text = response.output?.message?.content?.[0]?.text?.trim() ?? '';
    return { ok: true, text, usage: response.usage };
  } catch (error) {
    return {
      ok: false,
      name: error?.name ?? 'UnknownError',
      message: error?.message ?? String(error),
      status: error?.$metadata?.httpStatusCode,
    };
  }
}

/** Map an AWS exception onto a specific, actionable next step. */
function explain(failure, modelId, region) {
  const { name, message } = failure;
  const onDemandUnsupported = /on-demand throughput isn.?t supported/i.test(message);

  if (onDemandUnsupported) {
    return {
      cause: 'This model cannot be invoked by its bare model id.',
      fix:
        `Use the cross-region inference profile id instead: ${toInferenceProfile(modelId) ?? 'us.<model-id>'}\n` +
        `        Set AWS_BEDROCK_MODEL_ID to that value in .env.local and in Netlify.`,
    };
  }

  switch (name) {
    case 'AccessDeniedException':
      return {
        cause: 'Credentials are valid but not allowed to invoke this model.',
        fix:
          'Two things to check, in this order:\n' +
          `        1. Bedrock console → Model access → confirm this model shows "Access granted" in ${region}\n` +
          '        2. The IAM user/role needs bedrock:InvokeModel on this model resource',
      };
    case 'UnrecognizedClientException':
    case 'InvalidSignatureException':
      return {
        cause: 'AWS rejected the credentials themselves.',
        fix: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are wrong, rotated, or have stray whitespace.',
      };
    case 'ValidationException':
      return {
        cause: 'The request shape or the model id is not valid for this region.',
        fix:
          `Confirm "${modelId}" exists in ${region}. Claude 3.5 Sonnet v2 is not offered in every region —\n` +
          '        a US inference profile id (us.*) avoids the problem by routing across US regions.',
      };
    case 'ResourceNotFoundException':
      return {
        cause: 'No such model or inference profile in this region.',
        fix: `Check the exact id in the Bedrock console for ${region}.`,
      };
    case 'ThrottlingException':
      return {
        cause: 'Rate limited.',
        fix: 'Credentials and access are fine. Retry shortly; consider a quota increase for sustained load.',
      };
    case 'ServiceQuotaExceededException':
      return {
        cause: 'Account quota exceeded.',
        fix: 'Request a quota increase in Service Quotas for Bedrock.',
      };
    case 'TimeoutError':
    case 'NetworkingError':
      return {
        cause: 'Could not reach the Bedrock endpoint.',
        fix: 'Network or proxy issue rather than configuration.',
      };
    default:
      return {
        cause: `Unrecognised error: ${name}`,
        fix: 'Full message printed above.',
      };
  }
}

async function main() {
  console.log(`${BOLD}Bedrock readiness check${OFF}`);

  // ── Configuration ────────────────────────────────────────────────────────
  heading('1. Configuration');

  const region = process.env.AWS_REGION;
  const keyId = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const modelId = process.env.AWS_BEDROCK_MODEL_ID;

  let fatal = false;

  if (region) ok(`AWS_REGION = ${region}`);
  else {
    bad('AWS_REGION is not set');
    fatal = true;
  }

  if (keyId) ok(`AWS_ACCESS_KEY_ID present (ends ...${keyId.slice(-4)})`);
  else {
    bad('AWS_ACCESS_KEY_ID is not set');
    fatal = true;
  }

  if (secret) ok(`AWS_SECRET_ACCESS_KEY present (${secret.length} chars, value withheld)`);
  else {
    bad('AWS_SECRET_ACCESS_KEY is not set');
    fatal = true;
  }

  if (modelId) {
    ok(`AWS_BEDROCK_MODEL_ID = ${modelId}`);
    if (toInferenceProfile(modelId)) {
      warn('This is a bare model id, not an inference profile id.');
      info('Recent Claude models reject bare ids. If step 2 fails, that is almost certainly why.');
    }
  } else {
    bad('AWS_BEDROCK_MODEL_ID is not set');
    fatal = true;
  }

  for (const [name, value] of [
    ['AWS_ACCESS_KEY_ID', keyId],
    ['AWS_SECRET_ACCESS_KEY', secret],
    ['AWS_BEDROCK_MODEL_ID', modelId],
    ['AWS_REGION', region],
  ]) {
    if (value && value !== value.trim()) {
      bad(`${name} has leading or trailing whitespace — this breaks request signing`);
      fatal = true;
    }
  }

  // Shape-check before spending a network round trip on credentials that cannot
  // possibly work.
  if (keyId && secret) {
    const problems = credentialShapeProblems(keyId, secret);
    for (const problem of problems) bad(problem);

    if (problems.length > 0) {
      const placeholders =
        looksLikePlaceholder(keyId) || looksLikePlaceholder(secret);

      heading('Result');
      bad('Credentials are not usable, so no call was attempted.');

      if (placeholders) {
        console.log(
          `\n${YELLOW}  Cause${OFF}  .env.local still holds the example placeholders. ` +
            'No AWS credentials have been added yet.',
        );
        console.log(
          `${GREEN}  Fix${OFF}    Work through the Bedrock setup walkthrough: create the AWS account,\n` +
            '         request model access, create an IAM user with a scoped invoke policy,\n' +
            '         then replace these two values in .env.local.',
        );
      } else {
        console.log(
          `\n${YELLOW}  Cause${OFF}  The values are malformed rather than merely rejected.`,
        );
        console.log(
          `${GREEN}  Fix${OFF}    Re-copy them from the IAM access key screen. ` +
            'A truncated paste is the usual reason.',
        );
      }

      process.exit(1);
    }

    ok('Credential shape looks valid (length and prefix)');
  }

  if (fatal) {
    heading('Result');
    bad('Configuration incomplete. Fix the above before re-running.');
    info('Values are read from .env.local via node --env-file.');
    process.exit(1);
  }

  // ── Live call ────────────────────────────────────────────────────────────
  heading('2. Live model invocation (Converse API)');
  info(`Calling ${modelId} in ${region}...`);

  const client = new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  });

  let result = await tryConverse(client, modelId);
  let workingModelId = modelId;

  if (result.ok) {
    ok(`Model responded: "${result.text}"`);
    if (result.usage) {
      info(`Tokens — in: ${result.usage.inputTokens}, out: ${result.usage.outputTokens}`);
    }
  } else {
    bad(`${result.name}${result.status ? ` (HTTP ${result.status})` : ''}`);
    info(result.message);

    const { cause, fix } = explain(result, modelId, region);
    console.log(`\n${YELLOW}  Cause${OFF}  ${cause}`);
    console.log(`${GREEN}  Fix${OFF}    ${fix}`);

    // If a bare id failed, try the inference profile so the report is conclusive
    // rather than leaving the operator to guess at the next attempt.
    const profileId = toInferenceProfile(modelId);
    if (profileId) {
      heading('3. Retrying with the inference profile id');
      info(`Calling ${profileId} in ${region}...`);
      const retry = await tryConverse(client, profileId);

      if (retry.ok) {
        ok(`Inference profile works: "${retry.text}"`);
        workingModelId = profileId;
        console.log(
          `\n${GREEN}${BOLD}  Action${OFF} Set AWS_BEDROCK_MODEL_ID=${profileId}${OFF}`,
        );
        info('Change it in .env.local and in Netlify, then redeploy.');
      } else {
        bad(`Inference profile also failed: ${retry.name}`);
        info(retry.message);
        const second = explain(retry, profileId, region);
        console.log(`\n${YELLOW}  Cause${OFF}  ${second.cause}`);
        console.log(`${GREEN}  Fix${OFF}    ${second.fix}`);
      }
    }
  }

  // ── Tool support ─────────────────────────────────────────────────────────
  // The scheduling assistant depends on tool use, so a plain text reply is not
  // sufficient evidence that the model is usable for this project.
  const invocationWorked = result.ok || workingModelId !== modelId;

  if (invocationWorked) {
    heading(`${result.ok ? '3' : '4'}. Tool use support`);
    try {
      const response = await client.send(
        new ConverseCommand({
          modelId: workingModelId,
          messages: [
            { role: 'user', content: [{ text: 'What times are free on Tuesday? Use the tool.' }] },
          ],
          inferenceConfig: { maxTokens: 256, temperature: 0 },
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: 'get_availability',
                  description: 'Look up open appointment slots in a date range.',
                  inputSchema: {
                    json: {
                      type: 'object',
                      properties: {
                        fromDate: { type: 'string', description: 'ISO date' },
                        toDate: { type: 'string', description: 'ISO date' },
                      },
                      required: ['fromDate', 'toDate'],
                    },
                  },
                },
              },
            ],
          },
        }),
      );

      if (response.stopReason === 'tool_use') {
        ok('Model requested the tool — tool use is available');
        info('This is the mechanism the scheduling assistant is built on.');
      } else {
        warn(`Model replied without calling the tool (stopReason: ${response.stopReason})`);
        info('Not necessarily a failure; the call was accepted, so toolConfig is supported.');
      }
    } catch (error) {
      bad(`Tool use rejected: ${error?.name}`);
      info(error?.message ?? String(error));
      info('Availability and booking tools cannot work against this model.');
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  heading('Result');
  if (invocationWorked) {
    ok('Bedrock is reachable and this model is usable.');
    if (workingModelId !== modelId) {
      warn(`But update AWS_BEDROCK_MODEL_ID to ${workingModelId} first.`);
    }
    info('Local only. Netlify needs the same variables set, plus a redeploy.');
    process.exit(0);
  } else {
    bad('Bedrock is not usable yet. See the fix above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${RED}Unexpected failure${OFF}`);
  console.error(error);
  process.exit(1);
});
