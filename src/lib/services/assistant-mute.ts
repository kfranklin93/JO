/**
 * Reading and setting the assistant's mute switches.
 *
 * ## The read fails closed
 *
 * {@link assistantMuteState} reports the assistant muted when it cannot read
 * the table. That is the opposite of how the chat store degrades, and the
 * asymmetry is the point.
 *
 * Joey reaches for this switch because the assistant said something he did not
 * want said. Ignoring that instruction because of a database blip means it
 * keeps saying it — the exact outcome he was trying to stop. The other
 * direction costs a visitor a generated reply and gives them an honest message
 * about Joey following up personally, which is true and recoverable.
 *
 * So: unreadable means silent. Note this only bites once a conversation has a
 * lead attached, plus the single global lookup, so a failure does not silence
 * anonymous visitors by surprise — it silences everyone, loudly, in the logs.
 *
 * ## Writes are for the dashboard only
 *
 * The setters are reached from session-verified dashboard routes. They throw on
 * failure rather than reporting a boolean, because a switch that silently fails
 * to flip is worse than an error: Joey would believe the assistant was off.
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { assistantMutes, GLOBAL_SCOPE } from '@/lib/db/assistant-mute-schema';

/** Shape of a uuid, matching the CHECK constraint on the table. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The scope that silences the assistant everywhere. */
export function globalScope(): string {
  return GLOBAL_SCOPE;
}

/**
 * The scope for one lead.
 *
 * @throws When `leadId` is not a uuid. The table's CHECK constraint would
 *   reject it anyway; failing here names the caller instead of surfacing as an
 *   opaque constraint violation.
 */
export function leadScope(leadId: string): string {
  const scope = leadId.trim().toLowerCase();
  if (!UUID.test(scope)) {
    throw new Error(`leadScope requires a lead uuid, received "${leadId}"`);
  }
  return scope;
}

/** Why the assistant is staying quiet, or that it is not. */
export interface MuteState {
  muted: boolean;
  /** Which switch did it: the global one, this lead's, or neither. */
  reason: 'global' | 'lead' | 'unavailable' | null;
}

const NOT_MUTED: MuteState = { muted: false, reason: null };

/**
 * Whether the assistant may reply, and why not if it may not.
 *
 * One query covers both switches. Global wins when both are set, because that
 * is the more emphatic instruction and the more useful thing to report.
 *
 * @param leadId - The lead this conversation belongs to, when known. Anonymous
 *   conversations pass nothing and are governed by the global switch alone.
 */
export async function assistantMuteState(leadId?: string): Promise<MuteState> {
  const scopes = [GLOBAL_SCOPE];
  if (leadId && UUID.test(leadId)) scopes.push(leadId.toLowerCase());

  try {
    const rows = await db
      .select({ scope: assistantMutes.scope })
      .from(assistantMutes)
      .where(inArray(assistantMutes.scope, scopes));

    const found = new Set(rows.map((row) => row.scope));

    if (found.has(GLOBAL_SCOPE)) return { muted: true, reason: 'global' };
    if (leadId && found.has(leadId.toLowerCase())) {
      return { muted: true, reason: 'lead' };
    }
    return NOT_MUTED;
  } catch (err) {
    // Fail closed — see the module note. Logged at error level because a
    // silent assistant with no explanation is the worst of both worlds.
    console.error(
      '[assistant-mute] could not read the mute table, so the assistant is ' +
        'staying quiet. If the table does not exist yet, apply ' +
        'src/lib/db/assistant-mute-schema.sql:',
      err,
    );
    return { muted: true, reason: 'unavailable' };
  }
}

/**
 * Silence the assistant for a scope.
 *
 * Idempotent: muting an already-muted scope refreshes the note and the
 * timestamp rather than failing, so the dashboard does not need to know the
 * current state before acting.
 */
export async function mute(scope: string, note?: string): Promise<void> {
  const now = new Date();
  await db
    .insert(assistantMutes)
    .values({ scope, mutedAt: now, ...(note ? { note } : {}) })
    .onConflictDoUpdate({
      target: assistantMutes.scope,
      set: { mutedAt: now, updatedAt: now, ...(note ? { note } : {}) },
    });
}

/** Let the assistant reply again for a scope. Unmuting an unmuted scope is a no-op. */
export async function unmute(scope: string): Promise<void> {
  await db.delete(assistantMutes).where(eq(assistantMutes.scope, scope));
}

/** A muted scope as the dashboard lists it. */
export interface MuteRecord {
  scope: string;
  mutedAt: Date;
  note: string | null;
}

/**
 * Every active mute.
 *
 * Small by nature — one global row plus however many leads Joey has silenced —
 * so it is returned whole rather than paged.
 */
export async function listMutes(): Promise<MuteRecord[]> {
  const rows = await db
    .select({
      scope: assistantMutes.scope,
      mutedAt: assistantMutes.mutedAt,
      note: assistantMutes.note,
    })
    .from(assistantMutes)
    .orderBy(assistantMutes.scope);

  return rows;
}

/** How many leads are individually muted, excluding the global switch. */
export async function countLeadMutes(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMutes)
    .where(sql`${assistantMutes.scope} <> ${GLOBAL_SCOPE}`);

  return row?.count ?? 0;
}

// Re-exported so callers do not need a second import for the literal.
export { GLOBAL_SCOPE };
