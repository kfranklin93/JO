import { Header, Footer } from '@/components/layout';
import { JoeyChat } from '@/components/chat/JoeyChat';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      {/*
        Mounted on the marketing layout rather than the root one, so the panel
        follows a visitor across every public page but never appears over Joey's
        dashboard or the login screen — which share the root layout and have no
        use for a client-facing chat widget.
      */}
      <JoeyChat />
    </div>
  );
}
