import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import NavHeader from "@/components/NavHeader";

const geistSans = localFont({ src: "../../../public/fonts/Geist-Latin.woff2", weight: "100 900", variable: "--font-geist-sans", display: "swap" });
const geistMono = localFont({ src: "../../../public/fonts/GeistMono-Latin.woff2", weight: "100 900", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "VLR Predictor - Professional Valorant Esports Analytics",
  description: "Advanced machine learning predictions for Valorant esports matches with 64.3% accuracy, real VLR.gg data integration, and comprehensive team analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <NavHeader />
        {children}
      </body>
    </html>
  );
}
