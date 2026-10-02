// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoeyChat } from './JoeyChat';

/**
 * Tests for the website chat panel.
 *
 * Three things here are worth a test because getting them wrong is invisible in
 * a browser until it matters:
 *
 *  1. The session id round-trip. The server owns it; the panel has to hold on to
 *     what came back and echo it, or every turn starts a new conversation, the
 *     per-session spend cap never applies, and the stored transcript is one row
 *     per message with no thread.
 *  2. The opening greeting is not replayed as history. The component writes it,
 *     not the model, and sending it back would tell the model it had already
 *     greeted someone it has not.
 *  3. A failed request still produces a visible reply. A chat panel that
 *     silently swallows a message looks broken in the worst way — the visitor
 *     assumes they were heard.
 *
 * The AI disclosure is asserted because it is a requirement of the spec, not a
 * styling choice: it must not depend on the model electing to mention it.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      sessionId: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      reply: 'Joey works across the Atlanta metro.',
      mode: 'live',
      bookingUrl: null,
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Open the panel and return the composer. */
async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /ask a question/i }));
  return screen.getByLabelText(/your message/i);
}

/** The body of the nth fetch call, parsed. */
function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call]?.[1]?.body as string);
}

describe('JoeyChat — opening and closing', () => {
  it('starts closed and opens on the launcher', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ask a question/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports its state on the launcher for assistive tech', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);

    const launcher = screen.getByRole('button', { name: /ask a question/i });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');

    await user.click(launcher);

    expect(
      screen.getByRole('button', { name: /close chat/i, expanded: true }),
    ).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<JoeyChat defaultOpen />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not trap focus, because the visitor keeps reading the page', () => {
    // A chat panel that traps focus makes the rest of the site unreachable
    // without abandoning the conversation.
    render(<JoeyChat defaultOpen />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
  });
});

describe('JoeyChat — the AI disclosure', () => {
  it('states it is not Joey, in the UI rather than only in the replies', () => {
    render(<JoeyChat defaultOpen />);

    expect(screen.getByText(/not joey himself/i)).toBeInTheDocument();
  });

  it('says replies are not advice', () => {
    render(<JoeyChat defaultOpen />);

    expect(screen.getByText(/not advice/i)).toBeInTheDocument();
  });
});

describe('JoeyChat — sending a message', () => {
  it('shows what the visitor typed and the reply that came back', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'Do you work in Marietta?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText('Do you work in Marietta?')).toBeInTheDocument();
    expect(
      await screen.findByText('Joey works across the Atlanta metro.'),
    ).toBeInTheDocument();
  });

  it('sends on Enter and keeps Shift+Enter for a new line', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'first line{Shift>}{Enter}{/Shift}second line');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(input, '{Enter}');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody().message).toBe('first line\nsecond line');
  });

  it('clears the composer so the message is not sent twice', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'hello{Enter}');

    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('refuses an empty message without calling the API', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    await openPanel(user);

    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces the conversation through a live region', () => {
    // So a reply is read out without stealing focus from the composer.
    render(<JoeyChat defaultOpen />);

    const log = screen.getByRole('log', { name: /conversation/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });
});

describe('JoeyChat — session continuity', () => {
  it('sends no session id on the first turn and the server-issued one after', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'first{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The browser cannot know an id yet, which is exactly why this endpoint
    // exists rather than the parent one that requires it.
    expect(sentBody(0).sessionId).toBeUndefined();

    await user.type(input, 'second{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(sentBody(1).sessionId).toBe('3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
  });

  it('never replays its own opening greeting as model history', async () => {
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'first{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.type(input, 'second{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const history = sentBody(1).history as { role: string; content: string }[];

    expect(history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'Joey works across the Atlanta metro.' },
    ]);
    expect(JSON.stringify(history)).not.toContain('AI assistant on Joey');
  });
});

describe('JoeyChat — when the request does not land', () => {
  it('says so rather than swallowing the message', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'hello{Enter}');

    // The visitor's own message stays on screen, and the panel admits the
    // failure. Silence would read as "sent and ignored".
    expect(await screen.findByText(/trying again/i)).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('explains a 429 instead of looking broken', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many requests' }),
    });
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'hello{Enter}');

    expect(await screen.findByText(/give me a few seconds/i)).toBeInTheDocument();
  });

  it('recovers on the next message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    await user.type(input, 'hello{Enter}');
    await screen.findByText(/trying again/i);

    await user.type(input, 'again{Enter}');

    expect(
      await screen.findByText('Joey works across the Atlanta metro.'),
    ).toBeInTheDocument();
  });
});

describe('JoeyChat — booking link', () => {
  it('offers the call link only once the server sends one', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        reply: 'Happy to set that up.',
        mode: 'live',
        bookingUrl: 'https://calendly.com/example/intro',
      }),
    });
    const user = userEvent.setup();
    render(<JoeyChat />);
    const input = await openPanel(user);

    expect(
      screen.queryByRole('link', { name: /book a call/i }),
    ).not.toBeInTheDocument();

    await user.type(input, 'can I talk to Joey?{Enter}');

    const link = await screen.findByRole('link', { name: /book a call/i });
    expect(link).toHaveAttribute('href', 'https://calendly.com/example/intro');
    // A new tab must not hand the opener a window reference.
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
