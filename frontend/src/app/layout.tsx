import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Innocent Buddy | Your Empathetic AI Companion",
  description: "Chat with Innocent Buddy — a fine-tuned AI companion that understands your emotions and responds with warmth and care",
  keywords: ["AI", "chatbot", "buddy", "empathetic", "companion", "emotional support"],
  authors: [{ name: "Innocent Buddy" }],
  openGraph: {
    title: "Innocent Buddy | Your Empathetic AI Companion",
    description: "Chat with Innocent Buddy — an AI that truly understands you",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
