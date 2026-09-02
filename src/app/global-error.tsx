'use client';

/**
 * Root-level error boundary.
 *
 * This file owns the document shell. It replaces the root layout entirely when
 * the layout itself fails, so it must render its own `<html>` and `<body>` —
 * nothing else will. The in-layout counterpart lives in `error.tsx` and must
 * NOT render a document shell, or the page ends up with two.
 *
 * `unstable_retry` re-fetches and re-renders the boundary's children. `reset`
 * only clears error state and re-renders, which on a data-driven page walks
 * straight back into the same error. The prop is destructured once here so a
 * future rename off the `unstable_` prefix is a single edit.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: Readonly<{
  error: Error & { digest?: string };
  unstable_retry: () => void;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-content flex-col justify-center px-6 py-24">
          <h1 className="font-serif text-4xl font-light tracking-tight text-navy">
            Something went wrong
          </h1>
          <p className="mt-4 font-sans font-light text-stone">{error.message}</p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-6 inline-flex w-fit rounded-full bg-navy px-5 py-3 font-sans text-sm font-medium text-linen transition-colors hover:bg-navy/90"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
