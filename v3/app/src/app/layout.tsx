import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ChatButton from "@/components/ChatButton";
import NavLinks from "@/components/NavLinks";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
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
            <NavLinks />
          </nav>
        </header>
        <main>{children}</main>
        <ChatButton />
      </body>
    </html>
  );
}
