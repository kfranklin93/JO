'use client';

import * as React from 'react';
import {
  mockBedrockThreads,
  getConfidenceBgClass,
  getConfidenceColor,
  getTierLabel,
  type BedrockThread,
  type BedrockMessage,
  type ConfidenceTier,
} from '@/data/mockBedrockLogs';

// ─── Source type icon ─────────────────────────────────────────────────────────

function SourceIcon({ type }: { type: string }) {
  if (type === 'crm')
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      </svg>
    );
  if (type === 'calendar')
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
      </svg>
    );
  if (type === 'upload')
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    );
  // document
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const color = getConfidenceColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-[#1C2A39]/10">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {score}%
      </span>
    </div>
  );
}

// ─── Audit drawer for a single AI message ────────────────────────────────────

function AuditDrawer({ meta }: { meta: NonNullable<BedrockMessage['meta']> }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        aria-expanded={open}
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        View AI Reasoning
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-accent/20 bg-[#1C2A39]/5 p-4 text-xs">
          {/* Top row: latency / tokens / model */}
          <div className="mb-3 flex flex-wrap gap-4">
            <div>
              <span className="font-semibold uppercase tracking-wider text-[#1C2A39]/50">Latency</span>
              <p className="mt-0.5 font-mono font-medium text-[#1C2A39]">{meta.latencyMs} ms</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-wider text-[#1C2A39]/50">Tokens</span>
              <p className="mt-0.5 font-mono font-medium text-[#1C2A39]">{meta.tokenCount}</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-wider text-[#1C2A39]/50">Model</span>
              <p className="mt-0.5 font-medium text-[#1C2A39]">{meta.model}</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-wider text-[#1C2A39]/50">Groundedness</span>
              <div className="mt-1">
                <ConfidenceBar score={meta.groundedness} />
              </div>
            </div>
          </div>

          {/* Flag reason */}
          {meta.flagReason && (
            <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{meta.flagReason}</span>
            </div>
          )}

          {/* Sources */}
          {meta.sources.length > 0 && (
            <div>
              <span className="font-semibold uppercase tracking-wider text-[#1C2A39]/50">
                Retrieved Sources
              </span>
              <ul className="mt-2 space-y-1.5">
                {meta.sources.map((src) => (
                  <li key={src.id} className="flex items-center gap-2 text-[#1C2A39]/70">
                    <SourceIcon type={src.type} />
                    <span>{src.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single chat message bubble ───────────────────────────────────────────────

function MessageBubble({ msg }: { msg: BedrockMessage }) {
  const isAI = msg.role === 'ai';
  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] ${isAI ? 'w-full' : ''}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isAI
              ? 'rounded-tl-sm bg-[#1C2A39] text-[#FAF9F6]'
              : 'rounded-tr-sm bg-accent/15 text-[#1C2A39]'
          }`}
        >
          {msg.content}
        </div>

        {/* Time + role label */}
        <p className={`mt-1 text-xs text-[#1C2A39]/40 ${isAI ? 'text-left' : 'text-right'}`}>
          {isAI ? 'Bedrock AI' : 'Client'} · {time}
        </p>

        {/* Audit drawer — only on AI messages with meta */}
        {isAI && msg.meta && <AuditDrawer meta={msg.meta} />}
      </div>
    </div>
  );
}

// ─── Thread list item ─────────────────────────────────────────────────────────

function ThreadListItem({
  thread,
  isSelected,
  onSelect,
}: {
  thread: BedrockThread;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const badgeClass = getConfidenceBgClass(thread.confidenceTier);
  const tierLabel = getTierLabel(thread.confidenceTier);
  const color = getConfidenceColor(thread.latestConfidence);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        isSelected
          ? 'border-accent/60 bg-[#1C2A39] text-[#FAF9F6]'
          : 'border-[#1C2A39]/10 bg-[#FAF9F6] text-[#1C2A39] hover:border-accent/30 hover:bg-white'
      }`}
    >
      {/* Name + badge */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-sans text-sm font-semibold ${isSelected ? 'text-[#FAF9F6]' : 'text-[#1C2A39]'}`}>
          {thread.clientName}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          isSelected ? 'bg-white/15 text-[#FAF9F6]' : badgeClass
        }`}>
          {tierLabel}
        </span>
      </div>

      {/* Property */}
      <p className={`mt-0.5 truncate text-xs ${isSelected ? 'text-[#FAF9F6]/60' : 'text-[#1C2A39]/50'}`}>
        {thread.propertyContext}
      </p>

      {/* Sentiment + confidence */}
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          isSelected ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-[#1C2A39]/60'
        }`}>
          {thread.sentiment}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-12 rounded-full bg-white/20">
            <div
              className="h-1 rounded-full"
              style={{
                  width: `${thread.latestConfidence}%`,
                  backgroundColor: isSelected ? 'var(--color-accent, #0A7EA4)' : color,
                }}
            />
          </div>
          <span className={`text-xs font-semibold tabular-nums ${isSelected ? 'text-accent' : ''}`}
            style={{ color: isSelected ? 'var(--color-accent, #0A7EA4)' : color }}>
            {thread.latestConfidence}%
          </span>
        </div>
      </div>

      {/* AI paused indicator */}
      {thread.aiPaused && (
        <div className={`mt-2 flex items-center gap-1 text-xs ${isSelected ? 'text-amber-300' : 'text-amber-600'}`}>
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          AI Paused
        </div>
      )}
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'review' | 'escalated';

export function AiLogsPanel() {
  const [filterTab, setFilterTab] = React.useState<FilterTab>('all');
  const [selectedId, setSelectedId] = React.useState<string>(mockBedrockThreads[0]!.id);
  const [pausedIds, setPausedIds] = React.useState<Set<string>>(
    new Set(mockBedrockThreads.filter((t) => t.aiPaused).map((t) => t.id))
  );

  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Filter thread list
  const visibleThreads = mockBedrockThreads.filter((t) => {
    if (filterTab === 'review') return t.confidenceTier === 'review';
    if (filterTab === 'escalated') return t.confidenceTier === 'escalated';
    return true;
  });

  const selectedThread = mockBedrockThreads.find((t) => t.id === selectedId) ?? mockBedrockThreads[0]!;
  const isPaused = pausedIds.has(selectedThread.id);

  function togglePause(id: string) {
    setPausedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Scroll chat to bottom when thread changes
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId]);

  const tierBadgeClass = getConfidenceBgClass(selectedThread.confidenceTier);
  const confidenceColor = getConfidenceColor(selectedThread.latestConfidence);

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[600px] overflow-hidden rounded-2xl border border-[#1C2A39]/10 bg-[#FAF9F6] shadow-sm">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-[#1C2A39]/10 bg-[#FAF9F6]">

        {/* Sidebar header */}
        <div className="border-b border-[#1C2A39]/10 px-4 py-4">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-[#1C2A39]/50">
            Client Conversations
          </h2>
          <p className="mt-1 font-sans text-xs text-[#1C2A39]/40">
            {mockBedrockThreads.length} active threads
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-[#1C2A39]/10 px-3 py-2">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'review', label: 'Needs Review' },
              { key: 'escalated', label: 'Escalated' },
            ] as { key: FilterTab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTab(key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filterTab === key
                  ? 'bg-[#1C2A39] text-[#FAF9F6]'
                  : 'text-[#1C2A39]/60 hover:bg-[#1C2A39]/5 hover:text-[#1C2A39]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Thread list */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {visibleThreads.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#1C2A39]/40">No threads in this filter.</p>
          ) : (
            visibleThreads.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                isSelected={thread.id === selectedId}
                onSelect={() => setSelectedId(thread.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Right detail pane ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Thread header */}
        <div className="flex items-center justify-between border-b border-[#1C2A39]/10 bg-white px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-serif text-lg font-medium text-[#1C2A39] truncate">
                {selectedThread.clientName}
              </h3>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tierBadgeClass}`}>
                {getTierLabel(selectedThread.confidenceTier)}
              </span>
              {isPaused && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  AI Paused
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-sans text-xs text-[#1C2A39]/50">
              {selectedThread.propertyAddress}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* Confidence score */}
            <div className="hidden items-center gap-2 sm:flex">
              <span className="font-sans text-xs text-[#1C2A39]/50">Confidence</span>
              <ConfidenceBar score={selectedThread.latestConfidence} />
            </div>

            {/* Pause / Resume AI button */}
            <button
              type="button"
              onClick={() => togglePause(selectedThread.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-sans text-xs font-medium transition-all ${
                isPaused
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-accent bg-accent/10 text-[#1C2A39] hover:bg-accent/20'
              }`}
            >
              {isPaused ? (
                <>
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0116 0zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Resume AI
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Take Over Chat
                </>
              )}
            </button>
          </div>
        </div>

        {/* Property context strip */}
        <div className="border-b border-accent/20 bg-[#1C2A39]/3 px-6 py-2">
          <p className="font-sans text-xs text-[#1C2A39]/60">
            <span className="font-semibold text-[#1C2A39]/80">Property: </span>
            {selectedThread.propertyContext}
            <span className="mx-2 text-[#1C2A39]/30">·</span>
            <span className="font-semibold text-[#1C2A39]/80">Sentiment: </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${confidenceColor}18`, color: confidenceColor }}
            >
              {selectedThread.sentiment}
            </span>
          </p>
        </div>

        {/* Chat message feed */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {selectedThread.messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {isPaused && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
              <span>
                <strong>AI is paused</strong> — Joey has taken over this conversation. New client messages will be held until AI is resumed.
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t border-[#1C2A39]/10 bg-white px-6 py-3">
          <p className="font-sans text-xs text-[#1C2A39]/40">
            {selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? 's' : ''}
            <span className="mx-2">·</span>
            Model: <span className="font-medium text-[#1C2A39]/60">Claude 3.5 Sonnet</span>
            <span className="mx-2">·</span>
            Avg latency:{' '}
            <span className="font-medium text-[#1C2A39]/60">
              {Math.round(
                selectedThread.messages
                  .filter((m) => m.meta)
                  .reduce((sum, m) => sum + (m.meta?.latencyMs ?? 0), 0) /
                  Math.max(selectedThread.messages.filter((m) => m.meta).length, 1)
              )}
              ms
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-sans text-xs text-[#1C2A39]/40">Bedrock Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

