'use client';

/**
 * The website chat panel — a visitor talking to Joey's AI assistant.
 *
 * ## Position
 *
 * Bottom-left, which is not where a chat launcher usually goes. `FloatingConnectCTA`
 * already occupies `bottom-8 right-8` at `z-40` on the marketing pages, and two
 * round buttons stacked on each other is worse than an unconventional corner.
 * Moving that component was not in scope; if it is ever retired, this belongs on
 * the right.
 *
 * ## Non-modal, deliberately
 *
 * `Modal.tsx` traps focus, locks body scroll and renders a backdrop. All three
 * are wrong for this. A chat panel stays open while the visitor keeps reading the
 * page — that is the point of it — so trapping focus inside would make the rest
 * of the site unreachable without closing the conversation. The panel is a
 * `role="dialog"` with `aria-modal="false"`: labelled, escapable, focus restored
 * on close, but not a trap.
 *
 * ## Announcing replies
 *
 * The transcript is a `role="log"` with `aria-live="polite"`, which is what makes
 * a reply audible to a screen reader without stealing focus from the composer
 * mid-sentence. The pending state is announced through the same region rather
 * than as a separate alert, so it reads in sequence with the conversation.
 *
 * ## Colours
 *
 * Every class here resolves to a token from the `@theme` block in globals.css.
 * No hex values and no arbitrary escapes — `tests/no-arbitrary-colour-escapes.test.ts`
 * enforces that, and this file is in its scope.
 */

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/** Matches MAX_CONTENT_LENGTH in the route, so the UI refuses what the API would. */
const MAX_MESSAGE_LENGTH = 4000;

/** Turns replayed to the server. The route caps this at 20 regardless. */
const MAX_HISTORY_TURNS = 20;

const OPENING_MESSAGE =
  "Hey! I'm the AI assistant on Joey's team. Ask me anything about buying, " +
  'selling, or how Joey works — and I can get you time with him directly.';

/** Shown when the request never reached the model, so the reply box stays honest. */
const NETWORK_NOTICE =
  "I couldn't get that through just now. Mind trying again?";
const RATE_LIMIT_NOTICE =
  "That's a lot at once — give me a few seconds and try again.";

export interface JoeyChatProps {
  /** Overridable for tests and for pages that want it open on load. */
  defaultOpen?: boolean;
}

