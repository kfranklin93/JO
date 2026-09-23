/**
 * One-off repair for follow-ups the cron route failed with 'Lead not found'
 * while their lead existed the whole time.
 *
 * Run:  node --env-file=.env.local scripts/repair-lead-not-found-follow-ups.mjs
 * Apply: same command with --apply
 *
 * ## What went wrong
 *
 * `claimDueFollowUps` asserted raw driver rows were the camelCase `FollowUp`
 * type. `db.execute` returns database column names, so `RETURNING *` gave
 * `lead_id`, the route read `leadId`, got `undefined`, looked leads up by
 * `undefined`, matched nothing, and abandoned every claimed row as
 * 'Lead not found'. Fixed in follow-up-mapping.ts; this script repairs the rows
 * that fix arrived too late for.
 *
 * ## Why it is narrow
 *
 * 'Lead not found' is a real outcome — a lead deleted between scheduling and
 * sending genuinely produces it, and those rows are correctly failed and must
 * stay failed. The only rows this touches are the ones where the reason is
 * contradicted by the data: the lead row is still there. Rows are matched by
 * joining to `leads`, so the contradiction is established per row rather than
 * assumed from a timestamp window.
 *
 * Rows that are merely `scheduled` need nothing. They were never claimed, or were
 * claimed and requeued, and the corrected code will process them on the next run.
 *
 * ## Why it resets attempts to 0
 *
 * `attempts` is meant to bound retries against a genuinely undeliverable address.
 * These rows spent their budget on a read bug, not on a delivery that was tried
 * and refused, so carrying the count forward would shorten the retry budget of a
 * send that has never actually been attempted.
 *
 * `scheduled_for` is left alone. The touchpoint is overdue and the next cron run
 * should pick it up immediately; rescheduling would silently move the date Joey's
 * dashboard shows.
 *
 * Read-only unless `--apply` is passed. Prints nothing secret — the connection
 * string is never echoed, and lead emails are shown because identifying which
 * people are about to be mailed is the point of the dry run.
 */

import { neon } from '@neondatabase/serverless';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

const APPLY = process.argv.includes('--apply');

/** The reason string the route writes, matched exactly rather than by pattern. */
const REASON = 'Lead not found';

function heading(text) {
  console.log(`\n${BOLD}${text}${OFF}`);
}

function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      `${RED}DATABASE_URL is not set.${OFF}\n` +
        'Run with: node --env-file=.env.local scripts/repair-lead-not-found-follow-ups.mjs'
    );
    process.exit(1);
  }

  return run(neon(process.env.DATABASE_URL));
}

async function run(sql) {
  console.log(
    `${BOLD}Repairing follow-ups failed with '${REASON}' whose lead exists${OFF}`
  );
  console.log(
    `${DIM}mode: ${APPLY ? 'APPLY — rows will be written' : 'dry run — no writes'}${OFF}`
  );

  // The join is the whole check: a row only qualifies if `leads` still holds the
  // lead the follow-up points at, which is what makes the stored reason false.
  const repairable = await sql`
    SELECT f.id,
           f.lead_id,
           f.template_type,
           f.status,
           f.attempts,
           f.scheduled_for,
           f.failed_at,
           l.email AS lead_email
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    WHERE f.status = 'failed'
      AND f.failure_reason = ${REASON}
    ORDER BY f.scheduled_for ASC
  `;

  // Rows where the reason is true. Reported so the dry run distinguishes "we are
  // leaving these alone deliberately" from "we did not look".
  const genuine = await sql`
    SELECT count(*)::int AS count
    FROM follow_ups f
    WHERE f.status = 'failed'
      AND f.failure_reason = ${REASON}
      AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = f.lead_id)
  `;

  // Not repaired — nothing is wrong with a scheduled row — but counted, because
  // these are the sends the fix is about to release and the number is worth
  // seeing before the next cron run mails them. Split by due-ness: the due figure
  // is what the next run will claim immediately, and it should match `remaining`
  // in the last cron response.
  const pending = await sql`
    SELECT count(*) FILTER (WHERE f.scheduled_for <= now())::int AS due,
           count(*) FILTER (WHERE f.scheduled_for > now())::int AS later
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    WHERE f.status = 'scheduled'
  `;

  heading(`Would reset ${repairable.length} row(s)`);

  if (repairable.length === 0) {
    console.log(`${DIM}  nothing to repair${OFF}`);
  } else {
    for (const row of repairable) {
      console.log(
        `  ${row.id}  ${String(row.template_type).padEnd(10)} ` +
          `attempts ${row.attempts} -> 0  ` +
          `due ${new Date(row.scheduled_for).toISOString()}  ${row.lead_email}`
      );
    }

    const byTemplate = repairable.reduce((counts, row) => {
      counts[row.template_type] = (counts[row.template_type] ?? 0) + 1;
      return counts;
    }, {});

    heading('Change to be applied');
    console.log(
      `${DIM}  status 'failed' -> 'scheduled', attempts -> 0, ` +
        `failure_reason -> NULL, failed_at -> NULL${OFF}`
    );
    console.log(
      `${DIM}  by touchpoint: ${Object.entries(byTemplate)
        .map(([type, count]) => `${type} ${count}`)
        .join(', ')}${OFF}`
    );
    console.log(
      `${DIM}  distinct leads: ${new Set(repairable.map((row) => row.lead_id)).size}${OFF}`
    );
  }

  heading('Left untouched');
  console.log(
    `  ${genuine[0].count} row(s) failed with '${REASON}' whose lead really is gone ` +
      `${DIM}— correctly failed${OFF}`
  );
  console.log(
    `  ${pending[0].due} row(s) already 'scheduled' and due now ` +
      `${DIM}— the next cron run claims these${OFF}`
  );
  console.log(
    `  ${pending[0].later} row(s) 'scheduled' for a future date ` +
      `${DIM}— untouched, and no longer at risk${OFF}`
  );

  if (!APPLY) {
    console.log(
      `\n${YELLOW}Dry run. Nothing was written.${OFF}\n` +
        `${DIM}Re-run with --apply to reset the ${repairable.length} row(s) above.${OFF}`
    );
    return;
  }

  if (repairable.length === 0) return;

  // One statement, so the repair cannot half-apply. The predicate is re-evaluated
  // here rather than trusting the ids read above, in case a lead was deleted
  // between the two queries — that row's reason would then be true and it must
  // stay failed.
  const updated = await sql`
    UPDATE follow_ups f
    SET status = 'scheduled',
        attempts = 0,
        failure_reason = NULL,
        failed_at = NULL,
        updated_at = now()
    WHERE f.status = 'failed'
      AND f.failure_reason = ${REASON}
      AND EXISTS (SELECT 1 FROM leads l WHERE l.id = f.lead_id)
    RETURNING f.id
  `;

  console.log(
    `\n${GREEN}Reset ${updated.length} row(s) to 'scheduled'.${OFF}\n` +
      `${DIM}The next cron run will claim and send them.${OFF}`
  );
}

main().catch((error) => {
  console.error(`\n${RED}Repair failed:${OFF} ${error.message}`);
  process.exit(1);
});
