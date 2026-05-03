export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col justify-center px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-4 text-slate-600">
        The requested route does not exist in the current scaffold.
      </p>
    </main>
  );
}
