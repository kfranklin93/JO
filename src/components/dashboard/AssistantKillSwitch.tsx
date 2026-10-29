'use client';

/**
 * The master switch: stop the assistant replying to anyone.
 *
 * The per-lead switch lives in the expanded leads row. This one exists because
 * the realistic emergency is not "this one conversation is going wrong", it is
 * "something is wrong and I do not yet know which conversations" — at which
 * point hunting through rows is the wrong tool.
 *
 * It is a database row rather than an environment variable, so it takes effect
 * on the next request instead of after a redeploy. That difference is the
 * reason the feature exists; see src/lib/db/assistant-mute-schema.ts.
 *
 * Deliberately understated in the header until it is on, then loud. An operator
 * control that looks alarming all the time gets ignored; one that changes
 * appearance only when active tells Joey at a glance that his assistant is off
 * — which is the state he most needs reminding of, because the cost of
 * forgetting is silence on every new lead.
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export function AssistantKillSwitch() {
  const [muted, setMuted] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard/assistant-mute')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body: { global: boolean }) => {
        if (!cancelled) setMuted(body.global);
      })
      .catch(() => {
        // Unknown rather than assumed. Showing "replying" when we could not
        // check would be a reassurance we have not earned.
        if (!cancelled) setMuted(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    const next = !muted;
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/assistant-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'global', muted: next }),
      });
      if (!res.ok) throw new Error();

      // Server-confirmed only. An optimistic flip could show the assistant as
      // off while it keeps answering.
      setMuted(next);
    } catch {
      setError('Not changed');
    } finally {
      setBusy(false);
    }
  }

  if (muted === null && !error) {
    return <span className="font-sans text-xs text-stone">Assistant&hellip;</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Gold fill with onyx text, never white. `bg-champagne text-white` is
          2.35:1, and the contrast audit caught exactly that here on the first
          pass — `champagne-foreground` exists so the pairing is decided once
          rather than at each call site. */}
      {muted && (
        <span className="rounded-full bg-champagne px-2 py-0.5 font-sans text-xs font-semibold text-champagne-foreground">
          AI OFF
        </span>
      )}

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={muted === true}
        title={
          muted
            ? 'The assistant is not replying to anyone. Click to turn it back on.'
            : 'Stop the assistant replying to everyone.'
        }
        className={cn(
          'min-h-11 rounded-lg px-3 py-1.5 font-sans text-sm transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
          'disabled:cursor-not-allowed disabled:opacity-50',
          muted
            // Gold border and tint keep the paused state visibly gold, but
            // the label is onyx: gold text on this near-white tint is 2.2:1.
            // The audit cannot see this one — it is a cn() fragment, not a
            // className — so it is written down here instead.
            ? 'border border-champagne bg-champagne/10 text-onyx hover:bg-champagne/20'
            : 'border border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900',
        )}
      >
        {muted ? 'Resume AI' : 'Pause AI'}
      </button>

      {error && (
        <span role="alert" className="font-sans text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
