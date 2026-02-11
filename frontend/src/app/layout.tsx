import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Chatbot | Premium AI Assistant",
  description: "A modern, premium AI chatbot platform powered by advanced language models",
  keywords: ["AI", "chatbot", "assistant", "language model", "GPT", "Gemini"],
  authors: [{ name: "AI Chatbot" }],
  openGraph: {
    title: "AI Chatbot | Premium AI Assistant",
    description: "A modern, premium AI chatbot platform",
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
