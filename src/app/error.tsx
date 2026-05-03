'use client';

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-content flex-col justify-center px-6 py-24">
          <h1 className="text-4xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-4 text-slate-600">{error.message}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex w-fit rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
