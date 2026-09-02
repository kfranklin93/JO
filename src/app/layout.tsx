import type { Metadata } from 'next';
import { Bellefair, Montserrat, Geist_Mono } from 'next/font/google';
import { defaultMetadata } from '@/config/seo';
import './globals.css';

// Luxury Brand Fonts
const bellefair = Bellefair({
  weight: '400',
  variable: '--font-bellefair',
  subsets: ['latin'],
  display: 'swap',
});

const montserrat = Montserrat({
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
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
      className={`${bellefair.variable} ${montserrat.variable} ${geistMono.variable} h-full scroll-smooth`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
