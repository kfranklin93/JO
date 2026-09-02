// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalError from './global-error';
import ErrorBoundary from './error';

/**
 * The two boundaries differ only in whether they own the document shell, and
 * getting that backwards is exactly the bug this spec fixes: the shell version
 * was sitting in error.tsx, nesting a second document inside the root layout.
 * These assertions pin the distinction down so a future edit cannot quietly
 * swap them again.
 */

afterEach(cleanup);

const error = Object.assign(new Error('Something failed'), { digest: 'abc123' });

describe('global-error.tsx', () => {
  it('owns the document shell, and renders exactly one of it', () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={error} unstable_retry={() => {}} />
    );

    expect(markup.match(/<html/g)).toHaveLength(1);
    expect(markup.match(/<body/g)).toHaveLength(1);
  });

  it('surfaces the error message and a recovery action', () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={error} unstable_retry={() => {}} />
    );

    expect(markup).toContain('Something failed');
    expect(markup).toContain('Try again');
  });
});

describe('error.tsx', () => {
  it('emits no document shell, since the root layout already did', () => {
    const markup = renderToStaticMarkup(
      <ErrorBoundary error={error} unstable_retry={() => {}} />
    );

    expect(markup).not.toMatch(/<html/);
    expect(markup).not.toMatch(/<body/);
  });

  it('recovers through unstable_retry rather than reset', async () => {
    const retry = vi.fn();
    render(<ErrorBoundary error={error} unstable_retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it('falls back to generic copy when the error carries no message', () => {
    render(<ErrorBoundary error={new Error('')} unstable_retry={() => {}} />);

    expect(screen.getByText('This page could not be loaded.')).toBeInTheDocument();
  });
});
