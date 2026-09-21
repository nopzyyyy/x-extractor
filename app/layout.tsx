import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X Public Post Scraper & Domain Extractor",
  description: "Scrape public posts from X, inspect legacy domains (twitpic, yfrog, bit.ly), and analyze outbound URLs with an authentic flat feed replica.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 dark:bg-black text-[#0F1419] dark:text-[#F7F9F9] selection:bg-[#1D9BF0]/20">
        {children}
      </body>
    </html>
  );
}
