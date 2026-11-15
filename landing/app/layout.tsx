import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Papastronomy — Exploring SPHEREx observations · NASA Space Apps 2026",
  description:
    "Papastronomy is an astronomical exploration platform that processes SPHEREx FITS observations, analyzes spectra across 102 infrared bands, and compares epochs to surface candidates for further scientific analysis.",
  keywords: [
    "Papastronomy",
    "SPHEREx",
    "NASA Space Apps Challenge 2026",
    "FITS",
    "Astropy",
    "WCS",
    "Planet X",
    "infrared astronomy",
  ],
  openGraph: {
    title: "Papastronomy — Exploring the universe, one observation at a time",
    description:
      "An astronomical exploration platform that transforms SPHEREx observations into new opportunities for scientific discovery.",
    images: ["/images/hero.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} bg-void antialiased`}
    >
      <body className="min-h-full bg-void font-sans text-stellar">{children}</body>
    </html>
  );
}
