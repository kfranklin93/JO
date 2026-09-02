'use client';

/**
 * In-layout error boundary.
 *
 * Renders inside the root layout, so the site chrome stays in place. It must
 * not emit `<html>` or `<body>` — the root layout already did, and a second
 * document shell here is what produced the nested-document bug. The shell
 * version lives in `global-error.tsx`.
 *
 * `unstable_retry` re-fetches before re-rendering, so a transient data failure
 * can actually recover. `reset` would re-render into the same error.
 */
export default function Error({
  error,
  unstable_retry,
}: Readonly<{
  error: Error & { digest?: string };
  unstable_retry: () => void;
}>) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-content flex-col justify-center px-8 py-32 lg:px-12">
      <p className="font-sans text-sm font-light uppercase tracking-[0.3em] text-cerulean">
        Error
      </p>
      <h1 className="mt-6 font-serif text-4xl font-light tracking-tight text-navy sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-6 max-w-2xl font-sans text-lg font-light leading-relaxed text-stone">
        {error.message || 'This page could not be loaded.'}
      </p>
      <div className="mt-10">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex w-fit items-center rounded-full bg-navy px-6 py-3 font-sans text-sm font-medium text-linen transition-colors hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
