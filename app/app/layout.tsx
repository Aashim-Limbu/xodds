import type { Metadata } from "next";
import { Anybody, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const display = Anybody({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "xOdds — The Social Way to Bet",
  description: "Bet with friends on the 2026 World Cup — settled trustlessly by TxLINE Score Proofs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variables live on <html> so :root-level token indirection (--display etc.) can see them.
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
