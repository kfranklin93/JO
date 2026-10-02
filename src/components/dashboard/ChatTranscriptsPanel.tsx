'use client';

/**
 * Joey's view of what people said to the chat assistant.
 *
 * Reads `/api/dashboard/chats`, which is DB-backed — unlike `AiLogsPanel`, which
 * renders `src/data/mockBedrockLogs.ts`. The two are kept separate rather than
 * one replacing the other: that panel's audit drawer has fields no real row
 * carries yet, and swapping its data source out was not in scope here.
 *
 * Colours come from the `@theme` tokens in globals.css. `AiLogsPanel` hardcodes
 * `#1C2A39` and `#FAF9F6`, which is the thing the project rule forbids and
 * `tests/no-arbitrary-colour-escapes.test.ts` guards; this file uses
 * `navy`/`linen`/`cerulean` instead.
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface ApiMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  mode: string | null;
  toolCalls: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}

interface ApiTranscript {
  session: {
    id: string;
    leadId: string | null;
    messageCount: number;
    lastMessageAt: string;
    createdAt: string;
  };
  messages: ApiMessage[];
}

interface ApiResponse {
  transcripts: ApiTranscript[];
  stats: { sessions: number; anonymous: number; converted: number };
}

type FilterTab = 'all' | 'converted' | 'anonymous';

const FILTER_LABELS: Record<FilterTab, string> = {
  all: 'All',
  converted: 'Became a lead',
  anonymous: 'No details given',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** First thing the visitor actually said, for the thread list. */
function openingLine(transcript: ApiTranscript): string {
  const first = transcript.messages.find((m) => m.role === 'user');
  if (!first) return 'No messages stored';
  return first.content.length > 70
    ? `${first.content.slice(0, 70)}\u2026`
    : first.content;
}

export function ChatTranscriptsPanel() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [filterTab, setFilterTab] = React.useState<FilterTab>('all');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard/chats')
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : 'Could not load chat transcripts.';
          throw new Error(message);
        }
        return body as ApiResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setSelectedId(body.transcripts[0]?.session.id ?? null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visible = React.useMemo(() => {
    const all = data?.transcripts ?? [];
    if (filterTab === 'converted') return all.filter((t) => t.session.leadId);
    if (filterTab === 'anonymous') return all.filter((t) => !t.session.leadId);
    return all;
  }, [data, filterTab]);

  const selected =
    visible.find((t) => t.session.id === selectedId) ?? visible[0] ?? null;

  if (loading) {
    return (
      <p className="rounded-xl border border-navy/10 bg-white py-16 text-center font-sans text-sm text-stone">
        Loading conversations&hellip;
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-bronze/40 bg-white px-6 py-8 text-center"
      >
        <p className="font-sans text-sm font-medium text-bronze">{error}</p>
      </div>
    );
  }

  if (!data || data.transcripts.length === 0) {
    return (
      <div className="rounded-xl border border-navy/10 bg-white px-6 py-16 text-center">
        <p className="font-sans text-sm text-stone">
          No chat conversations stored yet.
        </p>
        <p className="mt-2 font-sans text-xs text-silver">
          Transcripts appear here once a visitor uses the chat panel on the site.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counts first — the number worth noticing is how many conversations
          ended without anyone leaving their details. */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Conversations" value={data.stats.sessions} />
        <Stat label="Became a lead" value={data.stats.converted} />
        <Stat label="No details given" value={data.stats.anonymous} />
      </div>

      <div
        role="tablist"
        aria-label="Filter conversations"
        className="flex gap-1 rounded-xl border border-navy/10 bg-linen p-1"
      >
        {(Object.keys(FILTER_LABELS) as FilterTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={filterTab === tab}
            onClick={() => setFilterTab(tab)}
            className={cn(
              'min-h-11 rounded-lg px-4 py-1.5 font-sans text-xs font-semibold tracking-[0.1em] uppercase transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
              filterTab === tab
                ? 'bg-cerulean text-white'
                : 'text-stone hover:text-navy',
            )}
          >
            {FILTER_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="lg:w-80 lg:shrink-0">
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
            {visible.map((transcript) => {
              const isSelected = selected?.session.id === transcript.session.id;
              return (
                <li key={transcript.session.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(transcript.session.id)}
                    aria-current={isSelected}
                    className={cn(
                      'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
                      isSelected
                        ? 'border-cerulean bg-white'
                        : 'border-navy/10 bg-white hover:border-navy/30',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-sans text-xs text-silver">
                        {formatTime(transcript.session.lastMessageAt)}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-sans text-xs font-medium',
                          transcript.session.leadId
                            ? 'bg-cerulean/10 text-cerulean'
                            : 'bg-neutral-100 text-stone',
                        )}
                      >
                        {transcript.session.leadId ? 'Lead' : 'Anonymous'}
                      </span>
                    </div>
                    <p className="mt-1 font-sans text-sm text-navy">
                      {openingLine(transcript)}
                    </p>
                    <p className="mt-1 font-sans text-xs text-silver">
                      {transcript.session.messageCount} message
                      {transcript.session.messageCount === 1 ? '' : 's'}
                    </p>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="rounded-xl border border-navy/10 bg-white px-4 py-8 text-center font-sans text-sm text-stone">
                Nothing in this filter.
              </li>
            )}
          </ul>
        </aside>

        <section className="flex-1 rounded-xl border border-navy/10 bg-white">
          {selected ? (
            <>
              <header className="border-b border-navy/10 px-5 py-4">
                <h3 className="font-serif text-lg text-navy">
                  {selected.session.leadId
                    ? 'Conversation that became a lead'
                    : 'Conversation with no contact details'}
                </h3>
                <p className="mt-1 font-sans text-xs text-silver">
                  Started {formatTime(selected.session.createdAt)} &middot; session{' '}
                  <span className="font-mono">{selected.session.id.slice(0, 8)}</span>
                </p>
              </header>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 py-4">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[80%] rounded-xl px-3 py-2',
                      message.role === 'user'
                        ? 'ml-auto bg-cerulean text-white'
                        : 'border border-navy/10 bg-linen text-navy',
                    )}
                  >
                    <p className="font-sans text-sm whitespace-pre-line">
                      {message.content}
                    </p>
                    {/* Cost and tool metadata on assistant turns only, since
                        they are the turns that spent anything. */}
                    {message.role === 'assistant' && (
                      <p className="mt-1.5 font-sans text-xs text-stone">
                        {message.mode === 'mock' && (
                          <span className="text-bronze">
                            development fallback &middot;{' '}
                          </span>
                        )}
                        {message.latencyMs !== null && `${message.latencyMs}ms`}
                        {message.inputTokens !== null &&
                          ` \u00b7 ${message.inputTokens}+${message.outputTokens ?? 0} tokens`}
                        {message.toolCalls.length > 0 &&
                          ` \u00b7 ${message.toolCalls.join(', ')}`}
                      </p>
                    )}
                  </div>
                ))}
                {selected.messages.length === 0 && (
                  <p className="py-8 text-center font-sans text-sm text-stone">
                    This session has no stored messages.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="py-16 text-center font-sans text-sm text-stone">
              Select a conversation to read it.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-white px-4 py-3">
      <p className="font-sans text-xs font-semibold tracking-widest text-silver uppercase">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-navy">{value}</p>
    </div>
  );
}
