import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Offline NanoChat Workbench",
  description: "A local-first chat interface that stores conversations in SQLite and runs the model on-device.",
  keywords: ["offline", "sqlite", "local model", "nanochat", "next.js", "pytorch"],
  authors: [{ name: "Offline NanoChat Workbench" }],
  openGraph: {
    title: "Offline NanoChat Workbench",
    description: "Local SQLite chat storage with on-device model inference.",
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
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
