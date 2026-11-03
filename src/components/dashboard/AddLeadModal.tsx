'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { LEAD_FIELD_LIMITS, LEAD_INTENTS } from '@/lib/validation/lead';
import { LEAD_STATUSES, leadStatusLabel } from '@/lib/validation/lead-status';

/**
 * Joey's hand-entry form for an off-platform lead — a referral, a Zillow
 * enquiry, somebody who called him.
 *
 * Built on `Modal`, which existed in src/components/ui and was imported by
 * nothing, and on the same `FormField` / `Input` / `Select` / `Textarea`
 * primitives the public multi-step form uses. The field set mirrors what
 * `leadSubmissionSchema` requires, so the server's rejection messages land on
 * the fields that produced them.
 *
 * ## The follow-up checkbox, and why it starts off
 *
 * Ticking it queues the five-touch email sequence. It is unticked on open and
 * the label says what ticking it does, because the two mistakes are not
 * symmetrical: forgetting to tick it costs Joey a second visit to the row,
 * while leaving it ticked by accident sends five marketing emails to somebody
 * who never asked for them and cannot be unsent. A referral who asked Joey to
 * follow up is close enough to consent that the option belongs here at all —
 * but only Joey knows whether this particular person asked, and the default has
 * to be the answer that is safe when he is not thinking about it.
 */

export interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful write, so the caller can reload the table. */
  onSaved: (summary: { leadId: string; followUpsCreated: number }) => void;
}

const INTENT_LABELS: Record<(typeof LEAD_INTENTS)[number], string> = {
  buy: 'Buying a home',
  sell: 'Selling a home',
  invest: 'Investing',
  insurance: 'Home insurance',
  closing: 'Closing services',
  general: 'General enquiry',
};

interface FormState {
  name: string;
  email: string;
  phone: string;
  intent: string;
  status: string;
  notes: string;
  scheduleFollowUps: boolean;
}

const EMPTY: FormState = {
  name: '',
  email: '',
  phone: '',
  intent: 'buy',
  status: 'new',
  notes: '',
  scheduleFollowUps: false,
};

/**
 * An `error` prop that is absent rather than `undefined` when there is none.
 *
 * `exactOptionalPropertyTypes` is on, so `error={errors[field]}` is a type
 * error for an index read: the prop is declared `error?: string`, and
 * `string | undefined` is not that. Spreading the result keeps the three call
 * sites per field from each growing a ternary.
 */
function errorProp(
  errors: Record<string, string>,
  field: string
): { error?: string } {
  const message = errors[field];
  return message === undefined ? {} : { error: message };
}

export function AddLeadModal({ isOpen, onClose, onSaved }: AddLeadModalProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Reopening gets a blank form rather than the last attempt. Joey adds leads
  // one after another, and a half-filled previous referral is worse than
  // retyping.
  React.useEffect(() => {
    if (isOpen) {
      setForm(EMPTY);
      setFieldErrors({});
      setFormError('');
    }
  }, [isOpen]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError('');

    try {
      const response = await fetch('/api/dashboard/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as {
        leadId?: string;
        followUpsCreated?: number;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (response.status === 422 && payload.fieldErrors) {
        setFieldErrors(payload.fieldErrors);
        return;
      }

      if (!response.ok || !payload.leadId) {
        setFormError(payload.error ?? 'Could not save that lead.');
        return;
      }

      onSaved({
        leadId: payload.leadId,
        followUpsCreated: payload.followUpsCreated ?? 0,
      });
      onClose();
    } catch {
      setFormError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add a lead"
      description="For leads that did not come through the website — referrals, Zillow enquiries, people who call."
      initialFocusRef={nameRef as React.RefObject<HTMLElement>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="lead-name"
            label="Name"
            required
            {...errorProp(fieldErrors, 'name')}
          >
            <Input
              ref={nameRef}
              id="lead-name"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              maxLength={LEAD_FIELD_LIMITS.fullName}
              placeholder="Dana Whitfield"
              autoComplete="off"
              {...errorProp(fieldErrors, 'name')}
            />
          </FormField>

          <FormField
            id="lead-email"
            label="Email"
            required
            {...errorProp(fieldErrors, 'email')}
          >
            <Input
              id="lead-email"
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              maxLength={LEAD_FIELD_LIMITS.email}
              placeholder="dana@example.com"
              autoComplete="off"
              {...errorProp(fieldErrors, 'email')}
            />
          </FormField>

          <FormField id="lead-phone" label="Phone" {...errorProp(fieldErrors, 'phone')}>
            <Input
              id="lead-phone"
              type="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              maxLength={LEAD_FIELD_LIMITS.phone}
              placeholder="(770) 555-0100"
              autoComplete="off"
              {...errorProp(fieldErrors, 'phone')}
            />
          </FormField>

          <FormField
            id="lead-intent"
            label="Intent"
            required
            {...errorProp(fieldErrors, 'intent')}
          >
            <Select
              id="lead-intent"
              value={form.intent}
              onChange={(event) => update('intent', event.target.value)}
              options={LEAD_INTENTS.map((intent) => ({
                value: intent,
                label: INTENT_LABELS[intent],
              }))}
              {...errorProp(fieldErrors, 'intent')}
            />
          </FormField>

          <FormField
            id="lead-status"
            label="Status"
            required
            className="sm:col-span-2"
            {...errorProp(fieldErrors, 'status')}
          >
            <Select
              id="lead-status"
              value={form.status}
              onChange={(event) => update('status', event.target.value)}
              options={LEAD_STATUSES.map((status) => ({
                value: status,
                label: leadStatusLabel(status),
              }))}
              {...errorProp(fieldErrors, 'status')}
            />
          </FormField>
        </div>

        <FormField
          id="lead-notes"
          label="Notes"
          {...errorProp(fieldErrors, 'additionalNotes')}
        >
          <Textarea
            id="lead-notes"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
            maxLength={LEAD_FIELD_LIMITS.additionalNotes}
            rows={4}
            placeholder="Where they came from, what they asked for, anything you want on the record."
            {...errorProp(fieldErrors, 'additionalNotes')}
          />
        </FormField>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <label
            htmlFor="lead-follow-ups"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="lead-follow-ups"
              type="checkbox"
              checked={form.scheduleFollowUps}
              onChange={(event) =>
                update('scheduleFollowUps', event.target.checked)
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-navy/40 accent-cerulean"
            />
            <span className="text-sm text-neutral-900">
              <span className="font-medium">
                Start the five-touch email follow-up sequence
              </span>
              <span className="mt-1 block text-stone">
                Leave this off unless this person asked you to follow up. Ticking
                it queues five emails over the next thirty days, and they cannot
                be unsent.
              </span>
            </span>
          </label>
        </div>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} loadingLabel="Saving">
            Save lead
          </Button>
        </div>
      </form>
    </Modal>
  );
}
