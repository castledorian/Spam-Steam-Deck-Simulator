import type { NextConfig } from "next";

// Site 100 % statique : publié sur GitHub Pages (ou n'importe quel hébergeur de fichiers).
// NEXT_PUBLIC_BASE_PATH vaut « /<nom-du-dépôt> » sur GitHub Pages, vide en local.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
