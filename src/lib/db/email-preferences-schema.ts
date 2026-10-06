/**
 * Email opt-out records.
 *
 * ## Why this is keyed on the address and not on the lead
 *
 * `leads.email` is deliberately not unique — the schema says so in a comment,
 * because a repeat client legitimately submits twice (buying now, selling in
 * three years). So one person can own several lead rows.
 *
 * A boolean on the lead row would therefore silence one record while the others
 * kept mailing. The person clicks unsubscribe, keeps receiving email, and
 * reports it as spam — which is the one outcome this whole feature exists to
 * prevent, and which would take Joey's lead follow-ups down with it by burning
 * the sending domain's reputation. Keying on the address makes the suppression
 * cover the human being rather than one of their rows.
 *
 * It also means an opt-out outlives the lead it came from, so deleting and
 * re-importing a past client does not quietly resurrect them onto the list.
 *
 * ## Why opting back in is a column rather than a delete
 *
 * A resubscribe could just drop the row. It does not, because the useful thing
 * to be able to prove later is the *history*: this address asked not to be
 * mailed on that date, and then opted back in on this one. If a complaint ever
 * lands, "we deleted the record" is a worse answer than a timestamped trail.
 *
 * Suppression is therefore "a row exists and `resubscribed_at` is null", not
 * "a row exists".
 *
 * ## Applying it
 *
 * DDL is in ./email-preferences-schema.sql and has NOT been applied, same
 * handoff as the chat tables. Nothing here modifies ./schema.ts.
 */

import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * How a suppression or resubscribe was recorded.
 *
 * A plain `varchar` rather than a pgEnum: these values are audit metadata that
 * will gain entries as new paths appear (a CSV importer, an SMS STOP keyword),
 * and Postgres cannot drop an enum value once added. The existing
 * `followUpStatusEnum` carries that warning already.
 *
 *  - `one_click`  — Gmail/Outlook's List-Unsubscribe POST (RFC 8058)
 *  - `link`       — the visitor clicked the link in the email footer
 *  - `manual`     — Joey or an operator suppressed it by hand
 *  - `form`       — resubscribe only: they submitted a form themselves
 *  - `assistant`  — resubscribe only: they gave their email in the chat
 */
export type OptOutSource = 'one_click' | 'link' | 'manual';
export type ResubscribeSource = 'form' | 'assistant' | 'manual';

export const emailOptOuts = pgTable(
  'email_opt_outs',
  {
    /**
     * The suppressed address, lowercased and trimmed.
     *
     * Normalisation is the primary key's job here. Email local-parts are
     * technically case-sensitive, but no provider in practice treats them that
     * way, and honouring the distinction would mean `Dana@x.com` still receives
     * mail after `dana@x.com` unsubscribed. See `normalizeEmail` in
     * ../services/email-preferences.ts — every read and write goes through it.
     */
    email: varchar('email', { length: 255 }).primaryKey(),

    optedOutAt: timestamp('opted_out_at').notNull().defaultNow(),
    source: varchar('source', { length: 32 }).notNull(),

    /** Null while suppressed. Set when they opt back in. */
    resubscribedAt: timestamp('resubscribed_at'),
    resubscribeSource: varchar('resubscribe_source', { length: 32 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Supports "who is currently suppressed", which is what an operator view
    // and any bulk send would ask for. The primary key already covers the
    // single-address lookup on the send path.
    index('email_opt_outs_resubscribed_at_idx').on(table.resubscribedAt),
  ],
);

export type EmailOptOut = typeof emailOptOuts.$inferSelect;
export type NewEmailOptOut = typeof emailOptOuts.$inferInsert;
