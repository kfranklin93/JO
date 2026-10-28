/**
 * A single number with a label, as the dashboard panels draw it.
 *
 * Extracted because `ChatTranscriptsPanel` and `AppointmentsPanel` carried
 * identical copies. Presentational only — no state, no fetching — so it stays a
 * plain component usable from either a server or a client panel.
 *
 * Colours are `@theme` tokens from globals.css, never raw hex.
 */
export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-white px-4 py-3">
      <p className="font-sans text-xs font-semibold tracking-widest text-silver uppercase">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-navy">{value}</p>
    </div>
  );
}
