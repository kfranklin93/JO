'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Textarea';
import { leadStatusLabel } from '@/lib/validation/lead-status';
import {
  SPREADSHEET_STATUS_MAP,
  type ImportPlan,
} from '@/lib/services/lead-import-plan';

/**
 * Bulk import of Joey's client database — a `.csv` file or a block of cells
 * pasted straight out of a spreadsheet.
 *
 * ## Why there are three screens and not one button
 *
 * `paste` → `preview` → `done`. The middle one is the reason this component
 * exists in this shape. An import that writes 200 contacts the moment a file is
 * chosen gives nobody a chance to notice that the status column was misread or
 * that half the list is already in the table, and there is no undo. So the
 * server is asked what *would* happen first, by the same code path that does
 * it, and the answer is rendered in full: every row that will be created, every
 * row that will be skipped with the reason and the row it collides with, and
 * every row that cannot be read with its line number and what is wrong with it.
 *
 * The `done` screen reports the same three groups as facts rather than
 * intentions, plus the follow-up count — which is zero, stated out loud,
 * because "this import queued no marketing email" is the single most important
 * thing about it and a silent zero is indistinguishable from a bug.
 */

export interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a committed import, so the caller can reload the table. */
  onImported: (summary: { createdCount: number }) => void;
}

interface ImportedLead {
  id: string;
  line: number;
  fullName: string;
  email: string;
  status: string;
}

interface CommitResponse {
  committed: true;
  wrote: boolean;
  batchId: string;
  plan: ImportPlan;
  created: ImportedLead[];
  createdCount: number;
  followUpsCreated: number;
}

type Stage = 'paste' | 'preview' | 'done';

const DELIMITER_LABEL: Record<string, string> = {
  ',': 'commas',
  '\t': 'tabs',
};

/** Joey's three words, in the order his sheet uses them. */
const STATUS_LEGEND: ReadonlyArray<[string, string]> = [
  ['Active', SPREADSHEET_STATUS_MAP['active'] ?? 'qualified'],
  ['Closed', SPREADSHEET_STATUS_MAP['closed'] ?? 'closed'],
  ['Lead', SPREADSHEET_STATUS_MAP['lead'] ?? 'new'],
];

