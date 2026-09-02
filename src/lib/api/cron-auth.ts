/**
 * Shared authentication for the scheduled-job endpoints.
 *
 * Both cron routes previously guarded themselves with:
 *
 *   if (cronSecret && authHeader !== `Bearer ${cronSecret}`) { return 401 }
 *
 * which fails **open**. When `CRON_SECRET` is unset the condition short-circuits
 * and every caller is treated as authorised. `CRON_SECRET` is optional in the
 * env schema and was absent from the deployment, so both endpoints were world-
 * accessible: anyone could drain the queue, send mail to every due lead, and
 * mark the rows sent.
 *
 * This module inverts that. No secret configured means no request is
 * authorised.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

/** Uniform rejection. Deliberately says nothing about why. */
function unauthorized(): NextResponse {
  // The reason is withheld so an unauthenticated caller cannot distinguish
  // "this deployment has no secret configured" from "your secret is wrong",
  // which would tell an attacker whether guessing is worthwhile.
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Compare two secrets without leaking their relationship through timing.
 *
 * Digests are compared rather than the raw strings so the buffers are always
 * the same length. `timingSafeEqual` throws on a length mismatch, and comparing
 * raw values would also leak the configured secret's length.
 */
function secretsMatch(provided: string, configured: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(configured).digest();
  return timingSafeEqual(a, b);
}

/**
 * Authorise a scheduled-job request.
 *
 * @returns `null` when the caller is authorised, or a 401 response to return
 * immediately. Callers must check for a response before doing any work.
 *
 * @example
 * const denied = requireCronAuth(request);
 * if (denied) return denied;
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const configured = env.CRON_SECRET;

  // Fail closed. An unset secret is a misconfiguration, and the safe response
  // to a misconfigured guard is to deny rather than to admit everyone.
  if (!configured || !configured.trim()) {
    console.error(
      'CRON_SECRET is not configured; rejecting scheduled-job request'
    );
    return unauthorized();
  }

  const header = request.headers.get('authorization');
  if (!header) {
    return unauthorized();
  }

  // Only the Bearer scheme is accepted, and the prefix is matched exactly.
  const expectedPrefix = 'Bearer ';
  if (!header.startsWith(expectedPrefix)) {
    return unauthorized();
  }

  const provided = header.slice(expectedPrefix.length);
  if (!provided) {
    return unauthorized();
  }

  return secretsMatch(provided, configured) ? null : unauthorized();
}
