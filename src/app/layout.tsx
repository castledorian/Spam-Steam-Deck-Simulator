import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SpamProvider } from "@/components/SpamProvider";
import { Nav, Footer } from "@/components/Shell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07040f" };

export const metadata: Metadata = {
  title: "SpamLab — Simulateur de decks & base de données SPAM",
  description:
    "Toutes les cartes officielles de SPAM (Steam), patchs, Tox, talents et un simulateur de decks basé sur votre collection avec statistiques de victoire.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Lilita+One&display=swap" rel="stylesheet" />
        <link rel="preconnect" href="https://spamgame.com" />
      </head>
      <body className="min-h-screen antialiased">
        <SpamProvider>
          <Nav />
          <main id="contenu" tabIndex={-1} className="mx-auto outline-none w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
          <Footer />
        </SpamProvider>
      </body>
    </html>
  );
}