export function ImportLeadsModal({
  isOpen,
  onClose,
  onImported,
}: ImportLeadsModalProps) {
  const [stage, setStage] = React.useState<Stage>('paste');
  const [text, setText] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [result, setResult] = React.useState<CommitResponse | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setStage('paste');
    setText('');
    setFileName('');
    setPlan(null);
    setResult(null);
    setError('');
  }, [isOpen]);

  async function post(commit: boolean): Promise<unknown | null> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, commit }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Could not read those rows.');
        return null;
      }
      return payload;
    } catch {
      setError(
        commit
          ? 'Could not reach the server. Nothing was imported.'
          : 'Could not reach the server.'
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview(): Promise<void> {
    const payload = (await post(false)) as { plan: ImportPlan } | null;
    if (payload === null) return;
    setPlan(payload.plan);
    setStage('preview');
  }

  async function handleCommit(): Promise<void> {
    const payload = (await post(true)) as CommitResponse | null;
    if (payload === null) return;
    setResult(payload);
    setStage('done');
    onImported({ createdCount: payload.createdCount });
  }

  async function handleFile(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setPlan(null);
    setStage('paste');
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import clients"
      description="A .csv file, or cells copied straight out of a spreadsheet. Nothing is written until you have seen the preview."
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {stage === 'paste' ? (
          <PasteStage
            text={text}
            fileName={fileName}
            onText={setText}
            onFile={handleFile}
          />
        ) : null}

        {stage === 'preview' && plan !== null ? <PreviewStage plan={plan} /> : null}

        {stage === 'done' && result !== null ? (
          <ResultStage result={result} />
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          {stage === 'paste' ? (
            <>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                loading={busy}
                loadingLabel="Checking"
                disabled={text.trim() === ''}
              >
                Check these rows
              </Button>
            </>
          ) : null}

          {stage === 'preview' && plan !== null ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStage('paste')}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleCommit}
                loading={busy}
                loadingLabel="Importing"
                disabled={plan.create.length === 0}
              >
                {plan.create.length === 1
                  ? 'Import 1 contact'
                  : `Import ${plan.create.length} contacts`}
              </Button>
            </>
          ) : null}

          {stage === 'done' ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// ─── Stage 1: paste or choose a file ──────────────────────────────────────────

function PasteStage({
  text,
  fileName,
  onText,
  onFile,
}: {
  text: string;
  fileName: string;
  onText: (value: string) => void;
  onFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <label
          htmlFor="import-file"
          className="mb-2 block text-sm font-medium text-navy"
        >
          Choose a .csv file
        </label>
        {/* Wrapped so the file-picker button's `file:bg-cerulean` cannot be
            read as a surface for the text below it. The contrast audit builds
            its parent pointers from indentation and cannot see that a
            self-closing input with a `file:` variant encloses nothing, so the
            wrapper is what tells it where this fill stops. */}
        <div>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onFile}
            className="block w-full text-sm text-neutral-900 file:mr-3 file:rounded-lg file:border-0 file:bg-cerulean file:px-4 file:py-2 file:text-sm file:font-medium file:text-bone"
          />
        </div>
        {fileName ? (
          <p className="mt-2 text-sm text-stone">Loaded {fileName}</p>
        ) : null}
      </div>

      <FormField
        id="import-text"
        label="…or paste rows"
        helpText="Columns: Name, Phone, Email, Status, Notes. A header row is optional — tabs from a spreadsheet and commas from a .csv both work."
      >
        <Textarea
          id="import-text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          rows={8}
          showCharacterCount={false}
          placeholder={
            'Name\tPhone\tEmail\tStatus\tNotes\nDana Whitfield\t(770) 555-0100\tdana@example.com\tActive\tReferral from the Hales'
          }
        />
      </FormField>

      <StatusMappingNote />
      <ConsentNote />
    </div>
  );
}

// ─── Stage 2: the preview ─────────────────────────────────────────────────────

function PreviewStage({ plan }: { plan: ImportPlan }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Tally label="Will be created" value={plan.create.length} />
        <Tally label="Skipped as duplicates" value={plan.skipped.length} />
        <Tally label="Could not be read" value={plan.rejected.length} />
      </div>

      <p className="text-sm text-stone">
        {plan.totalRows} data row{plan.totalRows === 1 ? '' : 's'} found, split
        by {DELIMITER_LABEL[plan.delimiter] ?? 'commas'}
        {plan.headerDetected
          ? ', with the first row read as column headings.'
          : ', with no header row — columns read in order as Name, Phone, Email, Status, Notes.'}
      </p>

      {plan.create.length > 0 ? (
        <Section title={`Will be created (${plan.create.length})`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-stone">
                <th className="py-2 pr-3">Row</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {plan.create.map((row) => (
                <tr key={`${row.line}-${row.email}`} className="text-neutral-900">
                  <td className="py-2 pr-3 text-stone">{row.line}</td>
                  <td className="py-2 pr-3">{row.fullName}</td>
                  <td className="py-2 pr-3">{row.email}</td>
                  <td className="py-2 pr-3">{row.phone ?? '—'}</td>
                  <td className="py-2">
                    {leadStatusLabel(row.status)}
                    {row.spreadsheetStatus === null ? null : (
                      <span className="block text-xs text-stone">
                        from “{row.spreadsheetStatus}”
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : (
        <Section title="Nothing to create">
          <p className="text-sm text-neutral-900">
            None of these rows would add a new contact. Check the two lists below
            for why.
          </p>
        </Section>
      )}

      {plan.skipped.length > 0 ? (
        <Section title={`Skipped as duplicates (${plan.skipped.length})`}>
          <p className="mb-3 text-sm text-stone">
            A contact is a duplicate when its email address already appears
            earlier in this file or already exists in the lead table. Phone
            numbers are not matched on, because a household shares one.
          </p>
          <ul className="space-y-1 text-sm text-neutral-900">
            {plan.skipped.map((row) => (
              <li key={`${row.line}-${row.email}`}>
                <span className="text-stone">Row {row.line}:</span> {row.label} (
                {row.email}) — {row.detail}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.rejected.length > 0 ? (
        <Section title={`Could not be read (${plan.rejected.length})`}>
          <p className="mb-3 text-sm text-stone">
            These rows will not be imported and nothing will be written for
            them. Fix them in the spreadsheet and import those rows again.
          </p>
          <ul className="space-y-1 text-sm text-neutral-900">
            {plan.rejected.map((row) => (
              <li key={`${row.line}-${row.label}`}>
                <span className="text-stone">Row {row.line}:</span> {row.label} —{' '}
                {row.detail}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <StatusMappingNote />
      <ConsentNote />
    </div>
  );
}

// ─── Stage 3: what actually happened ──────────────────────────────────────────

function ResultStage({ result }: { result: CommitResponse }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Tally label="Contacts created" value={result.createdCount} />
        <Tally label="Skipped as duplicates" value={result.plan.skipped.length} />
        <Tally label="Follow-up emails queued" value={result.followUpsCreated} />
      </div>

      <p className="text-sm text-neutral-900">
        {result.wrote
          ? `${result.createdCount} contact${result.createdCount === 1 ? '' : 's'} written to the lead table.`
          : 'Nothing was written — there were no new contacts in those rows.'}{' '}
        {result.plan.rejected.length > 0
          ? `${result.plan.rejected.length} row${result.plan.rejected.length === 1 ? '' : 's'} could not be read and ${result.plan.rejected.length === 1 ? 'was' : 'were'} not imported.`
          : 'Every row was accounted for.'}
      </p>

      {result.created.length > 0 ? (
        <Section title="Created">
          <ul className="space-y-1 text-sm text-neutral-900">
            {result.created.map((row) => (
              <li key={row.id}>
                <span className="text-stone">Row {row.line}:</span> {row.fullName}{' '}
                ({row.email}) — {leadStatusLabel(row.status)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {result.plan.rejected.length > 0 ? (
        <Section title="Not imported">
          <ul className="space-y-1 text-sm text-neutral-900">
            {result.plan.rejected.map((row) => (
              <li key={`${row.line}-${row.label}`}>
                <span className="text-stone">Row {row.line}:</span> {row.label} —{' '}
                {row.detail}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {result.plan.skipped.length > 0 ? (
        <Section title="Skipped">
          <ul className="space-y-1 text-sm text-neutral-900">
            {result.plan.skipped.map((row) => (
              <li key={`${row.line}-${row.email}`}>
                <span className="text-stone">Row {row.line}:</span> {row.label} (
                {row.email}) — {row.detail}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <ConsentNote />
    </div>
  );
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-3xl font-semibold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-stone">
        {label}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone">
        {title}
      </h3>
      <div className="max-h-64 overflow-y-auto">{children}</div>
    </section>
  );
}

/**
 * The status mapping, shown rather than buried in a code comment.
 *
 * It says plainly that `Active` loses detail. Joey is the only person who can
 * tell whether an imported `Active` client is actually under contract, and he
 * cannot do that if the screen implies the three words map cleanly onto the
 * pipeline.
 */
function StatusMappingNote() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone">
        How statuses are translated
      </h3>
      <ul className="space-y-1 text-sm text-neutral-900">
        {STATUS_LEGEND.map(([word, status]) => (
          <li key={word}>
            “{word}” becomes <strong>{leadStatusLabel(status)}</strong>
          </li>
        ))}
        <li>A blank status becomes <strong>New</strong></li>
      </ul>
      <p className="mt-2 text-sm text-stone">
        “Active” is the lossy one: the pipeline has six stages between contacted
        and under contract, and the spreadsheet does not say which. Everything
        marked Active arrives as Qualified and the original word is kept in the
        contact’s notes, so you can move them on from there. Any other word in
        the status column is reported as an error rather than guessed at.
      </p>
    </div>
  );
}

/** What the import deliberately does not do. */
function ConsentNote() {
  return (
    <div className="rounded-xl border border-champagne bg-neutral-50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone">
        No emails are sent
      </h3>
      <p className="text-sm text-neutral-900">
        Imported contacts get a lead record and nothing else: no follow-up
        sequence, no welcome email, no text or email to you. A spreadsheet is not
        permission to email somebody, so nobody on this list is marked as having
        opted in, and anybody who has previously unsubscribed stays
        unsubscribed.
      </p>
    </div>
  );
}
