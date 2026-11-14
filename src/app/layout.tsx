import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "SPAM Lab — Simulateur de decks, cartes, Tox & patchs",
  description:
    "Base de données complète du jeu SPAM (Steam) : cartes officielles, passifs, Tox, talents, patchs en direct et simulateur Monte-Carlo de decks basé sur votre collection.",
};
export const viewport: Viewport = { themeColor: "#09070f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <DataProvider>
          <Nav />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-zinc-500 sm:px-6">
            Projet de fan non officiel, non affilié à Ticroco Entreprise. « SPAM », les illustrations et les données appartiennent à leurs ayants droit ; chaque illustration est créditée à son artiste sur la fiche carte.
          </footer>
        </DataProvider>
      </body>
    </html>
  );
}
