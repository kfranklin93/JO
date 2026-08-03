export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      {children}
    </div>
  );
}
