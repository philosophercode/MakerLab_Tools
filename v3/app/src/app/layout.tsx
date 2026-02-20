import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ChatButton from "@/components/ChatButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MakerLab Tools — Cornell",
  description:
    "Browse, search, and learn about equipment in the Cornell MakerLab.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <header className="sticky top-0 z-50 border-b border-card-border bg-card-bg/80 backdrop-blur-sm">
          <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <a href="/" className="flex items-center gap-2 font-semibold">
              <span className="text-cornell-red text-lg">◆</span>
              <span>MakerLab Tools</span>
            </a>
            <div className="flex items-center gap-6 text-sm">
              <a href="/" className="text-muted hover:text-foreground transition-colors">
                Browse
              </a>
              <a href="/scan" className="text-muted hover:text-foreground transition-colors">
                Scan
              </a>
              <a href="/chat" className="text-muted hover:text-foreground transition-colors">
                Chat
              </a>
              <a href="/report" className="text-muted hover:text-foreground transition-colors">
                Report Issue
              </a>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <ChatButton />
      </body>
    </html>
  );
}