export function JoeyChat({ defaultOpen = false }: JoeyChatProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: OPENING_MESSAGE },
  ]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [bookingUrl, setBookingUrl] = React.useState<string | null>(null);

  const sessionIdRef = React.useRef<string | undefined>(undefined);
  const nextIdRef = React.useRef(0);
  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  const panelId = React.useId();
  const titleId = React.useId();
  const disclosureId = React.useId();

  const reduceMotion = useReducedMotion();

  const nextId = () => {
    nextIdRef.current += 1;
    return `m${nextIdRef.current}`;
  };

  // Escape closes from anywhere, which is the one keyboard affordance a
  // non-modal dialog still owes the user.
  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Focus follows the panel: into the composer on open, back to the launcher on
  // close, so a keyboard user is never dropped at the top of the document.
  React.useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else if (nextIdRef.current > 0) launcherRef.current?.focus();
  }, [isOpen]);

  // Keep the newest message in view. `scrollTop` rather than `scrollIntoView`,
  // which on some browsers scrolls the whole page to reach the panel.
  React.useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    const outgoing: ChatMessage = { id: nextId(), role: 'user', content: text };

    // The history sent is the transcript *before* this message, and the opening
    // line is dropped: the assistant did not say it, the component did, and
    // replaying it as an assistant turn would teach the model it had already
    // greeted someone it has not.
    const history = messages
      .filter((m) => m.id !== 'opening')
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, outgoing]);
    setDraft('');
    setSending(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        }),
      });

      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: RATE_LIMIT_NOTICE },
        ]);
        return;
      }

      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);

      const data: unknown = await res.json();
      const payload = (data ?? {}) as {
        sessionId?: unknown;
        reply?: unknown;
        bookingUrl?: unknown;
      };

      // The server owns the session id. Holding on to it is what keeps the
      // conversation, the spend limit and the stored transcript pointing at one
      // thing.
      if (typeof payload.sessionId === 'string') {
        sessionIdRef.current = payload.sessionId;
      }
      if (typeof payload.bookingUrl === 'string') {
        setBookingUrl(payload.bookingUrl);
      }

      const reply =
        typeof payload.reply === 'string' && payload.reply.trim()
          ? payload.reply
          : NETWORK_NOTICE;

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: NETWORK_NOTICE },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.98 },
      };

  return (
    <>
      {/* Launcher. Stays mounted while the panel is open so aria-expanded has
          something to describe and focus has somewhere to return. */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          'fixed bottom-8 left-8 z-40 flex min-h-11 items-center gap-3 rounded-full',
          'bg-cerulean px-6 py-4 font-sans text-sm font-medium tracking-wider text-white uppercase',
          'shadow-soft transition-colors hover:bg-accent-hover',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cerulean',
        )}
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10.5h8M8 14h5m-9 6.5 2.3-2.3A9 9 0 1 1 21 12a9 9 0 0 1-9 9H4Z"
          />
        </svg>
        <span className="hidden sm:inline">
          {isOpen ? 'Close chat' : 'Ask a question'}
        </span>
        <span className="sm:hidden sr-only">
          {isOpen ? 'Close chat' : 'Ask a question'}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...panelMotion}
            transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: 'easeOut' }}
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            aria-describedby={disclosureId}
            className={cn(
              'fixed bottom-28 left-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm flex-col',
              'overflow-hidden rounded-xl border border-navy/10 bg-linen shadow-soft',
              'sm:left-8 sm:w-96',
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-navy/10 bg-white px-4 py-3">
              <div>
                <h2 id={titleId} className="font-serif text-lg text-navy">
                  Chat with Joey&rsquo;s team
                </h2>
                {/* The AI disclosure. Present in the UI as well as in the
                    assistant's own answers, so it does not depend on the model
                    choosing to say it. */}
                <p id={disclosureId} className="font-sans text-xs text-stone">
                  AI assistant &middot; not Joey himself &middot; replies are not advice
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                className={cn(
                  'flex min-h-11 min-w-11 items-center justify-center rounded-xl',
                  'text-xl text-stone transition-colors hover:bg-linen hover:text-navy',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
                )}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <div
              ref={transcriptRef}
              role="log"
              aria-live="polite"
              aria-label="Conversation"
              className="flex max-h-96 min-h-48 flex-col gap-3 overflow-y-auto px-4 py-4"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 font-sans text-sm',
                    message.role === 'user'
                      ? 'self-end bg-cerulean text-white'
                      : 'self-start border border-navy/10 bg-white text-navy',
                  )}
                >
                  {/* The model replies in plain text with real line breaks.
                      `whitespace-pre-line` keeps its paragraphing without
                      rendering anything it wrote as markup. */}
                  <span className="whitespace-pre-line">{message.content}</span>
                </div>
              ))}

              {sending && (
                <p className="self-start font-sans text-xs text-stone" role="status">
                  Typing&hellip;
                </p>
              )}
            </div>

            {bookingUrl && (
              <div className="border-t border-navy/10 px-4 py-3">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex min-h-11 items-center justify-center rounded-xl border-2 border-navy',
                    'px-4 py-2 font-sans text-sm font-medium text-navy transition-colors',
                    'hover:border-cerulean hover:bg-cerulean hover:text-white',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
                  )}
                >
                  Book a call with Joey
                </a>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="border-t border-navy/10 bg-white px-4 py-3"
            >
              <label htmlFor={`${panelId}-input`} className="sr-only">
                Your message
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  id={`${panelId}-input`}
                  rows={1}
                  value={draft}
                  maxLength={MAX_MESSAGE_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends, Shift+Enter breaks the line — what every chat
                    // input does. Without this the form would submit on Enter and
                    // a multi-line message would be impossible.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask about buying, selling, or Joey"
                  className={cn(
                    'min-h-11 w-full resize-none rounded-xl border border-navy/20 bg-linen',
                    'px-3 py-3 font-sans text-sm font-light text-navy transition-all',
                    'placeholder:text-stone',
                    'focus-visible:border-cerulean focus-visible:ring-1 focus-visible:ring-cerulean focus-visible:outline-none',
                  )}
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className={cn(
                    'flex min-h-11 min-w-11 items-center justify-center rounded-xl',
                    'bg-cerulean font-sans text-sm font-medium text-white transition-colors',
                    'hover:bg-accent-hover',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
                    'disabled:cursor-not-allowed disabled:bg-cerulean/40',
                  )}
                >
                  <span className="sr-only">Send message</span>
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6" />
                  </svg>
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
