import type { Metadata } from 'next';
import { Cormorant_Garamond, Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google';
import { defaultMetadata } from '@/config/seo';
import './globals.css';

// Typefaces.
//
// Joey's brand sheet constrains colour only — the four brand colours are the
// whole of it. The "Archivo Expanded" display face and the "Instrument Serif"
// signature face were nominations, not brand requirements, and both are
// explicitly released: the wdth 125 pin made every heading stretched-wide
// sans, which is the look that was reported as childlike.
//
// Cormorant Garamond carries display, Plus Jakarta Sans carries body. Both are
// variable-weight families, so neither needs a `weight` or an `axes` key — the
// full range loads and `font-light` / `font-bold` resolve against it.
const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = defaultMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jakarta.variable} ${geistMono.variable} h-full scroll-smooth`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
