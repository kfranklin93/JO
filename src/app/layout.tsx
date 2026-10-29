import type { Metadata } from 'next';
import { Archivo, Instrument_Serif, Geist_Mono } from 'next/font/google';
import { defaultMetadata } from '@/config/seo';
import './globals.css';

// Joey's brand faces.
//
// "Archivo Expanded" on the brand sheet is the wdth 125 end of the *variable*
// Archivo family, not a separate Google Fonts family. So the family is loaded
// with its `wdth` axis exposed here, and the display width is pinned to 125 by
// `--font-serif--font-variation-settings` in the @theme block of globals.css.
// Dropping `axes` would load a font that works and renders at normal width,
// which is not the brand face.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
});

// Signature/tagline face. Regular and italic only — no weight range.
//
// FOLLOW-UP (owner of EnhancedHeroSection.tsx): this face is applied only by the
// `font-signature` utility, and the single call site is HeroSection.tsx, which no
// route imports. The live hero renders no tagline and no `font-signature`, so
// Instrument Serif currently styles zero glyphs while still being preloaded. The
// load and the --font-signature token stay here for whoever adds the signature
// line to the live hero; that file is owned by another workflow, so it is not
// touched from here.
const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
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
      className={`${archivo.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full scroll-smooth`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
